import {
  Color, DirectionalLight, HemisphereLight, MathUtils, NoToneMapping,
  PerspectiveCamera, Raycaster, Scene, Vector2, Vector3, WebGLRenderer,
} from 'three';
import type { BufferGeometry, InstancedMesh, Intersection, LineBasicMaterial, Material, Mesh, MeshLambertMaterial, Object3D } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { DRAG_PX, type View } from '../app/view';
import type { PartId } from '../model/parts';
import { EMPTY_PATH } from '../model/torquePath';
import { COLORS } from '../tokens';
import type { Assembly } from './assembly';
import { isLambert, isLine, materialsOf, partLook, type Tone } from './materials';
import { FOV, cameraPose, poseFor, type CameraPose } from './camera';
import { initialCameraState, onReset, onResize, onTouch, preferSolid, type Placement } from './cameraState';
import { poseAssembly } from './pose';

export type CameraPhase = 'start' | 'drag' | 'end';

/** A projected point, CSS px relative to the view. */
export interface ScreenPoint { x: number; y: number; visible: boolean }

export interface View3d extends View {
  resetCamera(): void;
  /** Turns the camera about the subject, rad: positive azimuth orbits left, positive polar up. */
  orbit(dAzimuth: number, dPolar: number): void;
  /** Multiplies the camera's distance by `factor` (below 1 zooms in), within the zoom limits. */
  zoom(factor: number): void;
  /**
   * Writes `world` into `out` in CSS px relative to the view (not visible when behind the camera or
   * off the view) and returns `out`. Allocates nothing.
   */
  project(world: Vector3, out: ScreenPoint): ScreenPoint;
  readonly anchors: Assembly['anchors'];
  /** Whether a solid part stands between the camera and `world`. Costs a raycast. */
  occluded(world: Vector3): boolean;
  /** The view's CSS size. */
  readonly size: { w: number; h: number };
  /** Bumps whenever the camera or the size changes, so overlays redraw only when they must. */
  readonly cameraVersion: number;
  setTorqueFlow(on: boolean): void;
  /**
   * Pointer drags of the camera: 'start' on press, 'drag' once the pointer has moved more than
   * DRAG_PX with the camera following it, 'end' on release. Wheel zoom and plain clicks are not drags.
   */
  onCamera(fn: (phase: CameraPhase) => void): () => void;
  /** Whether the WebGL context is lost right now; nothing renders until it is restored. */
  readonly contextLost: boolean;
  /** Called with true when the WebGL context is lost and false when it is restored. */
  onContextChange(fn: (lost: boolean) => void): () => void;
}

const MAX_DPR = 2;
const ZOOM = { min: 0.6, max: 6 }; // × framing radius
const POLAR = { min: MathUtils.degToRad(6), max: MathUtils.degToRad(96) }; // never below the floor
/**
 * The key light sits up, to the left of and behind the camera (camera space, in camera distances),
 * so the faces the visitor sees stay lit as they orbit.
 */
const KEY_OFFSET = new Vector3(-0.55, 0.8, 0.6);
const LIGHT = { sky: 1.7, key: 2.3 }; // lit faces land near their tokens (sampled: see the task 5 report)
/** Edge lines fade as the camera backs off, so a far model does not shimmer: opacity 1 → EDGE_FAR. */
const EDGE_FADE = { from: 4.5, to: 6, far: 0.45 }; // × framing radius
/** An anchor sits on a part's surface: hits this close in front of it are that surface, m. */
const OCCLUSION_SLACK = 0.003;

interface PartLook { fills: MeshLambertMaterial[]; edges: LineBasicMaterial[]; node: Object3D }

export function create3dView(container: HTMLElement, assembly: Assembly): View3d {
  const renderer = new WebGLRenderer({ antialias: true });
  try {
    return setUp(container, assembly, renderer);
  } catch (err) {
    // a throw after the renderer exists must not leak its WebGL context
    renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    throw err;
  }
}

function setUp(container: HTMLElement, assembly: Assembly, renderer: WebGLRenderer): View3d {
  renderer.setClearColor(COLORS.ground, 1);
  renderer.toneMapping = NoToneMapping;
  renderer.shadowMap.enabled = false;
  const canvas = renderer.domElement;
  canvas.className = 'view-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', '3D model of the clutch, six-speed gearbox, shift drum and final drive, with the torque path in orange. Drag to orbit.');
  container.append(canvas);

  const scene = new Scene();
  scene.add(assembly.root);
  const camera = new PerspectiveCamera(FOV, 1, 0.01, 20);
  scene.add(camera);
  // soft fill from the sky over a steel floor bounce (underside faces never crush to the ground colour),
  // and one key light near the camera so faces separate by tone
  scene.add(new HemisphereLight(COLORS.ink, COLORS.steel2, LIGHT.sky));
  const key = new DirectionalLight(COLORS.ink, LIGHT.key);
  scene.add(key, key.target);

  // the camera orbits the gear train; zoom limits come from the whole framing sphere
  const centre = assembly.subject.centre;
  const { radius } = assembly.framing;
  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(centre);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.enablePan = false;
  controls.minDistance = ZOOM.min * radius;
  controls.maxDistance = ZOOM.max * radius;
  controls.minPolarAngle = POLAR.min;
  controls.maxPolarAngle = POLAR.max;
  controls.rotateSpeed = 0.7;

  // ---- per-part looks: the fills to lift and the edge lines to ink on highlight ----
  const looks = new Map<PartId, PartLook>();
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const edgeMaterials: LineBasicMaterial[] = [];
  const pickable: Object3D[] = [];
  const solids: Object3D[] = []; // pickable meshes that are not ghosts: they alone hide an anchor
  const solidSet = new Set<Object3D>();
  const instanced: InstancedMesh[] = [];
  assembly.root.traverse((o) => {
    const g = (o as Mesh).geometry as BufferGeometry | undefined;
    if (g) geometries.add(g);
    const id = o.userData.partId as PartId | undefined;
    for (const m of materialsOf(o)) {
      materials.add(m);
      if (isLambert(m)) {
        // meshes sit a hair behind their own edge lines, so the lines never z-fight the faces
        m.polygonOffset = true; m.polygonOffsetFactor = 1; m.polygonOffsetUnits = 1;
      }
      if (isLine(m) && !edgeMaterials.includes(m)) edgeMaterials.push(m);
    }
    if (id === undefined) return;
    if ((o as Mesh).isMesh) {
      pickable.push(o);
      if (materialsOf(o).every((m) => m.depthWrite)) { solids.push(o); solidSet.add(o); }
      if ((o as InstancedMesh).isInstancedMesh) instanced.push(o as InstancedMesh);
    }
    let look = looks.get(id);
    if (!look) { look = { fills: [], edges: [], node: assembly.node(id) }; looks.set(id, look); }
    for (const m of materialsOf(o)) {
      if (isLambert(m) && !look.fills.includes(m)) look.fills.push(m);
      else if (isLine(m) && !look.edges.includes(m)) look.edges.push(m);
    }
  });

  const SIGNAL = new Color(COLORS.signal), INK = new Color(COLORS.ink), THIRD = new Color(COLORS.third);
  /**
   * A part as setTorque leaves it, or highlighted: partLook keeps a part on the torque path at the
   * shared torque colour and glows it more, and lifts a steel part toward ink; edges go ink.
   */
  const paint = (look: PartLook, lit: boolean): void => {
    const face = (look.node.userData.faceTorque as number | undefined) ?? 0;
    const glow = (look.node.userData.glow as number | undefined) ?? 0;
    const onPath = ((look.node.userData.torque as number | undefined) ?? 0) > 0;
    for (const m of look.fills) {
      const tone = m.userData.tone as Tone | undefined;
      if (tone === undefined) continue;
      partLook(m.color, m.emissive, tone, face, glow, lit);
    }
    for (const m of look.edges) m.color.copy(lit ? INK : onPath ? SIGNAL : THIRD);
  };
  let highlighted: PartId | null = null;
  const setHighlight = (part: PartId | null): void => {
    if (part === highlighted) return;
    const before = highlighted === null ? undefined : looks.get(highlighted);
    if (before) paint(before, false);
    highlighted = part;
    const now = part === null ? undefined : looks.get(part);
    if (now) paint(now, true);
  };

  // ---- camera ----
  let width = 0, height = 0;
  const size = { w: 0, h: 0 };
  const cam = initialCameraState<Vector3>(); // touched, inset and the parked camera (cameraState.ts)
  let placing = false; // the view itself is moving the camera: not the visitor
  let version = 0;
  let placedPose: CameraPose | null = null;
  const tmp = new Vector3();
  const target = new Vector3();
  /** Puts the camera at its placement at once, dropping any damping momentum left from a drag. */
  const place = (p: Placement<Vector3>): void => {
    placing = true;
    controls.enableDamping = false;
    controls.update(); // without damping, update spends and clears the pending rotation and zoom
    const pose = cameraPose(assembly.subject, p.pose, width > 0 && height > 0 ? width / height : 1.5);
    target.copy(pose.target);
    camera.position.copy(p.at ?? pose.position);
    camera.lookAt(target);
    controls.target.copy(target);
    controls.update();
    controls.enableDamping = true;
    placing = false;
    placedPose = p.pose;
    version++;
  };
  const resetCamera = (): void => place(onReset(cam, width));
  const touch = (): void => onTouch(cam);

  // pointer drags hide the labels; wheel zoom and a click (even during a glide) do not
  const cameraListeners = new Set<(p: CameraPhase) => void>();
  const emit = (p: CameraPhase): void => { for (const fn of cameraListeners) fn(p); };
  let press: { x: number; y: number; id: number } | null = null;
  let dragging = false;
  const onPointerDown = (e: PointerEvent): void => {
    press = { x: e.clientX, y: e.clientY, id: e.pointerId };
    dragging = false;
    emit('start');
  };
  const onPointerMove = (e: PointerEvent): void => {
    if (!press || dragging || e.pointerId !== press.id) return;
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > DRAG_PX) { dragging = true; touch(); emit('drag'); }
  };
  const onPointerEnd = (e: PointerEvent): void => {
    if (!press || e.pointerId !== press.id) return;
    press = null;
    dragging = false;
    emit('end');
  };
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerEnd);
  canvas.addEventListener('pointercancel', onPointerEnd);
  const onChange = (): void => {
    version++;
    if (!placing && press === null) touch(); // a wheel or trackpad zoom
  };
  controls.addEventListener('change', onChange);

  // ---- context loss ----
  const contextListeners = new Set<(lost: boolean) => void>();
  let lost = false;
  const onLost = (e: Event): void => {
    e.preventDefault(); // lets the browser restore it
    lost = true;
    for (const fn of contextListeners) fn(true);
  };
  const onRestored = (): void => {
    lost = false;
    renderer.setClearColor(COLORS.ground, 1); // the renderer rebuilds its state on restore, clear colour included
    for (const fn of contextListeners) fn(false);
  };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);
  const onContextChange = (fn: (lost: boolean) => void): (() => void) => {
    contextListeners.add(fn);
    return () => { contextListeners.delete(fn); };
  };

  // ---- picking ----
  const raycaster = new Raycaster();
  const ndc = new Vector2();
  const hits: Intersection[] = [];

  let torqueFlow = true;
  let edgeOpacity = -1;
  /** Edge opacity for the camera distance; an edge is transparent only while it is see-through. */
  const fadeEdges = (): void => {
    const d = camera.position.distanceTo(controls.target) / radius;
    const t = MathUtils.clamp((d - EDGE_FADE.from) / (EDGE_FADE.to - EDGE_FADE.from), 0, 1);
    const opacity = 1 - t * (1 - EDGE_FADE.far);
    if (Math.abs(opacity - edgeOpacity) <= 1e-3) return;
    edgeOpacity = opacity;
    for (const m of edgeMaterials) {
      if (m.userData.ghost === true) continue; // ghost edges keep their opacity: the wheel must read from afar
      m.opacity = ((m.userData.baseOpacity as number | undefined) ?? 1) * opacity;
      const see = m.opacity < 1;
      if (m.transparent !== see) { m.transparent = see; m.needsUpdate = true; }
    }
  };

  resetCamera();

  return {
    render(state, path) {
      if (lost || width <= 0 || height <= 0 || (typeof document !== 'undefined' && document.hidden)) return;
      poseAssembly(assembly, state, torqueFlow ? path : EMPTY_PATH);
      const look = highlighted === null ? undefined : looks.get(highlighted);
      if (look) paint(look, true); // setTorque may have repainted it
      controls.update();
      // the key light follows the camera
      key.position.copy(KEY_OFFSET).applyQuaternion(camera.quaternion)
        .multiplyScalar(camera.position.distanceTo(controls.target)).add(camera.position);
      key.target.position.copy(controls.target);
      fadeEdges();
      renderer.render(scene, camera);
    },
    resize(w, h, dpr) {
      if (w <= 0 || h <= 0) { width = 0; height = 0; size.w = 0; size.h = 0; return; }
      width = w; height = h; size.w = w; size.h = h;
      renderer.setPixelRatio(Math.min(MAX_DPR, dpr > 0 ? dpr : 1));
      renderer.setSize(w, h, false); // CSS size comes from the stylesheet
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      const inset = container.closest('.stage-inset') !== null;
      const placement = onResize(cam, w, inset, () => ({ pose: placedPose ?? poseFor(w, false), at: camera.position.clone() }));
      if (placement) place(placement);
      version++;
    },
    pick(x, y) {
      if (width <= 0 || height <= 0) return null;
      ndc.set((x / width) * 2 - 1, -(y / height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      hits.length = 0;
      raycaster.intersectObjects(pickable, false, hits);
      // a solid part seen through a ghost wins over the ghost
      const hit = preferSolid(hits, (h) => solidSet.has(h.object));
      return hit ? (hit.object.userData.partId as PartId) : null;
    },
    setHighlight,
    dispose() {
      controls.removeEventListener('change', onChange);
      controls.dispose();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerEnd);
      canvas.removeEventListener('pointercancel', onPointerEnd);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      cameraListeners.clear(); contextListeners.clear();
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      for (const m of instanced) m.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
    resetCamera,
    orbit(dAzimuth, dPolar) {
      touch();
      controls.rotateLeft(dAzimuth);
      controls.rotateUp(dPolar);
    },
    zoom(factor) {
      if (!(factor > 0)) return;
      touch();
      controls.dollyIn(factor); // three's dolly multiplies the distance by its scale
    },
    project(world, out) {
      tmp.copy(world).project(camera);
      out.visible = tmp.z > -1 && tmp.z < 1 && Math.abs(tmp.x) <= 1 && Math.abs(tmp.y) <= 1;
      out.x = ((tmp.x + 1) / 2) * width;
      out.y = ((1 - tmp.y) / 2) * height;
      return out;
    },
    anchors: assembly.anchors,
    occluded(world) {
      const dist = tmp.copy(world).sub(camera.position).length();
      raycaster.set(camera.position, tmp.normalize());
      raycaster.near = 0; raycaster.far = dist - OCCLUSION_SLACK;
      hits.length = 0;
      raycaster.intersectObjects(solids, false, hits);
      raycaster.far = Infinity;
      return hits.length > 0;
    },
    size,
    get cameraVersion() { return version; },
    setTorqueFlow(on) { torqueFlow = on; },
    onCamera(fn) { cameraListeners.add(fn); return () => { cameraListeners.delete(fn); }; },
    get contextLost() { return lost; },
    onContextChange,
  };
}

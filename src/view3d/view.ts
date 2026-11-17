import {
  Color, DirectionalLight, HemisphereLight, LineBasicMaterial, MathUtils, MeshLambertMaterial, NoToneMapping,
  PerspectiveCamera, Raycaster, Scene, Vector2, Vector3, WebGLRenderer,
} from 'three';
import type { BufferGeometry, Intersection, Material, Mesh, Object3D } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { View } from '../app/view';
import type { PartId } from '../model/parts';
import type { TorquePath } from '../model/torquePath';
import { COLORS } from '../ui/tokens';
import type { Assembly } from './assembly';
import type { Tone } from './materials';
import { FOV, HOME, NARROW, cameraPose, type CameraPose } from './camera';
import { poseAssembly } from './pose';

export type CameraPhase = 'start' | 'drag' | 'end';

export interface View3d extends View {
  resetCamera(): void;
  /** Turns the camera about the framing centre, rad: positive azimuth orbits left, positive polar up. */
  orbit(dAzimuth: number, dPolar: number): void;
  /** Multiplies the camera's distance by `factor` (below 1 zooms in), within the zoom limits. */
  zoom(factor: number): void;
  /** A world point in CSS px relative to the view; not visible when behind the camera or off the view. */
  project(world: Vector3): { x: number; y: number; visible: boolean };
  readonly anchors: Assembly['anchors'];
  /** Whether a part of the model stands between the camera and `world`. Costs a raycast. */
  occluded(world: Vector3): boolean;
  /** The view's CSS size. */
  readonly size: { w: number; h: number };
  /** Bumps whenever the camera or the size changes, so overlays redraw only when they must. */
  readonly cameraVersion: number;
  setTorqueFlow(on: boolean): void;
  /** Camera drags: 'start' on press, 'drag' once the camera actually moves, 'end' on release. */
  onCamera(fn: (phase: CameraPhase) => void): () => void;
  /** WebGL context lost (true) and restored (false). */
  onContext(fn: (lost: boolean) => void): () => void;
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
/** A highlighted part's fill moves this far toward ink. */
const LIFT = 0.22;
/** An anchor sits on a part's surface: hits this close in front of it are that surface, m. */
const OCCLUSION_SLACK = 0.003;
const EMPTY: TorquePath = { parts: [], torque: 0, slipping: false, reach: 'none' };

const isLambert = (m: Material): m is MeshLambertMaterial => (m as MeshLambertMaterial).isMeshLambertMaterial === true;
const isLineMat = (m: Material): m is LineBasicMaterial => (m as LineBasicMaterial).isLineBasicMaterial === true;
const materialsOf = (o: Object3D): Material[] => {
  const m = (o as Mesh).material;
  return m === undefined ? [] : Array.isArray(m) ? m : [m];
};

interface PartLook { fills: MeshLambertMaterial[]; edges: LineBasicMaterial[]; node: Object3D }

export function create3dView(container: HTMLElement, assembly: Assembly): View3d {
  const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
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
  // soft fill from the sky, one key light near the camera so faces separate by tone
  scene.add(new HemisphereLight(COLORS.ink, COLORS.steel2, LIGHT.sky)); // a steel floor bounce keeps underside faces off the ground colour
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
      if (isLineMat(m)) { m.transparent = true; edgeMaterials.push(m); }
    }
    if (id === undefined) return;
    if ((o as Mesh).isMesh) {
      pickable.push(o);
      if (materialsOf(o).every((m) => m.depthWrite)) solids.push(o);
    }
    let look = looks.get(id);
    if (!look) { look = { fills: [], edges: [], node: assembly.node(id) }; looks.set(id, look); }
    for (const m of materialsOf(o)) {
      if (isLambert(m) && !look.fills.includes(m)) look.fills.push(m);
      else if (isLineMat(m) && !look.edges.includes(m)) look.edges.push(m);
    }
  });

  const TONES = Object.fromEntries((['steel1', 'steel2', 'steel3', 'steel4', 'steel5'] as const).map((t) => [t, new Color(COLORS[t])])) as Record<Tone, Color>;
  const SIGNAL = new Color(COLORS.signal), INK = new Color(COLORS.ink), THIRD = new Color(COLORS.third);
  /** A part as setTorque leaves it, its fills optionally lifted toward ink and its edges inked. */
  const paint = (look: PartLook, lit: boolean): void => {
    const face = (look.node.userData.faceTorque as number | undefined) ?? 0;
    const onPath = ((look.node.userData.torque as number | undefined) ?? 0) > 0;
    for (const m of look.fills) {
      const tone = m.userData.tone as Tone | undefined;
      if (tone === undefined) continue;
      m.color.copy(TONES[tone]).lerp(SIGNAL, face).lerp(INK, lit ? LIFT : 0);
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
  let touched = false; // the visitor has moved the camera since the last reset
  let version = 0;
  const tmp = new Vector3();
  // narrow stages and the inset take a more head-on framing that fills the width
  const narrowScreen = typeof matchMedia === 'undefined' ? null : matchMedia('(max-width: 899.98px)');
  let inInset = false;
  const homePose = (): CameraPose => (inInset || narrowScreen?.matches ? NARROW : HOME);
  const placeCamera = (pose: CameraPose): void => {
    const { position } = cameraPose(assembly.subject, pose, width > 0 && height > 0 ? width / height : 1.5);
    camera.position.copy(position);
    camera.lookAt(centre);
    controls.target.copy(centre);
    controls.update();
    version++;
  };
  const resetCamera = (): void => { placeCamera(homePose()); touched = false; };
  /** The visitor's camera while the view sits in the inset, given back when it returns to the stage. */
  let parked: Vector3 | null = null;

  // drags hide the labels; a press alone (a click to select) does not count as camera use
  const cameraListeners = new Set<(p: CameraPhase) => void>();
  const emit = (p: CameraPhase): void => { for (const fn of cameraListeners) fn(p); };
  let pressed = false, dragged = false;
  const onStart = (): void => { pressed = true; dragged = false; emit('start'); };
  const onChange = (): void => {
    version++;
    if (pressed) { touched = true; if (!dragged) { dragged = true; emit('drag'); } }
  };
  const onEnd = (): void => { pressed = false; emit('end'); };
  controls.addEventListener('start', onStart);
  controls.addEventListener('change', onChange);
  controls.addEventListener('end', onEnd);

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

  // ---- picking ----
  const raycaster = new Raycaster();
  const ndc = new Vector2();
  const hits: Intersection[] = [];

  let torqueFlow = true;
  let edgeOpacity = 1;

  resetCamera();

  return {
    render(state, path) {
      if (lost || width <= 0 || height <= 0 || (typeof document !== 'undefined' && document.hidden)) return;
      poseAssembly(assembly, state, torqueFlow ? path : EMPTY);
      const look = highlighted === null ? undefined : looks.get(highlighted);
      if (look) paint(look, true); // setTorque may have repainted it
      controls.update();
      // the key light follows the camera
      key.position.copy(KEY_OFFSET).applyQuaternion(camera.quaternion)
        .multiplyScalar(camera.position.distanceTo(controls.target)).add(camera.position);
      key.target.position.copy(controls.target);
      const d = camera.position.distanceTo(controls.target) / radius;
      const t = MathUtils.clamp((d - EDGE_FADE.from) / (EDGE_FADE.to - EDGE_FADE.from), 0, 1);
      const opacity = 1 - t * (1 - EDGE_FADE.far);
      if (Math.abs(opacity - edgeOpacity) > 1e-3) {
        edgeOpacity = opacity;
        for (const m of edgeMaterials) m.opacity = ((m.userData.baseOpacity as number | undefined) ?? 1) * opacity;
      }
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
      if (inset !== inInset) {
        inInset = inset;
        if (inset) { parked = touched ? camera.position.clone() : null; placeCamera(NARROW); }
        else if (parked) { camera.position.copy(parked); camera.lookAt(centre); controls.update(); parked = null; }
        else resetCamera();
      } else if (!touched || inset) {
        placeCamera(inset ? NARROW : homePose()); // keep the composition until the visitor moves the camera
      }
      version++;
    },
    pick(x, y) {
      if (width <= 0 || height <= 0) return null;
      ndc.set((x / width) * 2 - 1, -(y / height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      hits.length = 0;
      raycaster.intersectObjects(pickable, false, hits);
      // a solid part seen through a ghost wins over the ghost
      const hit = hits.find((h) => solids.includes(h.object)) ?? hits[0];
      return hit ? (hit.object.userData.partId as PartId) : null;
    },
    setHighlight,
    dispose() {
      controls.removeEventListener('start', onStart);
      controls.removeEventListener('change', onChange);
      controls.removeEventListener('end', onEnd);
      controls.dispose();
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      cameraListeners.clear(); contextListeners.clear();
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      renderer.dispose();
      canvas.remove();
    },
    resetCamera,
    orbit(dAzimuth, dPolar) {
      touched = true;
      controls.rotateLeft(dAzimuth);
      controls.rotateUp(dPolar);
    },
    zoom(factor) {
      if (!(factor > 0)) return;
      touched = true;
      controls.dollyIn(factor); // three's dolly multiplies the distance by its scale
    },
    project(world) {
      tmp.copy(world).project(camera);
      const visible = tmp.z > -1 && tmp.z < 1 && Math.abs(tmp.x) <= 1 && Math.abs(tmp.y) <= 1;
      return { x: ((tmp.x + 1) / 2) * width, y: ((1 - tmp.y) / 2) * height, visible };
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
    onContext(fn) { contextListeners.add(fn); return () => { contextListeners.delete(fn); }; },
  };
}

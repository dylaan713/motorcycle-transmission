import { Color, EdgesGeometry, Group, LineBasicMaterial, LineSegments, Mesh, MeshLambertMaterial } from 'three';
import type { BufferGeometry, Material, Object3D } from 'three';
import { COLORS } from '../ui/tokens';

/**
 * Materials for the 3D model. Parts are lit Lambert surfaces in the steel tokens with edge lines in
 * --third; a part carrying torque shifts toward --signal, glows slightly and its edges turn signal.
 * Context parts can be drawn as ghosts. Every call makes new material instances, so one part can
 * light without lighting another.
 */

export type Tone = 'steel1' | 'steel2' | 'steel3' | 'steel4' | 'steel5';

const SIGNAL = new Color(COLORS.signal);
const THIRD = new Color(COLORS.third);
/** Emissive strength at full torque, as a fraction of the signal colour. */
const GLOW = 0.35;
const DEFAULT_EDGE_DEG = 28;

/** A part surface in `tone`. Smooth shading: the geometries carry their own crease normals. */
export function partMaterial(tone: Tone): MeshLambertMaterial {
  const m = new MeshLambertMaterial({ color: COLORS[tone], flatShading: false });
  m.userData.tone = tone;
  return m;
}

export function edgeMaterial(): LineBasicMaterial {
  return new LineBasicMaterial({ color: COLORS.third });
}

// Parts that share a geometry (plates, chain links) share its edge geometry too.
const edgesCache = new WeakMap<BufferGeometry, Map<number, EdgesGeometry>>();
function edgesOf(geometry: BufferGeometry, thresholdDeg: number): EdgesGeometry {
  let byAngle = edgesCache.get(geometry);
  if (!byAngle) { byAngle = new Map(); edgesCache.set(geometry, byAngle); }
  let e = byAngle.get(thresholdDeg);
  if (!e) { e = new EdgesGeometry(geometry, thresholdDeg); byAngle.set(thresholdDeg, e); }
  return e;
}

/** The part's mesh and its edge lines (edges where faces meet at more than `thresholdDeg`). */
export function withEdges(geometry: BufferGeometry, tone: Tone, thresholdDeg = DEFAULT_EDGE_DEG): Group {
  const g = new Group();
  g.add(new Mesh(geometry, partMaterial(tone)));
  g.add(new LineSegments(edgesOf(geometry, thresholdDeg), edgeMaterial()));
  return g;
}

const isLambert = (m: Material): m is MeshLambertMaterial => (m as MeshLambertMaterial).isMeshLambertMaterial === true;
const isLine = (m: Material): m is LineBasicMaterial => (m as LineBasicMaterial).isLineBasicMaterial === true;
const materialsOf = (o: Object3D): Material[] => {
  const m = (o as Mesh).material as Material | Material[] | undefined;
  return m === undefined ? [] : Array.isArray(m) ? m : [m];
};

/** A ghost's edge-line opacity, and its faces' (faint enough to read as glass, never as a solid). */
export const GHOST_EDGE_OPACITY = 0.35;
export const GHOST_FACE_OPACITY = 0.06;
/** Ghosts draw after every solid part, so their faces never hide the mechanism. */
const GHOST_RENDER_ORDER = 10;

/**
 * Draw (or stop drawing) everything under `node` as a ghost: edge lines in --third at
 * GHOST_EDGE_OPACITY, faces at GHOST_FACE_OPACITY that write no depth, so a ghost never occludes a
 * solid part. Kept in userData.ghost; edge materials carry their resting opacity in
 * userData.baseOpacity for a renderer that fades edges with distance.
 */
export function setGhost(node: Object3D, ghost: boolean): void {
  node.userData.ghost = ghost;
  node.traverse((o) => {
    if (o !== node && o.userData.ghost !== undefined && o.userData.ghost !== ghost) return; // a nested override
    o.renderOrder = ghost ? GHOST_RENDER_ORDER : 0;
    for (const m of materialsOf(o)) {
      if (isLambert(m)) {
        m.transparent = ghost; m.opacity = ghost ? GHOST_FACE_OPACITY : 1; m.depthWrite = !ghost;
      } else if (isLine(m)) {
        m.transparent = ghost; m.opacity = ghost ? GHOST_EDGE_OPACITY : 1;
        m.userData.baseOpacity = m.opacity;
      }
      m.needsUpdate = true;
    }
  });
}

/**
 * Show how much torque a part carries, 0..1, as a path: its edge lines turn full --signal and its
 * faces lerp from their tone to the signal colour by `amount` (lighting still shades them, so form
 * stays readable), glowing with signal × 0.35 × amount. A context part (userData.context: the rear
 * wheel, the crank) keeps its faces: only its edges carry the signal. At 0 everything returns to
 * tone and --third. The path amount is kept in userData.torque, the faces' in userData.faceTorque.
 */
export function setTorque(group: Object3D, amount: number): void {
  const a = Math.min(1, Math.max(0, Number.isFinite(amount) ? amount : 0));
  if (group.userData.torque === a) return;
  const face = group.userData.context === true ? 0 : a;
  group.userData.torque = a;
  group.userData.faceTorque = face;
  group.traverse((o) => {
    for (const m of materialsOf(o)) {
      if (isLine(m)) { m.color.copy(a > 0 ? SIGNAL : THIRD); continue; }
      if (!isLambert(m)) continue;
      const tone = m.userData.tone as Tone | undefined;
      if (tone === undefined) continue;
      m.color.set(COLORS[tone]).lerp(SIGNAL, face);
      m.emissive.copy(SIGNAL).multiplyScalar(GLOW * face);
    }
  });
}

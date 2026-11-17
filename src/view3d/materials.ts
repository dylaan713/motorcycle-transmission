import { Color, EdgesGeometry, Group, LineBasicMaterial, LineSegments, Mesh, MeshLambertMaterial } from 'three';
import type { BufferGeometry, Material, Object3D } from 'three';
import { COLORS } from '../ui/tokens';

/**
 * Materials for the 3D model. Parts are lit Lambert surfaces in the steel tokens with edge lines in
 * --third; a part carrying torque shifts toward --signal and glows slightly. Every call makes new
 * material instances, so one part can light without lighting another.
 */

export type Tone = 'steel1' | 'steel2' | 'steel3' | 'steel4' | 'steel5';

const SIGNAL = new Color(COLORS.signal);
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

/**
 * Show how much torque a part carries, 0..1: every mesh under `group` lerps from its tone toward
 * the signal colour and glows with signal × 0.35 × amount. The amount is kept in userData.torque.
 */
export function setTorque(group: Object3D, amount: number): void {
  const a = Math.min(1, Math.max(0, Number.isFinite(amount) ? amount : 0));
  if (group.userData.torque === a) return;
  group.userData.torque = a;
  group.traverse((o) => {
    if (!(o as Mesh).isMesh) return;
    const mats = (o as Mesh).material;
    for (const m of Array.isArray(mats) ? mats : [mats]) {
      if (!isLambert(m)) continue;
      const tone = m.userData.tone as Tone | undefined;
      if (tone === undefined) continue;
      m.color.set(COLORS[tone]).lerp(SIGNAL, a);
      m.emissive.copy(SIGNAL).multiplyScalar(GLOW * a);
    }
  });
}

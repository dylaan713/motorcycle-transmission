import { Color, EdgesGeometry, Group, LineBasicMaterial, LineSegments, Mesh, MeshLambertMaterial } from 'three';
import type { BufferGeometry, Material, Object3D } from 'three';
import { COLORS } from '../tokens';

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
/** The edge lines of a geometry (faces meeting at more than `thresholdDeg`), cached per geometry. */
export function edgesOf(geometry: BufferGeometry, thresholdDeg = DEFAULT_EDGE_DEG): EdgesGeometry {
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

export const isLambert = (m: Material): m is MeshLambertMaterial => (m as MeshLambertMaterial).isMeshLambertMaterial === true;
export const isLine = (m: Material): m is LineBasicMaterial => (m as LineBasicMaterial).isLineBasicMaterial === true;
/** The materials an object draws with, none for a group. */
export const materialsOf = (o: Object3D): Material[] => {
  const m = (o as Mesh).material as Material | Material[] | undefined;
  return m === undefined ? [] : Array.isArray(m) ? m : [m];
};

/** A ghost's edge-line opacity, and its faces' (faint enough to read as glass, never as a solid). */
export const GHOST_EDGE_OPACITY = 0.5;
export const GHOST_FACE_OPACITY = 0.06;
/** Ghosts draw after every solid part, so their faces never hide the mechanism. */
const GHOST_RENDER_ORDER = 10;

const TONE_COLORS = Object.fromEntries(
  (['steel1', 'steel2', 'steel3', 'steel4', 'steel5'] as const).map((t) => [t, new Color(COLORS[t])]),
) as Record<Tone, Color>;
const luminance = (c: Color): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; // linear components
const SIGNAL_LUMINANCE = luminance(SIGNAL);

/**
 * The fill of a `tone` part carrying `amount` (0..1) of torque, written into `target`. At 0 the
 * tone; above 0 always the signal's hue, its brightness lerped from the tone's toward the signal's
 * by `amount`, so it reaches the signal at 1. A plain RGB lerp from the blue-grey steels would pass
 * through pink and brown; this keeps every lit part on the path recognisably orange.
 */
export function torqueColor(target: Color, tone: Tone, amount: number): Color {
  const base = TONE_COLORS[tone];
  if (!(amount > 0)) return target.copy(base);
  const from = luminance(base) / SIGNAL_LUMINANCE;
  return target.copy(SIGNAL).multiplyScalar(Math.min(1, from + (1 - from) * Math.min(1, amount)));
}

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
        m.userData.ghost = ghost; // a renderer keeps ghost edges out of its distance fade
      }
      m.needsUpdate = true;
    }
  });
}

/**
 * Two tiers of the torque path's faces. The gearbox's working parts (tier 1: the engaged pair, its
 * slider and both shafts) light at the full amount and glow; the parts that carry the drive to and
 * from them (tier 2: primary gear, basket, plates, hub, sprockets, chain) light at TIER_2 × the
 * amount with no glow, so the eye finds the gear pair first. Edges carry the full signal in both.
 */
export type TorqueTier = 1 | 2;
export const TIER_2 = 0.6;

/**
 * Show how much torque a part carries, 0..1, as a path: its edge lines turn full --signal and its
 * faces lerp from their tone to the signal colour by `amount` (by TIER_2 × amount in tier 2;
 * lighting still shades them, so form stays readable), tier 1 glowing with signal × 0.35 × amount.
 * A context part (userData.context: the rear wheel, the crank) keeps its faces: only its edges carry
 * the signal. At 0 everything returns to tone and --third. The path amount is kept in
 * userData.torque, the faces' in userData.faceTorque and their glow in userData.glow.
 */
export function setTorque(group: Object3D, amount: number, tier: TorqueTier = 1): void {
  const a = Math.min(1, Math.max(0, Number.isFinite(amount) ? amount : 0));
  if (group.userData.torque === a && group.userData.tier === tier) return;
  const face = group.userData.context === true ? 0 : tier === 2 ? TIER_2 * a : a;
  const glow = tier === 2 ? 0 : face;
  group.userData.torque = a;
  group.userData.tier = tier;
  group.userData.faceTorque = face;
  group.userData.glow = glow;
  group.traverse((o) => {
    for (const m of materialsOf(o)) {
      if (isLine(m)) { m.color.copy(a > 0 ? SIGNAL : THIRD); continue; }
      if (!isLambert(m)) continue;
      const tone = m.userData.tone as Tone | undefined;
      if (tone === undefined) continue;
      torqueColor(m.color, tone, face);
      m.emissive.copy(SIGNAL).multiplyScalar(GLOW * glow);
    }
  });
}

/** Emissive strength of a highlighted part on the torque path, as a fraction of the signal colour. */
export const HIGHLIGHT_GLOW = 0.6;
/** A highlighted steel part's fill moves this far toward ink. */
export const HIGHLIGHT_LIFT = 0.22;
const INK = new Color(COLORS.ink);

/**
 * A part's fill and glow as drawn, hovered or selected (`lit`) or not, given its face torque and
 * path glow. On the path a highlight never changes the fill's colour, which must stay the shared
 * torque colour: it glows more instead (and the caller inks the edges). Off the path a highlight
 * lifts the steel toward ink. Writes `color` and `emissive`; returns nothing.
 */
export function partLook(color: Color, emissive: Color, tone: Tone, face: number, glow: number, lit: boolean): void {
  torqueColor(color, tone, face);
  if (face > 0) {
    emissive.copy(SIGNAL).multiplyScalar(lit ? Math.max(HIGHLIGHT_GLOW * Math.max(face, TIER_2), GLOW * glow) : GLOW * glow);
  } else {
    color.lerp(INK, lit ? HIGHLIGHT_LIFT : 0);
    emissive.setRGB(0, 0, 0);
  }
}

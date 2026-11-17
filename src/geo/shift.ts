import type { BufferGeometry } from 'three';
import { Matrix4, Vector2 } from 'three';
import { SLIDER_TRAVEL } from '../model/geometry';
import { PARAMS } from '../sim/params';
import { grooveCommand } from '../sim/shiftDrum';
import type { SliderId } from '../sim/types';
import { deg } from '../sim/units';
import { DIM } from './dimensions';
import { arc, capsule, circle, polar } from './outline';
import { lathe, polygonCap, prism, toGeometry, transform, translate } from './mesh';
import type { Solid } from './mesh';

/**
 * Shift drum, forks, star wheel, detent arm, pawl and pedal. Every part's axis is +x.
 *
 * The drum and the star wheel are drawn in drum angle for a drum that turns by `turn` × its drum
 * angle about +x. With the default turn of -1, the point of the surface at angle θ is where a fixed
 * follower sits when the drum has turned to θ, so a part whose follower (fork pin or detent roller)
 * is at angle φ about the drum axis is posed by rotating the drum by φ - drumAngle. With turn +1
 * the surface is the mirror image (the point at angle -θ reads θ) and the pose is φ + drumAngle.
 */

const SLIDERS: SliderId[] = ['A', 'B', 'C'];
const ANGLE_STEPS = 240;
const AXIAL_STEPS = 80;
/** Grooves continue straight this far beyond first (0°) and sixth (300°) so a pin there stays covered. */
const GROOVE_RUNOUT = deg(10);
/** A groove wall is this far either side of its exact edge, m. */
const WALL_HALF = 0.0002;
const FORK_BOSS = DIM.fork.rodRadius + 0.005;
const FORK_BOSS_LENGTH = 0.018;

/** Radial depth of a fork's claw, from the collar radius outward, m. */
export const FORK_CLAW_DEPTH = 0.006;
/** Distance from a fork's rod axis to the tip of its guide pin, m. */
export const FORK_PIN_REACH = FORK_BOSS + 0.007;
/** Detent arm: roller centre distance from the pivot, and roller radius, m. */
export const DETENT_ARM = DIM.detentArm;

/** Axial offset of a slider's groove from its centre at a drum angle, m. */
export const grooveAxialOffset = (slider: SliderId, drumAngle: number): number =>
  grooveCommand(slider, drumAngle) * SLIDER_TRAVEL;

/** Depth of the star wheel's seats below its rim, m: neutral's is shallower. */
export const STAR_SEAT_DEPTH = { gear: 0.003, neutral: 0.0015 } as const;
/** Radius of each star wheel seat: the detent roller's, with 0.1 mm to spare, m. */
export const STAR_SEAT_RADIUS = DETENT_ARM.rollerRadius + 0.0001;

// Each detent is a circular seat of STAR_SEAT_RADIUS cut into the rim, its floor `depth` below the
// rim on the detent's ray, so the roller drops right in. Neutral's seat is shallower.
const DETENTS = Object.entries(PARAMS.drum.detents).map(([name, d]) => {
  const depth = name === 'N' ? STAR_SEAT_DEPTH.neutral : STAR_SEAT_DEPTH.gear;
  const centre = DIM.starWheel.radius - depth + STAR_SEAT_RADIUS; // seat centre, from the wheel's axis
  return { angle: deg(d), depth, centre };
});

/** Angles where each seat meets the rim, two per detent, ascending. */
export const STAR_SEAT_EDGES: readonly number[] = DETENTS.flatMap((d) => {
  const R = DIM.starWheel.radius, rs = STAR_SEAT_RADIUS;
  const half = Math.acos((R * R + d.centre * d.centre - rs * rs) / (2 * R * d.centre));
  return [d.angle - half, d.angle + half];
}).sort((p, q) => p - q);

/**
 * Star wheel radius at drum angle θ: the rim, except across each detent's seat, where the profile
 * follows the seat circle. Between neighbouring seats the rim is a plateau at full radius.
 */
export function starWheelRadiusAt(angle: number): number {
  const R = DIM.starWheel.radius, rs = STAR_SEAT_RADIUS;
  let r: number = R;
  for (const d of DETENTS) {
    const off = Math.atan2(Math.sin(angle - d.angle), Math.cos(angle - d.angle));
    const s = d.centre * Math.sin(off);
    if (Math.abs(s) >= rs || Math.cos(off) <= 0) continue;
    // nearer intersection of the ray at `off` with the seat circle
    r = Math.min(r, d.centre * Math.cos(off) - Math.sqrt(rs * rs - s * s));
  }
  return Math.max(r, 0);
}

/**
 * The drum: an (angle, x) grid whose radius drops by the groove depth inside each slider's groove.
 * The vertices either side of every groove edge are moved onto it, so walls are steep and follow
 * the groove exactly instead of stepping by a grid cell.
 *
 * `followerOffsets[s]` is how far round the drum (from +y toward +z) slider s's follower sits from
 * the reference follower the drum is posed against; that slider's groove is cut that much further
 * round, so every follower reads the same drum angle. Missing offsets are 0. `turn` is the drum's
 * sense of turn (see the top of this file).
 */
export function shiftDrum(
  length: number, grooveCentres: Record<SliderId, number>, followerOffsets: Partial<Record<SliderId, number>> = {},
  turn: 1 | -1 = -1,
): BufferGeometry {
  const { radius: R, grooveDepth, grooveWidth } = DIM.drum;
  const angles = Array.from({ length: ANGLE_STEPS }, (_, j) => (2 * Math.PI * j) / ANGLE_STEPS);
  const TWO_PI = 2 * Math.PI;
  const drumAngleAt = (a: number): number => {
    const w = ((a % TWO_PI) + TWO_PI) % TWO_PI;
    return w > TWO_PI - GROOVE_RUNOUT ? w - TWO_PI : w;
  };
  const rows = angles.map((a) => {
    const xs = Array.from({ length: AXIAL_STEPS + 1 }, (_, i) => -length / 2 + (length * i) / AXIAL_STEPS);
    const centres = SLIDERS.flatMap((s) => {
      const drum = drumAngleAt(-turn * (a - (followerOffsets[s] ?? 0)));
      const used = drum >= -GROOVE_RUNOUT && drum <= deg(300) + GROOVE_RUNOUT;
      return used ? [grooveCentres[s] + grooveAxialOffset(s, Math.min(Math.max(drum, 0), deg(300)))] : [];
    });
    const inside = (x: number): boolean => centres.some((c) => Math.abs(x - c) < grooveWidth / 2);
    const deep = xs.map(inside);
    if (deep[0] || deep[AXIAL_STEPS]) throw new Error('a groove runs off the end of the drum');
    for (const c of centres) {
      // never move the end columns: the caps are built on them
      for (let i = 1; i + 1 < AXIAL_STEPS; i++) {
        const near = Math.abs(xs[i] - c) < grooveWidth / 2, nextNear = Math.abs(xs[i + 1] - c) < grooveWidth / 2;
        if (!near && nextNear) { xs[i] = c - grooveWidth / 2 - WALL_HALF; xs[i + 1] = c - grooveWidth / 2 + WALL_HALF; }
        if (near && !nextNear) { xs[i] = c + grooveWidth / 2 - WALL_HALF; xs[i + 1] = c + grooveWidth / 2 + WALL_HALF; }
      }
    }
    const cos = Math.cos(a), sin = Math.sin(a);
    return xs.map((x, i) => { const r = deep[i] ? R - grooveDepth : R; return [x, r * cos, r * sin]; });
  });
  const surface: Solid = [];
  for (let j = 0; j < ANGLE_STEPS; j++) {
    const row = rows[j], next = rows[(j + 1) % ANGLE_STEPS];
    for (let i = 0; i < AXIAL_STEPS; i++) {
      surface.push(...row[i], ...next[i], ...next[i + 1], ...row[i], ...next[i + 1], ...row[i + 1]);
    }
  }
  const rim = angles.map((a) => polar(R, a));
  return toGeometry([[...surface, ...polygonCap(rim, -length / 2, false), ...polygonCap(rim, length / 2, true)]]);
}

/**
 * A shift fork: boss on its rod at the origin, a flat arm along +y to a C-shaped claw centred at
 * `reach` that wraps 200° round the slider's collar groove, and a guide pin pointing -y into the
 * drum groove, its tip FORK_PIN_REACH from the rod axis. With `clawThickness`, the plate is that
 * thin within `clawReach` of the claw centre (where it rides a narrow groove) and keeps the full
 * fork thickness from there to the boss.
 */
export function shiftFork(o: { reach: number; collarRadius: number; clawThickness?: number; clawReach?: number }): BufferGeometry {
  const t = DIM.fork.thickness / 2;
  const rIn = o.collarRadius, rOut = o.collarRadius + FORK_CLAW_DEPTH;
  const half = 0.0055, root = DIM.fork.rodRadius + 0.0012;  // arm half-height; arm ends inside the boss wall
  const gamma = Math.asin(half / rOut);
  if (o.reach - rOut * Math.cos(gamma) <= root) throw new Error('fork claw overlaps its boss');
  const centre = new Vector2(o.reach, 0);
  const open = deg(80); // the claw's tips are 80° either side of +y about the collar centre
  const thin = o.clawThickness !== undefined && o.clawThickness < DIM.fork.thickness;
  // where the thin claw part ends along the arm; without a thin claw the whole plate is one piece
  const edge = thin ? o.reach - (o.clawReach ?? rOut) : root;
  if (thin && !(edge > root + 0.001 && edge < o.reach - rOut * Math.cos(gamma))) throw new Error('thin claw must end between the boss and the claw');
  const plate = [
    new Vector2(edge, -half),
    ...arc(rOut, Math.PI + gamma, 2 * Math.PI - open, undefined, centre),
    ...arc(rIn, 2 * Math.PI - open, open, undefined, centre),
    ...arc(rOut, open, Math.PI - gamma, undefined, centre),
    new Vector2(edge, half),
  ];
  const tc = thin ? o.clawThickness! / 2 : t;
  const solids = [prism(plate, [], -tc, tc)];
  if (thin) solids.push(prism([new Vector2(root, -half), new Vector2(edge, -half), new Vector2(edge, half), new Vector2(root, half)], [], -t, t));
  const boss = lathe([[-FORK_BOSS_LENGTH / 2, DIM.fork.rodRadius], [-FORK_BOSS_LENGTH / 2, FORK_BOSS],
    [FORK_BOSS_LENGTH / 2, FORK_BOSS], [FORK_BOSS_LENGTH / 2, DIM.fork.rodRadius]], 32);
  const r = DIM.fork.pinRadius, c = 0.0005;
  const pin = lathe([[FORK_BOSS - 0.001, 0], [FORK_BOSS - 0.001, r], [FORK_PIN_REACH - c, r], [FORK_PIN_REACH, r - c],
    [FORK_PIN_REACH, 0]], 16);
  return toGeometry([...solids, boss, transform(pin, new Matrix4().makeRotationZ(-Math.PI / 2))]);
}

/** The star wheel for a drum that turns by `turn` × its drum angle (see the top of this file). */
export function starWheel(turn: 1 | -1 = -1): BufferGeometry {
  const steps = 360;
  const outline = Array.from({ length: steps }, (_, i) => {
    const a = (2 * Math.PI * i) / steps;
    return polar(starWheelRadiusAt(-turn * a), a);
  });
  const t = DIM.starWheel.thickness / 2;
  return toGeometry([prism(outline, [circle(DIM.starWheelMount.boreRadius, 24)], -t, t)]);
}

/** Pivot boss at the origin, arm plate along +y, roller at DETENT_ARM.length in the plane x = 0. */
export function detentArm(): BufferGeometry {
  const { length: L, rollerRadius: rr, pivotRadius: rp } = DETENT_ARM;
  // the boss is larger than the plate's pivot end so their round faces never coincide
  const plate = prism(capsule(rp - 0.001, 0.0055, L), [], 0.003, 0.007);
  const boss = lathe([[0.0025, 0], [0.0025, rp], [0.011, rp], [0.011, 0]], 24); // its faces clear the plate's
  const roller = translate(lathe([[-0.003, 0], [-0.003, rr], [0.0035, rr], [0.0035, 0]], 20), 0, L, 0);
  return toGeometry([plate, boss, roller]);
}

/**
 * A ratchet pawl: one plate from its pivot boss at the origin along +y to a round nose at `length`,
 * `thickness` thick about x = 0. The nose's circle is the one that pushes the drum's shift pins.
 */
export function shiftPawl(length: number): BufferGeometry {
  const { pivotRadius: rp, noseRadius: rn, thickness: t } = DIM.pawl;
  return toGeometry([prism(capsule(rp, rn, length), [], -t / 2, t / 2)]);
}

/**
 * The drum's shift pins: `angles.length` round pins of DIM.shiftPins.radius on a circle of
 * DIM.shiftPins.pitchRadius about the drum axis, standing from x0 to x1.
 */
export function shiftPins(angles: readonly number[], x0: number, x1: number): BufferGeometry {
  const { radius: r, pitchRadius } = DIM.shiftPins, c = 0.0004;
  return toGeometry(angles.map((a) => {
    const p = polar(pitchRadius, a);
    return translate(lathe([[x0, 0], [x0, r], [x1 - c, r], [x1, r - c], [x1, 0]], 16), 0, p.x, p.y);
  }));
}

/**
 * Outline of a strip `halfWidth` either side of an open polyline, with round ends: the left side
 * forward with mitred joints, round the far end, the right side back, round the near end.
 */
function strip(path: readonly Vector2[], halfWidth: number): Vector2[] {
  const n = path.length;
  const normal = (a: Vector2, b: Vector2): Vector2 => { const d = b.clone().sub(a).normalize(); return new Vector2(-d.y, d.x); };
  const side = (sign: 1 | -1): Vector2[] => path.map((p, i) => {
    if (i === 0) return p.clone().addScaledVector(normal(p, path[1]), sign * halfWidth);
    if (i === n - 1) return p.clone().addScaledVector(normal(path[i - 1], p), sign * halfWidth);
    const n0 = normal(path[i - 1], p), n1 = normal(p, path[i + 1]), m = n0.clone().add(n1).normalize();
    return p.clone().addScaledVector(m, (sign * halfWidth) / Math.max(0.5, m.dot(n1)));
  });
  const dirAt = (a: Vector2, b: Vector2): number => Math.atan2(b.y - a.y, b.x - a.x);
  const endA = dirAt(path[n - 2], path[n - 1]), startA = dirAt(path[0], path[1]);
  return [
    ...side(1),
    ...arc(halfWidth, endA + Math.PI / 2, endA - Math.PI / 2, undefined, path[n - 1]).slice(1, -1),
    ...side(-1).reverse(),
    ...arc(halfWidth, startA - Math.PI / 2, startA - (3 * Math.PI) / 2, undefined, path[0]).slice(1, -1),
  ];
}

/**
 * The shift arm, a yoke in the plane x0..x1: a strip along `path` (from one pawl pivot, round the
 * outside of the drum's end past the shift shaft at the origin, to the other pivot), a boss on the
 * shaft and one at each end, and a pivot pin at each end reaching down to `pinX0` through its pawl.
 * The bosses stand a little proud of the strip so no faces coincide.
 */
export function shiftArm(path: readonly Vector2[], x0: number, x1: number, pinX0: number): BufferGeometry {
  const { bossRadius, pivotBossRadius, width } = DIM.shiftArm, proud = 0.0005, r = DIM.pawl.pinRadius;
  const solids = [prism(strip(path, width / 2), [], x0, x1),
    lathe([[x0 - proud, 0], [x0 - proud, bossRadius], [x1 + proud, bossRadius], [x1 + proud, 0]], 32)];
  for (const end of [path[0], path[path.length - 1]]) {
    solids.push(translate(lathe([[x0 - proud, 0], [x0 - proud, pivotBossRadius], [x1 + proud, pivotBossRadius], [x1 + proud, 0]], 20), 0, end.x, end.y));
    solids.push(translate(lathe([[pinX0, 0], [pinX0, r], [x0 - proud, r], [x0 - proud, 0]], 12), 0, end.x, end.y));
  }
  return toGeometry(solids);
}

/** Gear pedal: clamp boss on the shift shaft at the origin, lever along +y, toe peg out along +x. */
export function pedalLever(): BufferGeometry {
  const { length: L, bossRadius: rb, bossLength, pegRadius: peg, pegLength } = DIM.pedal;
  const c = 0.001, hb = bossLength / 2;
  const boss = lathe([[-hb, 0], [-hb, rb], [hb, rb], [hb, 0]], 32);
  const lever = prism(capsule(rb - 0.001, 0.007, L), [], -0.003, 0.003);
  const toe = translate(lathe([[0, 0], [0, peg], [pegLength - c, peg], [pegLength, peg - c], [pegLength, 0]], 20), 0, L, 0);
  return toGeometry([boss, lever, toe]);
}

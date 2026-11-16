import type { BufferGeometry } from 'three';
import { Matrix4, Vector2 } from 'three';
import { SLIDER_TRAVEL } from '../model/geometry';
import { PARAMS } from '../sim/params';
import { grooveCommand } from '../sim/shiftDrum';
import type { SliderId } from '../sim/types';
import { deg } from '../sim/units';
import { DIM } from './dimensions';
import { arc, capsule, circle, polar, rotated } from './outline';
import { lathe, polygonCap, prism, toGeometry, transform, translate } from './mesh';
import type { Solid } from './mesh';

/**
 * Shift drum, forks, star wheel, detent arm, pawl and pedal. Every part's axis is +x.
 *
 * The drum and the star wheel are drawn in drum angle: the point of the surface at angle θ is
 * where a fixed follower sits when the drum has turned to θ. A part whose follower (fork pin or
 * detent roller) is at angle φ about the drum axis is therefore posed by rotating the drum by
 * φ - drumAngle.
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

/** Distance from a fork's rod axis to the tip of its guide pin, m. */
export const FORK_PIN_REACH = FORK_BOSS + 0.007;
/** Detent arm: roller centre distance from the pivot, and roller radius, m. */
export const DETENT_ARM = { length: 0.032, rollerRadius: 0.005 } as const;

/** Axial offset of a slider's groove from its centre at a drum angle, m. */
export const grooveAxialOffset = (slider: SliderId, drumAngle: number): number =>
  grooveCommand(slider, drumAngle) * SLIDER_TRAVEL;

const DETENTS = Object.entries(PARAMS.drum.detents).map(([name, d]) => ({
  angle: deg(d),
  depth: name === 'N' ? 0.0015 : 0.003,
  width: deg(name === 'N' ? 8 : 12),
}));

/** Star wheel radius at drum angle θ: a raised-cosine notch at each detent, the neutral one shallower. */
export function starWheelRadiusAt(angle: number): number {
  let depth = 0;
  for (const d of DETENTS) {
    const off = Math.atan2(Math.sin(angle - d.angle), Math.cos(angle - d.angle));
    if (Math.abs(off) < d.width / 2) depth = Math.max(depth, (d.depth * (1 + Math.cos((2 * Math.PI * off) / d.width))) / 2);
  }
  return DIM.starWheel.radius - depth;
}

/**
 * The drum: an (angle, x) grid whose radius drops by the groove depth inside each slider's groove.
 * The vertices either side of every groove edge are moved onto it, so walls are steep and follow
 * the groove exactly instead of stepping by a grid cell.
 */
export function shiftDrum(length: number, grooveCentres: Record<SliderId, number>): BufferGeometry {
  const { radius: R, grooveDepth, grooveWidth } = DIM.drum;
  const angles = Array.from({ length: ANGLE_STEPS }, (_, j) => (2 * Math.PI * j) / ANGLE_STEPS);
  const rows = angles.map((a) => {
    const xs = Array.from({ length: AXIAL_STEPS + 1 }, (_, i) => -length / 2 + (length * i) / AXIAL_STEPS);
    const drum = a > 2 * Math.PI - GROOVE_RUNOUT ? a - 2 * Math.PI : a;
    const used = drum >= -GROOVE_RUNOUT && drum <= deg(300) + GROOVE_RUNOUT;
    const centres = used
      ? SLIDERS.map((s) => grooveCentres[s] + grooveAxialOffset(s, Math.min(Math.max(drum, 0), deg(300))))
      : [];
    const inside = (x: number): boolean => centres.some((c) => Math.abs(x - c) < grooveWidth / 2);
    const deep = xs.map(inside);
    if (deep[0] || deep[AXIAL_STEPS]) throw new Error('a groove runs off the end of the drum');
    for (const c of centres) {
      for (let i = 0; i < AXIAL_STEPS; i++) {
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
 * drum groove, its tip FORK_PIN_REACH from the rod axis.
 */
export function shiftFork(o: { reach: number; collarRadius: number }): BufferGeometry {
  const t = DIM.fork.thickness / 2;
  const rIn = o.collarRadius, rOut = o.collarRadius + 0.006;
  const half = 0.0055, root = DIM.fork.rodRadius + 0.0012;  // arm half-height; arm ends inside the boss wall
  const gamma = Math.asin(half / rOut);
  if (o.reach - rOut * Math.cos(gamma) <= root) throw new Error('fork claw overlaps its boss');
  const centre = new Vector2(o.reach, 0);
  const open = deg(80); // the claw's tips are 80° either side of +y about the collar centre
  const plate = [
    new Vector2(root, -half),
    ...arc(rOut, Math.PI + gamma, 2 * Math.PI - open, undefined, centre),
    ...arc(rIn, 2 * Math.PI - open, open, undefined, centre),
    ...arc(rOut, open, Math.PI - gamma, undefined, centre),
    new Vector2(root, half),
  ];
  const boss = lathe([[-FORK_BOSS_LENGTH / 2, DIM.fork.rodRadius], [-FORK_BOSS_LENGTH / 2, FORK_BOSS],
    [FORK_BOSS_LENGTH / 2, FORK_BOSS], [FORK_BOSS_LENGTH / 2, DIM.fork.rodRadius]], 32);
  const r = DIM.fork.pinRadius, c = 0.0005;
  const pin = lathe([[FORK_BOSS - 0.001, 0], [FORK_BOSS - 0.001, r], [FORK_PIN_REACH - c, r], [FORK_PIN_REACH, r - c],
    [FORK_PIN_REACH, 0]], 16);
  return toGeometry([prism(plate, [], -t, t), boss, transform(pin, new Matrix4().makeRotationZ(-Math.PI / 2))]);
}

export function starWheel(): BufferGeometry {
  const steps = 360;
  const outline = Array.from({ length: steps }, (_, i) => {
    const a = (2 * Math.PI * i) / steps;
    return polar(starWheelRadiusAt(a), a);
  });
  const t = DIM.starWheel.thickness / 2;
  return toGeometry([prism(outline, [circle(0.006, 24)], -t, t)]);
}

/** Pivot boss at the origin, arm plate along +y, roller at DETENT_ARM.length in the plane x = 0. */
export function detentArm(): BufferGeometry {
  const L = DETENT_ARM.length, rr = DETENT_ARM.rollerRadius;
  const plate = prism(capsule(0.0065, 0.0055, L), [], 0.003, 0.007);
  const boss = lathe([[0.003, 0], [0.003, 0.0065], [0.011, 0.0065], [0.011, 0]], 24);
  const roller = translate(lathe([[-0.003, 0], [-0.003, rr], [0.0035, rr], [0.0035, 0]], 20), 0, L, 0);
  return toGeometry([plate, boss, roller]);
}

/** Ratchet pawl on the shift shaft: an arm along +y ending in two hooks that catch the drum's pins. */
export function shiftPawl(): BufferGeometry {
  const t = 0.004, arm = 0.022;
  const hook = (a: number): Solid => prism(
    rotated(capsule(0.004, 0.0025, 0.011), a).map((p) => p.add(new Vector2(arm, 0))), [], 0, t);
  const boss = lathe([[-0.003, 0], [-0.003, 0.007], [t + 0.003, 0.007], [t + 0.003, 0]], 24);
  return toGeometry([prism(capsule(0.007, 0.0045, arm), [], 0, t), hook(deg(35)), hook(deg(-35)), boss]);
}

/** Gear pedal: clamp boss on the shift shaft at the origin, lever along +y, toe peg out along +x. */
export function pedalLever(): BufferGeometry {
  const L = 0.15, peg = 0.007, c = 0.001;
  const boss = lathe([[-0.012, 0], [-0.012, 0.011], [0.012, 0.011], [0.012, 0]], 32);
  const lever = prism(capsule(0.010, 0.007, L), [], -0.003, 0.003);
  const toe = translate(lathe([[0, 0], [0, peg], [0.04 - c, peg], [0.04, peg - c], [0.04, 0]], 20), 0, L, 0);
  return toGeometry([boss, lever, toe]);
}

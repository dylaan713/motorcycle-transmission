import { PARAMS } from '../sim/params';
import type { SimState } from '../sim/types';
import { clamp, deg, wrapPi } from '../sim/units';
import { DIM } from '../geo/dimensions';
import { DRUM_AXIS, DRUM_REFERENCE, DRUM_TURN, SHIFT_SHAFT_AXIS, axisAt, directionOf, distanceOf } from './layout3d';
import type { Axis } from './layout3d';

/**
 * The positive-stop ratchet that turns the drum, as kinematics. All angles are about x, from +y
 * toward +z, in the (y, z) plane of the drum's end.
 *
 * - Six shift pins stand on the drum's end (on the star wheel's outer face), one per gear position,
 *   PIN_PITCH apart on a circle of DIM.shiftPins.pitchRadius. They turn with the drum.
 * - The shift arm is fixed to the shift shaft and reaches across the drum's end to the side away
 *   from the shaft, where it carries two pawls on pivots: the up pawl pushes pins the way the drum
 *   turns toward sixth, the down pawl the other way. Each pawl ends in a round nose.
 * - At rest, with the drum in any gear or in neutral, each nose sits clear beside a pin.
 * - The pedal, the shift shaft and the arm turn together. Pedal travel +1 turns them by PEDAL_SWING:
 *   that is exactly the turn at which the up nose has pushed its pin round a full stroke
 *   (PARAMS.drum.strokeDeg: one pin pitch plus the simulation's 2° overshoot). Down is the mirror.
 * - A pawl that meets a pin it is not pushing (on the return stroke, or the idle pawl) tilts about
 *   its pivot and rides over it, as a sprung pawl does. The spring and the guide that lift the idle
 *   pawl are not drawn.
 * - The arm never pushes a pin through itself: when the drum lags the pedal (a loaded gearbox
 *   resisting the shift), the arm, shaft and pedal stop where the nose meets the pin, since a rigid
 *   linkage cannot go further.
 */

type P = { y: number; z: number };
const at = (p: P, angle: number, r: number): Axis => axisAt(p, angle, r);
const rotAbout = (c: P, p: P, a: number): Axis => {
  const dy = p.y - c.y, dz = p.z - c.z, cs = Math.cos(a), sn = Math.sin(a);
  return { y: c.y + dy * cs - dz * sn, z: c.z + dy * sn + dz * cs };
};

const D = DRUM_AXIS, S = SHIFT_SHAFT_AXIS;
const PINS = DIM.shiftPins;
/** Nose to pin centres when they touch, m. */
export const CONTACT = DIM.pawl.noseRadius + PINS.radius;
/** Nose to pin surfaces at rest, m. */
export const REST_GAP = 0.0008;
/** A pawl riding over a pin keeps this much clear of it, m. */
const RIDE_CLEAR = 0.0002;
/** Pins sit one detent step apart: second to third. */
export const PIN_PITCH = deg(PARAMS.drum.detents[3] - PARAMS.drum.detents[2]);
export const PIN_COUNT = Math.round((2 * Math.PI) / PIN_PITCH);
const STROKE = deg(PARAMS.drum.strokeDeg);
/** The far side of the drum from the shift shaft: where the pawls work. */
const FAR = directionOf(S, D);
/** Pin j's angle on the drum, in the drum node's own frame: in first gear the pins sit at FAR ± half a pitch, and every pitch on. */
export const PIN_ANGLES: readonly number[] = Array.from({ length: PIN_COUNT }, (_, j) => FAR - PIN_PITCH / 2 + j * PIN_PITCH - DRUM_REFERENCE);
/** World angle of pin j about the drum axis with the drum at `drumAngle`. */
export const pinAngle = (j: number, drumAngle: number): number => DRUM_REFERENCE + DRUM_TURN * drumAngle + PIN_ANGLES[j];
const pinAt = (j: number, drumAngle: number, out: { y: number; z: number }): P => {
  const a = pinAngle(j, drumAngle);
  out.y = D.y + PINS.pitchRadius * Math.cos(a); out.z = D.z + PINS.pitchRadius * Math.sin(a);
  return out;
};

/** The noses ride a circle about the shift shaft that passes this far beyond the drum axis. */
const ARM_REACH = distanceOf(S, D) + DIM.shiftArm.noseOffset;
/** The angle about S at which a point on a circle of ARM_REACH about S is `r` from C, approaching with turn `dir`. */
function reachAngle(c: P, r: number, radius: number, centre: P, dir: 1 | -1): number {
  const dc = Math.hypot(c.y - centre.y, c.z - centre.z), b = Math.atan2(c.z - centre.z, c.y - centre.y);
  const cg = (radius * radius + dc * dc - r * r) / (2 * radius * dc);
  if (!(Math.abs(cg) <= 1)) return Number.NaN;
  return b - dir * Math.acos(cg);
}
/** Mirror image of p in the line through the drum axis and the shift shaft. */
const mirror = (p: P): Axis => {
  const u = directionOf(D, S), dy = p.y - D.y, dz = p.z - D.z;
  const along = dy * Math.cos(u) + dz * Math.sin(u);
  return { y: D.y + 2 * along * Math.cos(u) - dy, z: D.z + 2 * along * Math.sin(u) - dz };
};

const firstPin = pinAt(0, 0, { y: 0, z: 0 }); // at FAR - half a pitch: the pin the up nose pushes from first
const upNose = at(S, reachAngle(firstPin, CONTACT + REST_GAP, ARM_REACH, S, 1), ARM_REACH);
/** Each pawl at rest: its pivot on the arm and its nose's centre. The up pawl's pivot trails its nose round the drum. */
export const PAWLS = {
  up: { pivot: at(D, directionOf(D, upNose) - deg(DIM.pawl.pivotTrailDeg), DIM.pawl.pivotRadiusAboutDrum), nose: upNose, dir: 1 as const },
  down: { pivot: { y: 0, z: 0 }, nose: mirror(upNose), dir: -1 as const },
};
PAWLS.down.pivot = mirror(PAWLS.up.pivot);
export type PawlId = keyof typeof PAWLS;
/**
 * The arm's centre line, in the drum end's plane: from the up pawl's pivot round the outside of the
 * drum's end (DIM.shiftArm.yokeRadius from its axis, clear of the pins) to the shift shaft, and on
 * round the other side to the down pawl's pivot. So the drum's end, its pins and the pawls stay in view.
 */
export const ARM_PATH: readonly Axis[] = (() => {
  const s = directionOf(D, S), r = DIM.shiftArm.yokeRadius;
  const way = (pivot: P, sense: 1 | -1): Axis[] => {
    let span = wrapPi(directionOf(D, pivot) - s);
    if (Math.sign(span) !== sense) span += sense * 2 * Math.PI;
    return [1, 2, 3].map((k) => at(D, s + (span * k) / 4, r));
  };
  const up = way(PAWLS.up.pivot, 1), down = way(PAWLS.down.pivot, -1);
  return [PAWLS.up.pivot, ...up.reverse(), S, ...down, PAWLS.down.pivot];
})();
/** Pivot to nose centre, m: the pawl's length. */
export const PAWL_LENGTH = distanceOf(PAWLS.up.pivot, PAWLS.up.nose);

/** Arm turn (about S) at which `pawl`'s untilted nose touches a pin centred at c, approaching it. */
function contactTurn(pawl: PawlId, c: P): number {
  const p = PAWLS[pawl];
  const reach = reachAngle(c, CONTACT, ARM_REACH, S, p.dir);
  return wrapPi(reach - directionOf(S, p.nose));
}

/**
 * Turn of the shift shaft, arm and pedal at full travel: the up nose has pushed its pin round a
 * full stroke. By symmetry the down pawl needs the same turn the other way.
 */
export const PEDAL_SWING = contactTurn('up', pinAt(0, STROKE, { y: 0, z: 0 }));

/** The pin `pawl` picks up on a stroke that began with the drum at `startAngle`: the first pin ahead of its nose. */
export function engagedPin(pawl: PawlId, startAngle: number): number {
  const p = PAWLS[pawl], nose = directionOf(D, p.nose);
  let best = -1, bestOff = Infinity;
  for (let j = 0; j < PIN_COUNT; j++) {
    const off = wrapPi(pinAngle(j, startAngle) - nose) * p.dir;
    if (off > 0 && off < bestOff) { bestOff = off; best = j; }
  }
  return best;
}

const scratch = { y: 0, z: 0 };
/**
 * The shaft's turn about +x for a state: travel × PEDAL_SWING (up positive, which lifts the
 * trailing pedal's toe), stopped where the working pawl's nose meets the pin it pushes.
 */
export function shiftShaftTurn(state: SimState): number {
  const travel = clamp(state.pedal.travel, -1, 1);
  if (travel === 0) return 0;
  const pawl: PawlId = travel > 0 ? 'up' : 'down';
  const dir = PAWLS[pawl].dir;
  const free = travel * PEDAL_SWING; // up lifts the trailing pedal's toe (PEDAL_LIFT is +1: a test checks it)
  const j = engagedPin(pawl, state.pedal.strokeStartAngle);
  if (j < 0) return free;
  const stop = contactTurn(pawl, pinAt(j, state.drum.angle, scratch));
  if (!Number.isFinite(stop)) return free;
  return dir * Math.max(0, Math.min(dir * free, dir * stop));
}

/** Where a pawl's nose centre is with the arm turned by `turn` and the pawl tilted by `tilt` about its pivot. */
export function nosePosition(pawl: PawlId, turn: number, tilt: number, out: { y: number; z: number } = { y: 0, z: 0 }): P {
  const p = PAWLS[pawl];
  const pivot = rotAbout(S, p.pivot, turn);
  const a = directionOf(p.pivot, p.nose) + turn + tilt;
  out.y = pivot.y + PAWL_LENGTH * Math.cos(a); out.z = pivot.z + PAWL_LENGTH * Math.sin(a);
  return out;
}
/** The tilt sense that lifts each nose away from the drum axis. */
const OUTWARD: Record<PawlId, 1 | -1> = {
  up: distanceOf(D, nosePosition('up', 0, 1e-3)) > distanceOf(D, PAWLS.up.nose) ? 1 : -1,
  down: distanceOf(D, nosePosition('down', 0, 1e-3)) > distanceOf(D, PAWLS.down.nose) ? 1 : -1,
};
/** No pawl tilts further than this, rad. */
export const MAX_TILT = deg(40);

const pinScratch = { y: 0, z: 0 }, noseScratch = { y: 0, z: 0 };
const BODY_SAMPLES = 16;
/**
 * How far a pin's surface stands clear of a pawl's body, m (negative inside): the body is the
 * pawl's plate, a circle swept from its pivot boss to its nose with the radius narrowing between.
 */
export function pawlClearance(pawl: PawlId, turn: number, tilt: number, c: P): number {
  const pivot = rotAbout(S, PAWLS[pawl].pivot, turn), n = nosePosition(pawl, turn, tilt, noseScratch);
  const { pivotRadius: r1, noseRadius: r2 } = DIM.pawl;
  let best = Infinity;
  for (let k = 0; k <= BODY_SAMPLES; k++) {
    const t = k / BODY_SAMPLES;
    const d = Math.hypot(pivot.y + t * (n.y - pivot.y) - c.y, pivot.z + t * (n.z - pivot.z) - c.z) - (r1 + (r2 - r1) * t);
    best = Math.min(best, d - PINS.radius);
  }
  return best;
}
const TILT_STEP = deg(0.5);
/**
 * How far `pawl` tilts outward about its pivot so its body clears every pin but `except` (the one
 * it is pushing, which its nose may touch), with the arm turned by `turn` and the drum at
 * `drumAngle`: the least tilt, to a hundredth of a degree, that leaves RIDE_CLEAR round each.
 */
export function pawlTilt(pawl: PawlId, turn: number, drumAngle: number, except: number): number {
  const s = OUTWARD[pawl];
  const clear = (tilt: number): boolean => {
    for (let j = 0; j < PIN_COUNT; j++) {
      if (j !== except && pawlClearance(pawl, turn, tilt, pinAt(j, drumAngle, pinScratch)) < (tilt === 0 ? 0 : RIDE_CLEAR)) return false;
    }
    return true;
  };
  if (clear(0)) return 0;
  let lo = 0, hi = TILT_STEP;
  while (!clear(s * hi)) { lo = hi; hi += TILT_STEP; if (hi >= MAX_TILT) return s * MAX_TILT; }
  for (let i = 0; i < 6; i++) { const m = (lo + hi) / 2; if (clear(s * m)) hi = m; else lo = m; }
  return s * hi;
}

/** The whole ratchet's pose for a state: the shaft's turn and each pawl's tilt. Writes into `out`. */
export function ratchetPose(state: SimState, out: { turn: number; up: number; down: number }): typeof out {
  const turn = shiftShaftTurn(state);
  const travel = clamp(state.pedal.travel, -1, 1);
  const working: PawlId | null = travel > 0 ? 'up' : travel < 0 ? 'down' : null;
  const engaged = working === null ? -1 : engagedPin(working, state.pedal.strokeStartAngle);
  out.turn = turn;
  out.up = pawlTilt('up', turn, state.drum.angle, working === 'up' ? engaged : -1);
  out.down = pawlTilt('down', turn, state.drum.angle, working === 'down' ? engaged : -1);
  return out;
}

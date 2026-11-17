import { Matrix4 } from 'three';
import { SLIDER_TRAVEL, drawnAngles, drawnDogPhase, gearAngle } from '../model/geometry';
import { PARTS } from '../model/parts';
import type { PartId } from '../model/parts';
import type { TorquePath } from '../model/torquePath';
import { PARAMS } from '../sim/params';
import { clutchCapacityMax } from '../sim/clutch';
import type { SimState } from '../sim/types';
import { deg } from '../sim/units';
import { DIM } from '../geo/dimensions';
import { plateStackOffsets, springLength } from '../geo/clutch';
import { DETENT_ARM, starWheelRadiusAt } from '../geo/shift';
import { setTorque } from './materials';
import { DETENT_ARM_REST, DETENT_CONTACT, DETENT_PIVOT, DRUM_AXIS, DRUM_REFERENCE, FORK_X, PEDAL_SWING, clutchX, directionOf, distanceOf } from './layout3d';
import type { Assembly } from './assembly';

const PART_IDS = Object.keys(PARTS) as PartId[];
/** Torque that lights a part fully, N·m; anything carrying torque shows at least TORQUE_FLOOR. */
const TORQUE_FULL = 150;
const TORQUE_FLOOR = 0.35;
/** Angle from a gear lug's centre to a slider dog's centre when the two just touch, rad. */
const LUG_CONTACT = deg(DIM.dogWidthDeg);
const wrapPi = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const linkMatrix = new Matrix4();

/**
 * Where the detent roller's centre rests, as a distance from the drum axis, when it presses
 * toward the axis at star wheel angle `theta`: the furthest any point of the profile within the
 * roller's reach holds it out. Not just starWheelRadiusAt(theta) + roller radius, which would sink
 * the roller into notches narrower than itself.
 */
export function rollerRestDistance(theta: number): number {
  const rr = DETENT_ARM.rollerRadius;
  const reach = Math.asin(rr / (DIM.starWheel.radius - 0.003)); // the deepest notch is 3 mm
  const n = 720; // fine enough to find the sharp edge where a seat meets the rim
  let best = 0;
  for (let i = 0; i <= n; i++) {
    const d = -reach + (2 * reach * i) / n;
    const r = starWheelRadiusAt(theta + d);
    const s = r * Math.sin(d);
    if (Math.abs(s) > rr) continue;
    best = Math.max(best, r * Math.cos(d) + Math.sqrt(rr * rr - s * s));
  }
  return best;
}

/**
 * Detent arm angle about its pivot (from +y toward +z) that puts its roller on the star wheel, with
 * the drum at `drumAngle` and the star wheel posed so DETENT_CONTACT reads the drum angle.
 */
export function detentArmAngle(drumAngle: number): number {
  const L = DETENT_ARM.length;
  const dv = distanceOf(DETENT_PIVOT, DRUM_AXIS), toDrum = directionOf(DETENT_PIVOT, DRUM_AXIS);
  let contact = DETENT_CONTACT, beta = 0;
  for (let k = 0; k < 4; k++) { // the roller swings on an arc: settle where it touches
    const rho = rollerRestDistance(drumAngle + (contact - DETENT_CONTACT));
    const swing = Math.acos(clamp((L * L + dv * dv - rho * rho) / (2 * L * dv), -1, 1));
    // of the two arm angles that reach that distance, the one on the arm's side of the pivot
    beta = [toDrum + swing, toDrum - swing].reduce((best, b) =>
      (Math.abs(wrapPi(b - DETENT_ARM_REST)) < Math.abs(wrapPi(best - DETENT_ARM_REST)) ? b : best));
    const c = { y: DETENT_PIVOT.y + L * Math.cos(beta), z: DETENT_PIVOT.z + L * Math.sin(beta) };
    contact = directionOf(DRUM_AXIS, c);
  }
  return beta;
}

/** Move the assembly to a simulation state and light the parts on the torque path. */
export function poseAssembly(a: Assembly, state: SimState, path: TorquePath): void {
  const rig = a.rig;
  const ang = drawnAngles(state);
  const spin = (id: PartId, angle: number): void => { a.node(id).rotation.x = wrapPi(angle); };

  // gears turn by gearAngle; sliding gears slide with their slider
  for (const g of rig.gears) {
    g.node.rotation.x = wrapPi(gearAngle(g.shaft, g.g, state.angles));
    if (g.slider !== null) g.node.position.x = g.restX + state.sliders[g.slider].x * SLIDER_TRAVEL;
  }
  // a free gear's dog ring turns so its lugs stand drawnDogPhase from the slider's dogs: measured
  // from the edge of a gear lug to the near edge of a slider dog, in the slider shaft's drawn sense
  for (const d of rig.freeDogs) {
    const sense = PARAMS.sliders[d.slider].shaft === 'input' ? 1 : -1;
    const relative = gearAngle(d.shaft, d.sliderGear, state.angles) - gearAngle(d.shaft, d.free, state.angles);
    d.ring.rotation.x = wrapPi(relative - sense * LUG_CONTACT - drawnDogPhase(d.slider, d.side, state));
  }
  // forks are rigid: they follow their slider exactly
  for (const f of rig.forks) f.node.position.x = FORK_X[f.slider] + state.sliders[f.slider].x * SLIDER_TRAVEL;

  spin('crank', ang.crank); spin('primaryDrive', ang.crank);
  spin('clutchBasket', ang.basket); spin('frictionPlates', ang.basket);
  for (const id of ['inputShaft', 'clutchHub', 'steelPlates', 'pressurePlate'] as const) spin(id, ang.input);
  spin('outputShaft', ang.output); spin('sprocket', ang.output);
  spin('rearSprocket', ang.wheel); spin('rearWheel', ang.wheel);

  // clutch stack: plates part as capacity falls; springs shorten with the pressure plate
  const stack = plateStackOffsets(1 - state.clutch.capacity / clutchCapacityMax);
  stack.friction.forEach((x, i) => { rig.frictionPlates[i].position.x = x; });
  stack.steel.forEach((x, i) => { rig.steelPlates[i].position.x = x; });
  a.node('pressurePlate').position.x = clutchX(stack.pressurePlate);
  const stretch = springLength(stack.pressurePlate) / rig.springBuiltLength;
  for (const s of rig.springs) s.scale.x = stretch;

  // shift drum and star wheel: each follower reads the drum angle
  spin('shiftDrum', DRUM_REFERENCE - state.drum.angle);
  spin('starWheel', DETENT_CONTACT - state.drum.angle);
  spin('detentArm', detentArmAngle(state.drum.angle));
  // pedal travel (-1 down .. +1 up) turns the shift shaft and lifts the pedal's forward-pointing tip
  const travel = clamp((state.pedal as { travel?: number }).travel ?? 0, -1, 1);
  spin('shiftShaft', travel * PEDAL_SWING); spin('pedal', travel * PEDAL_SWING);

  // chain: one link per tooth of front sprocket travel, each link along the chord to the next roller.
  // Under drive the drawn output angle falls and the chain runs on in s (rear to front on top).
  const { path: loop, count, spacing, travelPerRadian } = rig.chain;
  const offset = -ang.output * travelPerRadian;
  for (let i = 0; i < count; i++) {
    const p = loop.pointAt(i * spacing + offset), q = loop.pointAt((i + 1) * spacing + offset);
    linkMatrix.makeRotationX(Math.atan2(q.z - p.z, q.y - p.y)).setPosition(0, p.y, p.z);
    (i % 2 === 0 ? a.chain.inner : a.chain.outer).setMatrixAt(i >> 1, linkMatrix);
  }
  a.chain.inner.instanceMatrix.needsUpdate = true;
  a.chain.outer.instanceMatrix.needsUpdate = true;

  const lit = new Set(path.parts);
  const amount = clamp(Math.abs(path.torque) / TORQUE_FULL, TORQUE_FLOOR, 1);
  for (const id of PART_IDS) setTorque(a.node(id), lit.has(id) ? amount : 0);
}

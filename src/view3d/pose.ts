import { Matrix4 } from 'three';
import type { Object3D } from 'three';
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
import { DETENT_ARM, STAR_SEAT_DEPTH, STAR_SEAT_EDGES, starWheelRadiusAt } from '../geo/shift';
import { DRUM_MAX, DRUM_MIN } from '../sim/shiftDrum';
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

/** Profile samples across the roller's footprint; the seats' sharp edges are added exactly. */
const FOOTPRINT_SAMPLES = 96;
const ROLLER_REACH = Math.asin(DETENT_ARM.rollerRadius / (DIM.starWheel.radius - STAR_SEAT_DEPTH.gear));

/**
 * Where the detent roller's centre rests, as a distance from the drum axis, when it presses
 * toward the axis at star wheel angle `theta`: the furthest any point of the profile within the
 * roller's reach holds it out. The profile is sampled across the footprint, plus each seat edge in
 * reach exactly, since the sharp edge where a seat meets the rim falls between samples.
 */
export function rollerRestDistance(theta: number): number {
  const rr = DETENT_ARM.rollerRadius;
  let best = 0;
  const consider = (d: number): void => {
    const r = starWheelRadiusAt(theta + d);
    const s = r * Math.sin(d);
    if (Math.abs(s) <= rr) best = Math.max(best, r * Math.cos(d) + Math.sqrt(rr * rr - s * s));
  };
  for (let i = 0; i <= FOOTPRINT_SAMPLES; i++) consider(-ROLLER_REACH + (2 * ROLLER_REACH * i) / FOOTPRINT_SAMPLES);
  for (const e of STAR_SEAT_EDGES) {
    const d = wrapPi(e - theta);
    if (Math.abs(d) <= ROLLER_REACH) { consider(d - 1e-9); consider(d + 1e-9); } // both sides of the edge
  }
  return best;
}

/**
 * Detent arm angle about its pivot (from +y toward +z) that puts its roller on the star wheel, with
 * the drum at `drumAngle` and the star wheel posed so DETENT_CONTACT reads the drum angle. The
 * direct solve; poses read the table from buildDetentTable.
 */
export function detentArmAngle(drumAngle: number): number {
  const L = DETENT_ARM.length;
  const dv = distanceOf(DETENT_PIVOT, DRUM_AXIS), toDrum = directionOf(DETENT_PIVOT, DRUM_AXIS);
  let contact = DETENT_CONTACT, beta = 0;
  for (let k = 0; k < 4; k++) { // the roller swings on an arc: settle where it touches
    const rho = rollerRestDistance(drumAngle + (contact - DETENT_CONTACT));
    const swing = Math.acos(clamp((L * L + dv * dv - rho * rho) / (2 * L * dv), -1, 1));
    // of the two arm angles that reach that distance, the one on the arm's side of the pivot
    const plus = toDrum + swing, minus = toDrum - swing;
    beta = Math.abs(wrapPi(plus - DETENT_ARM_REST)) < Math.abs(wrapPi(minus - DETENT_ARM_REST)) ? plus : minus;
    contact = directionOf(DRUM_AXIS, { y: DETENT_PIVOT.y + L * Math.cos(beta), z: DETENT_PIVOT.z + L * Math.sin(beta) });
  }
  return beta;
}

/** Table step and range: the drum's whole travel, first to sixth. */
const TABLE_STEP = deg(0.1);
const TABLE_SIZE = Math.round((DRUM_MAX - DRUM_MIN) / TABLE_STEP) + 1;
let detentTable: Float64Array | undefined;

/**
 * From second gear's seat on the detents are 60° apart and identical, and the roller's reach never
 * spans two seats, so past PERIODIC_FROM the arm angle repeats every 60°: solve up to there, copy
 * the rest. (A test checks the copy against the direct solve.)
 */
const PERIODIC_FROM = Math.round(deg(150) / TABLE_STEP);
const PERIOD = Math.round(deg(60) / TABLE_STEP);

/**
 * Detent arm angle at every 0.1° of drum travel. The angle depends only on the drum angle, so the
 * table is built once and shared; a pose interpolates it instead of solving each frame.
 */
export function buildDetentTable(): Float64Array {
  if (!detentTable) {
    detentTable = new Float64Array(TABLE_SIZE);
    for (let i = 0; i < TABLE_SIZE; i++) {
      detentTable[i] = i <= PERIODIC_FROM ? detentArmAngle(DRUM_MIN + i * TABLE_STEP) : detentTable[i - PERIOD];
    }
  }
  return detentTable;
}

/** Linear interpolation in the detent table; beyond the drum's travel it holds the end values. */
export function detentArmFromTable(table: Float64Array, drumAngle: number): number {
  const u = clamp((drumAngle - DRUM_MIN) / TABLE_STEP, 0, table.length - 1);
  const i = Math.min(Math.floor(u), table.length - 2), f = u - i;
  return table[i] + (table[i + 1] - table[i]) * f;
}

const spin = (node: Object3D, angle: number): void => { node.rotation.x = wrapPi(angle); };
const ON_INPUT: readonly PartId[] = ['inputShaft', 'clutchHub', 'steelPlates', 'pressurePlate'];

/** Move the assembly to a simulation state and light the parts on the torque path. */
export function poseAssembly(a: Assembly, state: SimState, path: TorquePath): void {
  const rig = a.rig;
  const ang = drawnAngles(state);

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

  spin(a.node('crank'), ang.crank); spin(a.node('primaryDrive'), ang.crank);
  spin(a.node('clutchBasket'), ang.basket); spin(a.node('frictionPlates'), ang.basket);
  for (const id of ON_INPUT) spin(a.node(id), ang.input);
  spin(a.node('outputShaft'), ang.output); spin(a.node('sprocket'), ang.output);
  spin(a.node('rearSprocket'), ang.wheel); spin(a.node('rearWheel'), ang.wheel);

  // clutch stack: plates part as capacity falls; springs shorten with the pressure plate
  if (state.clutch.capacity !== rig.posedCapacity) {
    rig.posedCapacity = state.clutch.capacity;
    const stack = plateStackOffsets(1 - state.clutch.capacity / clutchCapacityMax);
    for (let i = 0; i < stack.friction.length; i++) rig.frictionPlates[i].position.x = stack.friction[i];
    for (let i = 0; i < stack.steel.length; i++) rig.steelPlates[i].position.x = stack.steel[i];
    a.node('pressurePlate').position.x = clutchX(stack.pressurePlate);
    const stretch = springLength(stack.pressurePlate) / rig.springBuiltLength;
    for (const s of rig.springs) s.scale.x = stretch;
  }

  // shift drum and star wheel: each follower reads the drum angle
  spin(a.node('shiftDrum'), DRUM_REFERENCE - state.drum.angle);
  spin(a.node('starWheel'), DETENT_CONTACT - state.drum.angle);
  spin(a.node('detentArm'), detentArmFromTable(rig.detentTable, state.drum.angle));
  // pedal travel (-1 down .. +1 up) turns the shift shaft and lifts the pedal's forward-pointing tip
  const travel = clamp(state.pedal.travel, -1, 1);
  spin(a.node('shiftShaft'), travel * PEDAL_SWING); spin(a.node('pedal'), travel * PEDAL_SWING);

  // chain: one link per tooth of front sprocket travel, each link along the chord to the next
  // roller. The loop is placed mirrored in z. Under drive the drawn output angle falls and the
  // chain runs on in s (rear to front along the top run).
  const { path: loop, count, spacing, travelPerRadian } = rig.chain;
  const offset = -ang.output * travelPerRadian;
  let p = loop.pointAt(offset);
  for (let i = 0; i < count; i++) {
    const q = loop.pointAt((i + 1) * spacing + offset);
    linkMatrix.makeRotationX(Math.atan2(p.z - q.z, q.y - p.y)).setPosition(0, p.y, -p.z);
    (i % 2 === 0 ? a.chain.inner : a.chain.outer).setMatrixAt(i >> 1, linkMatrix);
    p = q;
  }
  a.chain.inner.instanceMatrix.needsUpdate = true;
  a.chain.outer.instanceMatrix.needsUpdate = true;

  const amount = clamp(Math.abs(path.torque) / TORQUE_FULL, TORQUE_FLOOR, 1);
  for (const id of PART_IDS) setTorque(a.node(id), path.parts.includes(id) ? amount : 0);
}

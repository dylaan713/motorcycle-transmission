import { PARAMS } from './params';
import { clamp, deg, rpm } from './units';
import {
  finalRatio, gearRatio, outputOmegaFromRoad, primaryRatio, reflectedVehicleInertia,
  roadSpeed,
} from './kinematics';
import { engineTorque, nextRunning } from './engine';
import { clutchCapacity, clutchTorque } from './clutch';
import { detentTorque, grooveCommand, pawlTorque, seatedDetent, stepDrum } from './shiftDrum';
import { dogPhase, dogTurn, engageSpeeds, moveSlider, sideOf, targetGear } from './dogs';
import {
  NEUTRAL_INPUTS, type DeepPartial, type DogSide, type GearId, type Inputs, type ShaftAngles,
  type SimSliderState, type SimState, type SliderId,
} from './types';

export interface Simulation {
  getState(): SimState; // a fresh copy each call
  setState(patch: DeepPartial<SimState>): void; // for scenarios and tests
  step(inputs: Inputs): void; // exactly one PARAMS.dt
  /**
   * Convenience for scripts and tests: takes whole steps covering min(seconds, 0.1) with the same
   * inputs and returns the time simulated. The sub-step remainder is dropped, not carried, so
   * calling it once per animation frame runs slow. Real-time callers keep their own time
   * accumulator and call `step` (as the frame loop does).
   */
  advance(inputs: Inputs, seconds: number): number;
  reset(): void; // standstill, neutral, engine running at idle
}

const DT = PARAMS.dt;
const MAX_FRAME = 0.1; // s
const SLIDER_IDS: readonly SliderId[] = ['A', 'B', 'C'];
// Inertias in input-shaft coordinates, where the clutch basket turns at engine omega / primaryRatio.
const J_ENGINE = PARAMS.engine.inertia * primaryRatio ** 2;
const J_IN = PARAMS.inputShaft.inertia;
const J_VEH = reflectedVehicleInertia; // at the output shaft
const ROLLING = PARAMS.crr * PARAMS.mass * PARAMS.g * PARAMS.wheelRadius; // N·m at the rear wheel

/**
 * One step of J·dω/dt = drive − sign(ω)·resist, with resist >= 0 a Coulomb-like resistance.
 * Resistance can bring a speed to exactly 0 and hold it there against |drive| <= resist, but it
 * never reverses it.
 */
function integrate(omega: number, inertia: number, drive: number, resist: number): number {
  const free = omega + (drive * DT) / inertia;
  const stop = (resist * DT) / inertia;
  return Math.abs(free) <= stop ? 0 : free - Math.sign(free) * stop;
}

/** Resistance torque actually applied over a step, as a signed fraction of resist (for dog torque). */
function resistFraction(
  before: number, after: number, inertia: number, drive: number, resist: number,
): number {
  if (resist === 0) return 0;
  return (drive - (inertia * (after - before)) / DT) / resist;
}

/** One step of basket and downstream side turning together as one body. */
interface TogetherStep {
  omega0: number; // momentum-weighted common speed at the start of the step
  omega: number; // common speed at the end
  torque: number; // clutch torque on the downstream side that keeps it with the basket
  kDown: number; // signed fraction of the downstream resistance applied
}

/**
 * Basket and downstream side stepped as one body from their momentum-weighted speed. The clutch
 * torque follows from the downstream side's own balance. While the pair turns, each side's
 * resistance acts in full against the motion; when it ends at rest, the resistance is shared out
 * so that the clutch carries as little as it can, each side reacting up to its own resistance.
 * So a stopped engine's drag reacts against the plates rather than vanishing at rest.
 */
function togetherStep(
  wBasket: number, wIn: number, jDown: number,
  basketDrive: number, basketResist: number, downDrive: number, downResist: number,
): TogetherStep {
  const j = J_ENGINE + jDown;
  const omega0 = (J_ENGINE * wBasket + jDown * wIn) / j;
  const drive = basketDrive + downDrive;
  const omega = integrate(omega0, j, drive, basketResist + downResist);
  const downNeed = (jDown * (omega - wIn)) / DT - downDrive; // clutch torque less downstream resistance
  let fDown: number;
  if (omega !== 0) {
    fDown = Math.sign(omega) * downResist;
  } else {
    const applied = drive - (j * (omega - omega0)) / DT; // total resistance that held the pair
    fDown = clamp(
      -downNeed, Math.max(-downResist, applied - basketResist), Math.min(downResist, applied + basketResist),
    );
  }
  return { omega0, omega, torque: downNeed + fDown, kDown: downResist === 0 ? 0 : fDown / downResist };
}

/** A number with NaN mapped to 0 (±Infinity kept, for clamping); non-numbers take the fallback. */
const numberOrFallback = (x: unknown, fallback: number): number =>
  typeof x === 'number' ? (Number.isNaN(x) ? 0 : x) : fallback;
/** For fields with no range: NaN and ±Infinity both become 0. */
const finiteOrZero = (x: unknown, fallback: number): number => {
  const v = numberOrFallback(x, fallback);
  return Number.isFinite(v) ? v : 0;
};
const bool = (x: unknown, fallback: boolean): boolean => (typeof x === 'boolean' ? x : fallback);

/** Clamps ranges; NaN becomes 0; missing or mistyped fields take NEUTRAL_INPUTS values. */
export function sanitizeInputs(raw: Partial<Inputs>): Inputs {
  const n = NEUTRAL_INPUTS;
  const r = (raw ?? {}) as Partial<Record<keyof Inputs, unknown>>;
  return {
    throttle: clamp(numberOrFallback(r.throttle, n.throttle), 0, 1),
    clutchLever: clamp(numberOrFallback(r.clutchLever, n.clutchLever), 0, 1),
    pedal: clamp(numberOrFallback(r.pedal, n.pedal), -1, 1),
    brake: clamp(numberOrFallback(r.brake, n.brake), 0, 1),
    ignition: bool(r.ignition, n.ignition),
    starter: bool(r.starter, n.starter),
    handDrumTorque: finiteOrZero(r.handDrumTorque, n.handDrumTorque),
    handWheelTorque: finiteOrZero(r.handWheelTorque, n.handWheelTorque),
    handInputShaftTorque: finiteOrZero(r.handInputShaftTorque, n.handInputShaftTorque),
  };
}

const freeSlider = (): SimSliderState => ({
  x: 0, phi: 0, locked: null, blocked: false, side: 'neg', phase: { neg: 0, pos: 0 },
});

function initialState(): SimState {
  const drumAngle = deg(PARAMS.drum.detents.N);
  return {
    t: 0,
    engine: { omega: rpm(PARAMS.engine.idleRpm), running: true, torque: 0 },
    clutch: { capacity: clutchCapacity(0), torque: 0, slip: 0, locked: false },
    inputShaftOmega: 0,
    outputShaftOmega: 0,
    roadSpeed: 0,
    drum: { angle: drumAngle, omega: 0, detent: seatedDetent(drumAngle) },
    pedal: { strokeStartAngle: drumAngle, travel: 0 },
    sliders: { A: freeSlider(), B: freeSlider(), C: freeSlider() },
    lockedGear: null,
    dogTorque: 0,
    angles: { crank: 0, input: 0, output: 0 },
  };
}

const cloneSlider = (s: SimSliderState): SimSliderState => ({ ...s, phase: { ...s.phase } });

function cloneState(s: SimState): SimState {
  return {
    ...s,
    engine: { ...s.engine },
    clutch: { ...s.clutch },
    drum: { ...s.drum },
    pedal: { ...s.pedal },
    sliders: { A: cloneSlider(s.sliders.A), B: cloneSlider(s.sliders.B), C: cloneSlider(s.sliders.C) },
    angles: { ...s.angles },
  };
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function deepMerge<T>(base: T, patch: unknown): T {
  if (!isObject(patch) || !isObject(base)) return patch as T;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    out[k] = isObject(v) && isObject(out[k]) ? deepMerge(out[k], v) : v;
  }
  return out as T;
}

const lockedGearOf = (sliders: Record<SliderId, SimSliderState>): GearId | null => {
  for (const id of SLIDER_IDS) if (sliders[id].locked !== null) return sliders[id].locked;
  return null;
};
const lockedSliderOf = (sliders: Record<SliderId, SimSliderState>): SliderId | null =>
  SLIDER_IDS.find((id) => sliders[id].locked !== null) ?? null;

/**
 * The side whose gear a slider's dogs face: the locked gear's while locked; otherwise the gear
 * dogs.targetGear picks (same sign rule and dead band) from the groove command, or from x when the
 * command is near centre; otherwise the side it last headed for.
 */
function headingSide(id: SliderId, prev: SimSliderState, command: number): DogSide {
  const gear = prev.locked ?? targetGear(id, command) ?? targetGear(id, prev.x);
  return gear === null ? prev.side : sideOf(id, gear);
}

/** Shaft angles one step on, from the speeds at the start of the step. */
const advanceAngles = (s: SimState): ShaftAngles => ({
  crank: s.angles.crank + s.engine.omega * DT,
  input: s.angles.input + s.inputShaftOmega * DT,
  output: s.angles.output + s.outputShaftOmega * DT,
});

/**
 * The drum goes solid when moving it would make some fork lag its groove by more than
 * forkCompliance and by more than it already does: a loaded or face-blocked dog holds the drum.
 */
function forkBlocks(sliders: Record<SliderId, SimSliderState>, oldAngle: number, newAngle: number): boolean {
  return SLIDER_IDS.some((id) => {
    const x = sliders[id].x;
    const lagNew = Math.abs(grooveCommand(id, newAngle) - x);
    return lagNew > PARAMS.dogs.forkCompliance && lagNew > Math.abs(grooveCommand(id, oldAngle) - x);
  });
}

function stepState(s: SimState, raw: Inputs): SimState {
  // 1. Inputs and engine running state.
  const u = sanitizeInputs(raw);
  const running = nextRunning(s.engine.omega, s.engine.running, u.ignition);

  // 2. Drum, then the fork block.
  const pawl = pawlTorque(u.pedal, s.drum.angle, s.pedal);
  let moved = stepDrum(s.drum, pawl.torque + detentTorque(s.drum.angle) + u.handDrumTorque, DT);
  if (forkBlocks(s.sliders, s.drum.angle, moved.angle)) moved = { angle: s.drum.angle, omega: 0 };
  const drum = { ...moved, detent: seatedDetent(moved.angle) };

  // 3. Sliders, with speed matching when a dog drops in. Shaft angles advance on the speeds at the
  // start of the step and stay continuous through a dog's speed snap; each slider's dog angle is
  // read off them, so alignment is tested on the same angles a drawing shows.
  const angles = advanceAngles(s);
  let wIn = s.inputShaftOmega;
  let wOut = s.outputShaftOmega;
  const sliders = {} as Record<SliderId, SimSliderState>;
  for (const id of SLIDER_IDS) {
    const prev = s.sliders[id];
    const cmd = grooveCommand(id, drum.angle);
    const side = headingSide(id, prev, cmd);
    const phi = dogPhase(id, side, angles, prev.phase[side]);
    const r = moveSlider(id, prev, cmd, phi, s.dogTorque, DT);
    sliders[id] = { ...r.state, side, phase: { ...prev.phase } };
    if (r.justLocked !== null) {
      ({ inputOmega: wIn, outputOmega: wOut } = engageSpeeds(r.justLocked, wIn, wOut, J_IN, J_VEH));
    }
  }
  const gear = lockedGearOf(sliders);
  const ratio = gear === null ? 0 : gearRatio(gear);

  // 4. Torques. Engine at the crank; when it is not running its drag is a resistance.
  const engineTotal = engineTorque(s.engine.omega, running, u.throttle, u.ignition, u.starter);
  const engineDrag = running
    ? 0
    : -engineTorque(Math.max(Math.abs(s.engine.omega), Number.MIN_VALUE), false, 0, false, false);
  const starter = u.starter && u.ignition ? PARAMS.engine.starterTorque : 0;
  const engineDrive = running ? engineTotal : starter;
  const basketDrive = engineDrive * primaryRatio;
  const basketResist = engineDrag * primaryRatio;

  const v = roadSpeed(wOut);
  const aero = 0.5 * PARAMS.airDensity * PARAMS.cdA * v * v * PARAMS.wheelRadius;
  const outDrive = u.handWheelTorque / finalRatio;
  const outResist = (u.brake * PARAMS.brakeMaxTorque + ROLLING + aero) / finalRatio;
  const inDrive = u.handInputShaftTorque;
  const inResist = PARAMS.inputShaft.friction;

  // Downstream of the clutch, in input-shaft coordinates.
  const jDown = gear === null ? J_IN : J_IN + J_VEH / ratio ** 2;
  const downDrive = gear === null ? inDrive : inDrive + outDrive / ratio;
  const downResist = gear === null ? inResist : inResist + outResist / ratio;

  // 5. Clutch.
  const wBasket = s.engine.omega / primaryRatio;
  const slip = wBasket - wIn;
  const capacity = clutchCapacity(u.clutchLever);
  const together = togetherStep(wBasket, wIn, jDown, basketDrive, basketResist, downDrive, downResist);
  const reducedInertia = 1 / (1 / J_ENGINE + 1 / jDown);
  // torque that cancels the current slip this step, and the part of it that only holds the speeds equal
  const lockTorque = together.torque;
  const holdTorque = lockTorque - (slip / DT) * reducedInertia;
  const c = clutchTorque(slip, lockTorque, capacity);

  // 6, 7. Integrate. A locked clutch makes basket and input shaft one body at their common speed.
  let clutchLocked = c.locked;
  let wB = together.omega;
  let wD = together.omega;
  if (!c.locked) {
    const slipB = integrate(wBasket, J_ENGINE, basketDrive - c.torque, basketResist);
    const slipD = integrate(wIn, jDown, downDrive + c.torque, downResist);
    // Slip reversed within the step and static friction can hold: the plates stick, and the step
    // is taken as a locked one. If it cannot hold, the slip simply carries on the other way.
    clutchLocked = slip !== 0 && Math.sign(slipB - slipD) !== Math.sign(slip) && Math.abs(holdTorque) <= capacity;
    if (!clutchLocked) { wB = slipB; wD = slipD; }
  }
  const transmitted = clutchLocked ? lockTorque : c.torque;
  // downstream speed at the start of the smooth part of the step (after any sticking impulse), and
  // the signed fraction of downstream resistance applied over it
  const wD0 = clutchLocked ? together.omega0 : wIn;
  const kResist = clutchLocked
    ? together.kDown
    : resistFraction(wIn, wD, jDown, downDrive + c.torque, downResist);
  const inputShaftOmega = wD;
  const outputShaftOmega = gear === null ? integrate(wOut, J_VEH, outDrive, outResist) : wD / ratio;

  // 8. Torque through the locked dog: what the output shaft needs beyond its own external torques.
  let dogTorque = 0;
  const lockedSlider = lockedSliderOf(sliders);
  if (gear !== null && lockedSlider !== null) {
    // the sticking impulse (wIn to wD0) is not a sustained load on the dog
    const alphaOut = (wD - wD0) / DT / ratio;
    const atOutput = J_VEH * alphaOut - outDrive + kResist * outResist;
    dogTorque = PARAMS.sliders[lockedSlider].shaft === 'output' ? atOutput : atOutput / ratio;
  }

  return {
    t: s.t + DT,
    engine: { omega: wB * primaryRatio, running, torque: engineTotal },
    clutch: {
      capacity,
      torque: transmitted,
      slip: clutchLocked ? 0 : wB - wD,
      locked: clutchLocked,
    },
    inputShaftOmega,
    outputShaftOmega,
    roadSpeed: roadSpeed(outputShaftOmega),
    drum,
    pedal: { ...pawl.ratchet, travel: u.pedal },
    sliders,
    lockedGear: gear,
    dogTorque,
    angles,
  };
}

/**
 * phi is derived from the shaft angles. A patched phi sets both dog rings' phase offsets so that the
 * derived angle equals it at this instant, against either gear; the side follows a patched lock or
 * x. Then phi is re-derived, so patched angles or phases show in it too.
 */
function patchDogPhase(id: SliderId, s: SimState, phi: number | undefined): void {
  const sl = s.sliders[id];
  const gear = sl.locked ?? targetGear(id, sl.x);
  if (gear !== null) sl.side = sideOf(id, gear);
  if (phi !== undefined) {
    for (const side of ['neg', 'pos'] as const) {
      sl.phase[side] = phi - dogTurn(id, side, s.angles);
    }
  }
  sl.phi = dogPhase(id, sl.side, s.angles, sl.phase[sl.side]);
}

export function createSimulation(): Simulation {
  let state = initialState();
  return {
    getState: () => cloneState(state),
    setState(patch) {
      if (!isObject(patch)) return; // nothing to merge
      const p = patch as DeepPartial<SimState>;
      const merged = deepMerge(cloneState(state), p);
      // roadSpeed, lockedGear and drum.detent are derived; a patch of roadSpeed alone sets the output shaft
      if (p.roadSpeed !== undefined && p.outputShaftOmega === undefined) {
        merged.outputShaftOmega = outputOmegaFromRoad(p.roadSpeed);
      }
      merged.roadSpeed = roadSpeed(merged.outputShaftOmega);
      merged.lockedGear = lockedGearOf(merged.sliders);
      merged.drum.detent = seatedDetent(merged.drum.angle);
      for (const id of SLIDER_IDS) patchDogPhase(id, merged, p.sliders?.[id]?.phi);
      state = merged;
    },
    step(inputs) {
      state = stepState(state, inputs);
    },
    advance(inputs, seconds) {
      const span = Number.isNaN(seconds) ? 0 : clamp(seconds, 0, MAX_FRAME);
      const n = Math.floor(span / DT + 1e-9);
      for (let i = 0; i < n; i++) state = stepState(state, inputs);
      return n * DT;
    },
    reset() {
      state = initialState();
    },
  };
}

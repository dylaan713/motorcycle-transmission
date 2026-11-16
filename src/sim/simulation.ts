import { PARAMS } from './params';
import { clamp, deg, rpm } from './units';
import {
  finalRatio, freeGearOmega, gearRatio, outputOmegaFromRoad, primaryRatio, reflectedVehicleInertia,
  roadSpeed,
} from './kinematics';
import { engineTorque, nextRunning } from './engine';
import { clutchCapacity, clutchTorque } from './clutch';
import { detentTorque, grooveCommand, pawlTorque, stepDrum } from './shiftDrum';
import { engageSpeeds, stepSlider, targetGear } from './dogs';
import {
  NEUTRAL_INPUTS, type DeepPartial, type GearId, type Inputs, type SimState, type SliderId,
  type SliderState,
} from './types';

export interface Simulation {
  getState(): SimState; // a fresh copy each call
  setState(patch: DeepPartial<SimState>): void; // for scenarios and tests
  step(inputs: Inputs): void; // exactly one PARAMS.dt
  advance(inputs: Inputs, seconds: number): number; // steps for min(seconds, 0.1); returns seconds simulated
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

/** Net torque on a body: resistance opposes motion, or cancels drive up to its size at rest. */
const netTorque = (omega: number, drive: number, resist: number): number =>
  omega !== 0 ? drive - Math.sign(omega) * resist : drive - clamp(drive, -resist, resist);

/** Resistance torque actually applied over a step, as a signed fraction of resist (for dog torque). */
function resistFraction(
  before: number, after: number, inertia: number, drive: number, resist: number,
): number {
  if (resist === 0) return 0;
  return (drive - (inertia * (after - before)) / DT) / resist;
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

const freeSlider = (): SliderState => ({ x: 0, phi: 0, locked: null, blocked: false });

function initialState(): SimState {
  const drumAngle = deg(PARAMS.drum.detents.N);
  return {
    t: 0,
    engine: { omega: rpm(PARAMS.engine.idleRpm), running: true, torque: 0 },
    clutch: { capacity: clutchCapacity(0), torque: 0, slip: 0, locked: false },
    inputShaftOmega: 0,
    outputShaftOmega: 0,
    roadSpeed: 0,
    drum: { angle: drumAngle, omega: 0 },
    pedal: { armed: true, strokeStartAngle: drumAngle },
    sliders: { A: freeSlider(), B: freeSlider(), C: freeSlider() },
    lockedGear: null,
    dogTorque: 0,
  };
}

function cloneState(s: SimState): SimState {
  return {
    ...s,
    engine: { ...s.engine },
    clutch: { ...s.clutch },
    drum: { ...s.drum },
    pedal: { ...s.pedal },
    sliders: { A: { ...s.sliders.A }, B: { ...s.sliders.B }, C: { ...s.sliders.C } },
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

const lockedGearOf = (sliders: Record<SliderId, SliderState>): GearId | null => {
  for (const id of SLIDER_IDS) if (sliders[id].locked !== null) return sliders[id].locked;
  return null;
};
const lockedSliderOf = (sliders: Record<SliderId, SliderState>): SliderId | null =>
  SLIDER_IDS.find((id) => sliders[id].locked !== null) ?? null;

/**
 * Slider's shaft speed minus the speed of the free gear it is heading for. The gear is picked by
 * dogs.targetGear (same sign rule and dead band) from the groove command, or from x when the
 * command is near centre; 0 when neither picks one.
 */
function relativeOmega(id: SliderId, x: number, command: number, wIn: number, wOut: number): number {
  const gear = targetGear(id, command) ?? targetGear(id, x);
  if (gear === null) return 0;
  const shaft = PARAMS.sliders[id].shaft === 'input' ? wIn : wOut;
  return shaft - freeGearOmega(gear, wIn, wOut);
}

/**
 * The drum goes solid when moving it would make some fork lag its groove by more than
 * forkCompliance and by more than it already does: a loaded or face-blocked dog holds the drum.
 */
function forkBlocks(sliders: Record<SliderId, SliderState>, oldAngle: number, newAngle: number): boolean {
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
  let drum = stepDrum(s.drum, pawl.torque + detentTorque(s.drum.angle) + u.handDrumTorque, DT);
  if (forkBlocks(s.sliders, s.drum.angle, drum.angle)) drum = { angle: s.drum.angle, omega: 0 };

  // 3. Sliders, with speed matching when a dog drops in.
  let wIn = s.inputShaftOmega;
  let wOut = s.outputShaftOmega;
  const sliders = {} as Record<SliderId, SliderState>;
  for (const id of SLIDER_IDS) {
    const prev = s.sliders[id];
    const cmd = grooveCommand(id, drum.angle);
    const r = stepSlider(id, prev, cmd, relativeOmega(id, prev.x, cmd, wIn, wOut), s.dogTorque, DT);
    sliders[id] = r.state;
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
  const basketNet = netTorque(wBasket, basketDrive, basketResist);
  const downNet = netTorque(wIn, downDrive, downResist);
  const reducedInertia = 1 / (1 / J_ENGINE + 1 / jDown);
  // torque that holds the two sides at equal speed, and the one that also cancels the current slip
  const holdTorque = (basketNet / J_ENGINE - downNet / jDown) * reducedInertia;
  const lockTorque = holdTorque + (slip / DT) * reducedInertia;
  const c = clutchTorque(slip, lockTorque, capacity);

  // 6, 7. Integrate. A locked clutch makes basket and input shaft one body at their common speed.
  let clutchLocked = c.locked;
  let wB: number;
  let wD: number;
  let wD0: number; // downstream speed at the start of the smooth part of the step
  let kResist: number; // signed fraction of downstream resistance actually applied
  let wDSmooth: number; // downstream speed at the end of the smooth part, before any stick impulse
  if (c.locked) {
    const j = J_ENGINE + jDown;
    wD0 = (J_ENGINE * wBasket + jDown * wIn) / j;
    wD = integrate(wD0, j, basketDrive + downDrive, basketResist + downResist);
    wB = wD;
    wDSmooth = wD;
    kResist = resistFraction(wD0, wD, j, basketDrive + downDrive, basketResist + downResist);
  } else {
    wD0 = wIn;
    wB = integrate(wBasket, J_ENGINE, basketDrive - c.torque, basketResist);
    wD = integrate(wIn, jDown, downDrive + c.torque, downResist);
    kResist = resistFraction(wIn, wD, jDown, downDrive + c.torque, downResist);
    wDSmooth = wD;
    if (slip !== 0 && Math.sign(wB - wD) !== Math.sign(slip) && Math.abs(holdTorque) <= capacity) {
      // slip reversed within the step and static friction can hold: the plates stick at the
      // momentum-weighted speed. If it cannot hold, the slip simply carries on the other way.
      wB = wD = (J_ENGINE * wB + jDown * wD) / (J_ENGINE + jDown);
      clutchLocked = true;
    }
  }
  const inputShaftOmega = wD;
  const outputShaftOmega = gear === null ? integrate(wOut, J_VEH, outDrive, outResist) : wD / ratio;

  // 8. Torque through the locked dog: what the output shaft needs beyond its own external torques.
  // The impulse of plates sticking is left out: it is not a sustained load on the dog.
  let dogTorque = 0;
  const lockedSlider = lockedSliderOf(sliders);
  if (gear !== null && lockedSlider !== null) {
    const alphaOut = (wDSmooth - wD0) / DT / ratio;
    const atOutput = J_VEH * alphaOut - outDrive + kResist * outResist;
    dogTorque = PARAMS.sliders[lockedSlider].shaft === 'output' ? atOutput : atOutput / ratio;
  }

  return {
    t: s.t + DT,
    engine: { omega: wB * primaryRatio, running, torque: engineTotal },
    clutch: {
      capacity,
      torque: c.torque,
      slip: clutchLocked ? 0 : wB - wD,
      locked: clutchLocked,
    },
    inputShaftOmega,
    outputShaftOmega,
    roadSpeed: roadSpeed(outputShaftOmega),
    drum,
    pedal: pawl.ratchet,
    sliders,
    lockedGear: gear,
    dogTorque,
  };
}

export function createSimulation(): Simulation {
  let state = initialState();
  return {
    getState: () => cloneState(state),
    setState(patch) {
      if (!isObject(patch)) return; // nothing to merge
      const p = patch as DeepPartial<SimState>;
      const merged = deepMerge(cloneState(state), p);
      // roadSpeed and lockedGear are derived; a patch of roadSpeed alone sets the output shaft
      if (p.roadSpeed !== undefined && p.outputShaftOmega === undefined) {
        merged.outputShaftOmega = outputOmegaFromRoad(p.roadSpeed);
      }
      merged.roadSpeed = roadSpeed(merged.outputShaftOmega);
      merged.lockedGear = lockedGearOf(merged.sliders);
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

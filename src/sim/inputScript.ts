import { PARAMS } from './params';
import { clamp, deg, toRpm } from './units';
import { gearRatio, primaryRatio } from './kinematics';
import type { Simulation } from './simulation';
import { NEUTRAL_INPUTS, type Inputs, type SimState } from './types';

/** Inputs as a function of script time (seconds since the script started) and the current state. */
export type InputSource = (t: number, state: SimState) => Inputs;

/**
 * Steps the simulation for `seconds`, asking `source` for inputs before every step. The `t` given
 * to the source is time since this call started; `state.t` stays absolute simulation time.
 */
export function runSource(
  sim: Simulation, source: InputSource, seconds: number, onStep?: (s: SimState) => void,
): SimState {
  const n = Math.round(seconds / PARAMS.dt);
  let state = sim.getState();
  for (let i = 0; i < n; i++) {
    sim.step(source(i * PARAMS.dt, state));
    state = sim.getState();
    onStep?.(state);
  }
  return state;
}

type Keys = Array<[t: number, value: number | boolean]>;

/** Value of one channel at t: held before the first and after the last key; booleans step. */
function sample(keys: Keys, t: number): number | boolean {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1] = keys[i];
    if (t < t1) {
      const [t0, v0] = keys[i - 1];
      if (typeof v0 === 'boolean' || typeof v1 === 'boolean') return v0;
      return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
    }
  }
  return keys[keys.length - 1][1];
}

/** Builds a source from keyframed channels, linearly interpolated; others hold NEUTRAL_INPUTS. */
export function keyframes(
  channels: Partial<Record<keyof Inputs, Array<[t: number, value: number | boolean]>>>,
): InputSource {
  const entries = (Object.entries(channels) as Array<[keyof Inputs, Keys | undefined]>)
    .filter((e): e is [keyof Inputs, Keys] => e[1] !== undefined && e[1].length > 0);
  return (t) => {
    const out: Record<string, number | boolean> = { ...NEUTRAL_INPUTS };
    for (const [key, keys] of entries) out[key] = sample(keys, t);
    return out as unknown as Inputs;
  };
}

const STROKE_RAMP = 0.06; // s

/** A pedal stroke starting at t0: ramps to `amount` over 60 ms, holds 60 ms, returns over 60 ms. */
export function pedalStroke(t0: number, amount: number): Array<[number, number]> {
  return [
    [t0, 0],
    [t0 + STROKE_RAMP, amount],
    [t0 + 2 * STROKE_RAMP, amount],
    [t0 + 3 * STROKE_RAMP, 0],
  ];
}

// ---- Autopilot -----------------------------------------------------------------------------

const AP = {
  upshiftRpm: 9000,
  downshiftRpm: 5000,
  stopRpm: 3000, // in first, below this the clutch is pulled and the bike braked to a stop
  antiStallRpm: 1800, // in gear below this the clutch is pulled whatever the phase
  launchSeconds: 1.5,
  launchThrottle: 0.35,
  launchRpm: 3500, // the lever is held back in proportion to how far the revs sag below this
  launchGain: 0.4, // lever travel per 1000 rpm of sag
  rideThrottle: 0.8,
  sixthSeconds: 3, // time held in sixth before closing the throttle
  decelBrake: 0.35,
  blipBand: 1500, // rpm short of the lower gear's speed at which the downshift blip is full
  idleSeconds: 2, // pause in neutral before the next lap
  leverOpen: PARAMS.clutch.leverFullRelease + 0.05, // just past where the clutch carries nothing
  pull: 0.08, // s, clutch pulled before the stroke starts
  strokeTime: 3 * STROKE_RAMP, // s, one pedalStroke
  settle: 0.32, // s after a stroke before it is judged a miss
  overStroke: 0.15, // extra stroke beyond the target detent, so a stroke lands in its well
  maxTries: 5,
  releaseUp: 0.25, releaseDown: 0.6, // s, clutch fed back out after a shift
  crankTimeout: 3, // s on the starter before resting it
} as const;

const STROKE = deg(PARAMS.drum.strokeDeg);
const N_ANGLE = deg(PARAMS.drum.detents.N);

type Target = 1 | 2 | 3 | 4 | 5 | 6 | 'N';
type Phase =
  | { kind: 'start'; t0: number }
  | { kind: 'idle'; t0: number }
  | { kind: 'launch'; t0: number }
  | { kind: 'ride'; t0: number }
  | { kind: 'decel'; t0: number }
  | { kind: 'stop'; t0: number }
  | { kind: 'shift'; t0: number; target: Target; tries: number; amount: number; then: Next }
  | { kind: 'release'; t0: number; seconds: number; throttle: number; then: 'ride' | 'decel' };
type Next = 'idle' | 'launch' | 'ride' | 'decel';

const targetAngle = (g: Target): number => deg(PARAMS.drum.detents[g]);

/** Signed stroke that carries the drum from where it is to just past the target detent. */
function strokeAmount(target: Target, angle: number): number {
  const diff = targetAngle(target) - angle;
  // from neutral the ratchet uses the short stroke, which lands on first or second as it is
  if (Math.abs(angle - N_ANGLE) < deg(5) && target !== 'N') return Math.sign(diff);
  return Math.sign(diff) * Math.min(1, Math.abs(diff) / STROKE + AP.overStroke);
}

const reached = (target: Target, s: SimState): boolean =>
  target === 'N'
    ? s.lockedGear === null && Math.abs(s.drum.angle - N_ANGLE) < deg(5)
    : s.lockedGear === target;

/**
 * The rider shown until the visitor touches a control: starts the engine, launches in first,
 * upshifts with the clutch at about 9000 rpm to sixth, closes the throttle and downshifts with
 * the clutch below about 5000 rpm, brakes to a stop in first, selects neutral and repeats.
 * Every decision is read from the state; a missed shift is retried with a stroke sized from
 * where the drum actually is, and every wait has a timeout.
 */
export function createAutopilot(): InputSource {
  let phase: Phase = { kind: 'start', t0: 0 };
  let lastT = 0;

  const enter = (kind: 'idle' | 'launch' | 'ride' | 'decel' | 'stop', t: number): Phase =>
    ({ kind, t0: t });
  const shiftTo = (target: Target, then: Next, t: number, s: SimState): Phase =>
    ({ kind: 'shift', t0: t, target, tries: 0, amount: strokeAmount(target, s.drum.angle), then });

  const decide = (t: number, s: SimState): Inputs => {
    // reused by a new runSource, script time restarts: begin again from what the state shows
    if (t < lastT) phase = { kind: 'start', t0: t };
    lastT = t;
    const r = toRpm(s.engine.omega);
    const base: Inputs = { ...NEUTRAL_INPUTS };
    const p = phase;
    const dt = t - p.t0;

    if (!s.engine.running && p.kind !== 'start') {
      phase = { kind: 'start', t0: t };
      return { ...base, clutchLever: 1 };
    }

    switch (p.kind) {
      case 'start': {
        if (s.engine.running) {
          phase = s.roadSpeed > 1 ? enter('decel', t) : enter('idle', t);
          return { ...base, clutchLever: 1 };
        }
        // crank with the clutch pulled; rest the starter briefly after a long try
        const cranking = dt % (AP.crankTimeout + 1) < AP.crankTimeout;
        return { ...base, clutchLever: 1, brake: s.roadSpeed > 0 ? 1 : 0, starter: cranking };
      }
      case 'idle': {
        if (s.roadSpeed > 0.5) { phase = enter('decel', t); return { ...base, clutchLever: 1 }; }
        if (dt >= AP.idleSeconds) {
          phase = s.lockedGear === 1 ? enter('launch', t) : shiftTo(1, 'launch', t, s);
          return { ...base, clutchLever: 1 };
        }
        return { ...base, clutchLever: s.lockedGear === null ? 0 : 1, brake: 1 };
      }
      case 'launch': {
        if (s.lockedGear !== 1) { phase = shiftTo(1, 'launch', t, s); return { ...base, clutchLever: 1 }; }
        // feed the clutch out on a ramp, holding it back in proportion as the revs sag
        const ramp = AP.leverOpen * (1 - Math.min(1, dt / AP.launchSeconds));
        const lever = clamp(ramp + (AP.launchGain * (AP.launchRpm - r)) / 1000, 0, AP.leverOpen);
        if (ramp === 0 && s.clutch.locked) phase = enter('ride', t);
        return { ...base, throttle: AP.launchThrottle, clutchLever: lever };
      }
      case 'ride': {
        const g = s.lockedGear;
        if (g === null) {
          phase = shiftTo(nearestGearAbove(s.drum.angle), 'ride', t, s);
          return { ...base, clutchLever: 1 };
        }
        if (g < 6 && r >= AP.upshiftRpm) {
          phase = shiftTo((g + 1) as Target, 'ride', t, s);
          return { ...base, clutchLever: 1 };
        }
        if (g === 6 && (dt >= AP.sixthSeconds || r >= AP.upshiftRpm)) {
          phase = enter('decel', t);
          return base;
        }
        if (g < 6) p.t0 = t; // keeps the sixth-gear timer at zero until sixth is in
        return { ...base, throttle: AP.rideThrottle };
      }
      case 'decel': {
        const g = s.lockedGear;
        if (s.roadSpeed === 0) { phase = enter('stop', t); return { ...base, clutchLever: 1, brake: 1 }; }
        if (g === null) {
          phase = shiftTo(nearestGearBelow(s.drum.angle), 'decel', t, s);
          return { ...base, clutchLever: 1, brake: AP.decelBrake };
        }
        if (g > 1 && r < AP.downshiftRpm) {
          phase = shiftTo((g - 1) as Target, 'decel', t, s);
          return { ...base, clutchLever: 1, brake: AP.decelBrake };
        }
        if (g === 1 && r < AP.stopRpm) {
          phase = enter('stop', t);
          return { ...base, clutchLever: 1, brake: 1 };
        }
        return antiStall({ ...base, brake: AP.decelBrake }, s, r);
      }
      case 'stop': {
        if (s.roadSpeed === 0) {
          phase = shiftTo('N', 'idle', t, s);
          return { ...base, clutchLever: 1, brake: 1 };
        }
        return { ...base, clutchLever: 1, brake: 1 };
      }
      case 'shift': {
        const brake = p.then === 'decel' ? AP.decelBrake : p.then === 'ride' ? 0 : 1;
        // on a downshift, blip toward the speed the engine will turn in the lower gear
        const blip = p.then === 'decel' && p.target !== 'N'
          ? clamp((matchRpm(p.target, s) - r) / AP.blipBand, 0, 1) : 0;
        const hold: Inputs = { ...base, clutchLever: 1, brake, throttle: blip };
        if (dt < AP.pull) return hold;
        const ds = dt - AP.pull;
        if (ds < AP.strokeTime) return { ...hold, pedal: sample(pedalStroke(0, p.amount), ds) as number };
        if (reached(p.target, s) && s.drum.omega === 0) { phase = afterShift(p, t); return hold; }
        if (ds >= AP.strokeTime + AP.settle) {
          if (reached(p.target, s) || p.tries + 1 >= AP.maxTries) { phase = afterShift(p, t); return hold; }
          // missed: try again with a stroke sized from where the drum stopped
          phase = { ...p, t0: t - AP.pull, tries: p.tries + 1, amount: strokeAmount(p.target, s.drum.angle) };
        }
        return hold;
      }
      case 'release': {
        const k = Math.min(1, dt / p.seconds);
        if (k >= 1) phase = enter(p.then, t);
        const brake = p.then === 'decel' ? AP.decelBrake : 0;
        return antiStall({ ...base, throttle: p.throttle, brake, clutchLever: AP.leverOpen * (1 - k) }, s, r);
      }
    }
  };

  const afterShift = (p: Extract<Phase, { kind: 'shift' }>, t: number): Phase => {
    if (p.then === 'ride') return { kind: 'release', t0: t, seconds: AP.releaseUp, throttle: AP.rideThrottle, then: 'ride' };
    if (p.then === 'decel') return { kind: 'release', t0: t, seconds: AP.releaseDown, throttle: 0, then: 'decel' };
    return enter(p.then, t);
  };

  return (t, s) => decide(t, s);
}

/** Engine speed that matches the road speed in gear g. */
const matchRpm = (g: 1 | 2 | 3 | 4 | 5 | 6, s: SimState): number =>
  toRpm(s.outputShaftOmega * gearRatio(g) * primaryRatio);

/** In gear and bogging: pull the clutch rather than stall. */
function antiStall(u: Inputs, s: SimState, r: number): Inputs {
  return s.lockedGear !== null && r < AP.antiStallRpm ? { ...u, clutchLever: 1 } : u;
}

const GEARS = [1, 2, 3, 4, 5, 6] as const;
const nearestGearAbove = (angle: number): Target =>
  GEARS.find((g) => targetAngle(g) >= angle) ?? 6;
const nearestGearBelow = (angle: number): Target =>
  [...GEARS].reverse().find((g) => targetAngle(g) <= angle) ?? 1;

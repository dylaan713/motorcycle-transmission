import { PARAMS } from './params';
import { clamp, deg } from './units';
import type { SliderId } from './types';

const D = PARAMS.drum;
const PEDAL_DEADBAND = 0.05;
const NEUTRAL_CAPTURE = deg(5); // a stroke starting this close to N uses the short stroke
const PAWL_K = D.pawlStiffness / deg(1); // N·m/rad

export const DRUM_MIN: number = deg(0);
export const DRUM_MAX: number = deg(300);

type DetentName = 1 | 2 | 3 | 4 | 5 | 6 | 'N';
const DETENTS: { name: DetentName; angle: number }[] = (
  [1, 'N', 2, 3, 4, 5, 6] as const
).map((name) => ({ name, angle: deg(D.detents[name]) }));

const N_ANGLE = deg(D.detents.N);
const SECOND_ANGLE = deg(D.detents[2]);
const SHORT_PERIOD = deg(30); // 1st / N / 2nd wells
const LONG_PERIOD = deg(60); // 2nd .. 6th wells

/** Restoring torque from the star wheel: zero at each detent and at each peak between them. */
export const detentTorque = (angle: number): number => {
  if (angle < SECOND_ANGLE) {
    const well = clamp(Math.round(angle / SHORT_PERIOD) * SHORT_PERIOD, DRUM_MIN, SECOND_ANGLE);
    const peak = Math.abs(angle - N_ANGLE) < SHORT_PERIOD / 2 ? D.neutralDetentPeak : D.detentPeak;
    return -peak * Math.sin((2 * Math.PI * (angle - well)) / SHORT_PERIOD);
  }
  const well = clamp(
    SECOND_ANGLE + Math.round((angle - SECOND_ANGLE) / LONG_PERIOD) * LONG_PERIOD,
    SECOND_ANGLE, DRUM_MAX,
  );
  return -D.detentPeak * Math.sin((2 * Math.PI * (angle - well)) / LONG_PERIOD);
};

/** Closest detent to a drum angle; error = angle - detent angle (rad). */
export const nearestDetent = (angle: number): { name: DetentName; angle: number; error: number } => {
  let best = DETENTS[0];
  for (const d of DETENTS) if (Math.abs(angle - d.angle) < Math.abs(angle - best.angle)) best = d;
  return { name: best.name, angle: best.angle, error: angle - best.angle };
};

/** 1 within grooveFullDeg of the gear's detent, 0 beyond grooveZeroDeg, linear between. */
const grooveReach = (gear: 1 | 2 | 3 | 4 | 5 | 6, angle: number): number => {
  const d = Math.abs(angle - deg(D.detents[gear]));
  const full = deg(D.grooveFullDeg);
  const zero = deg(D.grooveZeroDeg);
  return clamp((zero - d) / (zero - full), 0, 1);
};

/** Commanded slider position in [-1, 1]: negative toward its neg gear, positive toward its pos gear. */
export const grooveCommand = (slider: SliderId, angle: number): number => {
  const s = PARAMS.sliders[slider];
  return grooveReach(s.pos, angle) - grooveReach(s.neg, angle); // pos - neg avoids -0
};

/** Pedal ratchet: torque the pawl puts on the drum and the updated ratchet state. */
export function pawlTorque(
  pedal: number, drumAngle: number, ratchet: { armed: boolean; strokeStartAngle: number },
): { torque: number; ratchet: { armed: boolean; strokeStartAngle: number } } {
  if (Math.abs(pedal) < PEDAL_DEADBAND) {
    return { torque: 0, ratchet: { armed: true, strokeStartAngle: drumAngle } };
  }
  const start = ratchet.strokeStartAngle;
  const stroke = Math.abs(start - N_ANGLE) < NEUTRAL_CAPTURE ? D.strokeFromNeutralDeg : D.strokeDeg;
  const dir = Math.sign(pedal);
  const target = clamp(start + dir * Math.abs(pedal) * deg(stroke), DRUM_MIN, DRUM_MAX);
  const raw = clamp(PAWL_K * (target - drumAngle), -D.footTorqueMax, D.footTorqueMax);
  const torque = raw * dir > 0 ? raw : 0; // the pawl pushes, never pulls back
  return { torque, ratchet: { armed: false, strokeStartAngle: start } };
}

/**
 * One timestep of drum motion. Damping is integrated implicitly (its time constant is
 * shorter than dt); Coulomb friction is applied as a bounded impulse so it can hold the drum.
 */
export function stepDrum(
  drum: { angle: number; omega: number }, appliedTorque: number, dt: number,
): { angle: number; omega: number } {
  const denom = 1 + (dt * D.damping) / D.inertia;
  const free = (drum.omega + (dt * appliedTorque) / D.inertia) / denom;
  const frictionDv = (dt * D.friction) / D.inertia / denom;
  let omega = Math.abs(free) <= frictionDv ? 0 : free - Math.sign(free) * frictionDv;
  let angle = drum.angle + omega * dt;
  if (angle <= DRUM_MIN) { angle = DRUM_MIN; if (omega < 0) omega = 0; }
  if (angle >= DRUM_MAX) { angle = DRUM_MAX; if (omega > 0) omega = 0; }
  return { angle, omega };
}

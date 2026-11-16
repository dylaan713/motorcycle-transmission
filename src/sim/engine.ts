import { PARAMS } from './params';
import { clamp, rpm, toRpm } from './units';

const E = PARAMS.engine;

/** Full-throttle torque (N·m): interpolated curve, end values held, 0 above the limiter. */
export const fullThrottleTorque = (omega: number): number => {
  if (omega > rpm(E.limiterRpm)) return 0;
  const r = toRpm(omega);
  const c = E.torqueCurve;
  if (r <= c[0][0]) return c[0][1];
  for (let i = 1; i < c.length; i++) {
    const [r1, t1] = c[i];
    if (r <= r1) {
      const [r0, t0] = c[i - 1];
      return t0 + ((t1 - t0) * (r - r0)) / (r1 - r0);
    }
  }
  return c[c.length - 1][1];
};

/** Closed-throttle (engine braking) torque, negative. */
export const closedThrottleTorque = (omega: number): number =>
  E.closedThrottle.base + E.closedThrottle.perRpm * toRpm(omega);

/**
 * Extra drag above the limiter (negative), rising steeply with the over-rev. The limiter only cuts
 * fuel; this is what resists the wheel forcing the crank past it, as on a missed downshift.
 */
export const overRevTorque = (omega: number): number =>
  -E.overRevDrag * Math.max(0, toRpm(omega) - E.limiterRpm);

// Throttle that exactly holds idleRpm with no load, so the idle controller settles on idleRpm.
const IDLE_FEEDFORWARD = -closedThrottleTorque(rpm(E.idleRpm))
  / (fullThrottleTorque(rpm(E.idleRpm)) - closedThrottleTorque(rpm(E.idleRpm)));

/** Net crank torque before the clutch load; includes idle control, limiter, over-rev drag and starter. */
export function engineTorque(
  omega: number, running: boolean, throttle: number, ignition: boolean, starter: boolean,
): number {
  const closed = closedThrottleTorque(omega);
  if (running) {
    const idle = clamp(
      IDLE_FEEDFORWARD + (E.idleMaxThrottle * (E.idleRpm - toRpm(omega))) / 300, 0, E.idleMaxThrottle,
    );
    const eff = Math.max(clamp(throttle, 0, 1), idle);
    return closed + eff * (fullThrottleTorque(omega) - closed) + overRevTorque(omega);
  }
  // Not running: drag only opposes forward rotation, so it never pushes the crank backwards.
  const drag = omega > 0 ? closed + overRevTorque(omega) : 0;
  return drag + (starter && ignition ? E.starterTorque : 0);
}

/** Start/stall transition. */
export function nextRunning(omega: number, running: boolean, ignition: boolean): boolean {
  if (!ignition) return false;
  if (!running) return omega > rpm(E.startRpm);
  return omega >= rpm(E.stallRpm);
}

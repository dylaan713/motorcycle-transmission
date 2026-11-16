import { PARAMS } from './params';
import { clamp } from './units';

const C = PARAMS.clutch;
const LOCK_SLIP = 0.05; // rad/s

/** Peak torque the clutch can carry with the lever released. */
export const clutchCapacityMax: number = C.surfaces * C.mu * C.clampForce * C.meanRadius;

/** Capacity falls linearly with lever travel to 0 at leverFullRelease. */
export const clutchCapacity = (lever: number): number =>
  clutchCapacityMax * (1 - clamp(lever / C.leverFullRelease, 0, 1));

/** Viscous drag, sign of slip, capped at dragMax. */
export const clutchDrag = (slip: number): number =>
  clamp(C.dragCoeff * slip, -C.dragMax, C.dragMax);

/**
 * Torque the clutch applies to the input shaft (and the opposite to the basket).
 * slip = basket speed - input shaft speed; lockTorque = torque that would hold slip at zero this step.
 */
export function clutchTorque(
  slip: number, lockTorque: number, capacity: number,
): { torque: number; locked: boolean } {
  if (Math.abs(slip) < LOCK_SLIP && Math.abs(lockTorque) <= capacity) {
    return { torque: lockTorque, locked: true };
  }
  const dir = slip !== 0 ? Math.sign(slip) : Math.sign(lockTorque);
  return { torque: dir * capacity + clutchDrag(slip), locked: false };
}

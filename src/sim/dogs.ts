import { PARAMS } from './params';
import { clamp, deg, wrap } from './units';
import { gearRatio } from './kinematics';
import type { GearId, SliderId, SliderState } from './types';

const DG = PARAMS.dogs;
const PITCH = (2 * Math.PI) / DG.count;
const WINDOW = deg(DG.windowDeg);
const CENTRE_DEADBAND = 0.05; // |x| below this heads for no gear

/** True when the dogs line up with the slots: within windowDeg of each dog pitch. */
export const dogAligned = (phi: number): boolean => wrap(phi, PITCH) < WINDOW;

/** Which gear a slider is heading for at position x, or null near centre. */
export const targetGear = (slider: SliderId, x: number): GearId | null => {
  if (Math.abs(x) < CENTRE_DEADBAND) return null;
  const s = PARAMS.sliders[slider];
  return x < 0 ? s.neg : s.pos;
};

/**
 * Speeds after a dog locks pair g. Conserves g·Jin·ωin + Jout·ωout (momentum referred to the
 * output shaft) and ends with ωin = g·ωout.
 */
export function engageSpeeds(
  g: GearId, inputOmega: number, outputOmega: number, inputInertia: number, outputInertia: number,
): { inputOmega: number; outputOmega: number } {
  const r = gearRatio(g);
  const momentum = r * inputInertia * inputOmega + outputInertia * outputOmega;
  const out = momentum / (r * r * inputInertia + outputInertia);
  return { inputOmega: r * out, outputOmega: out };
}

/** Axial force (N) needed to pull a dog out while it carries dogTorque (N·m). */
export const withdrawalForce = (dogTorque: number): number =>
  (DG.mu * Math.abs(dogTorque)) / DG.radius;

/**
 * One timestep for one slider. relativeOmega is the slider's speed minus the speed of the free
 * gear it is heading for; dogTorque is the torque through the dog while locked.
 */
export function stepSlider(
  slider: SliderId, s: SliderState, command: number, relativeOmega: number, dogTorque: number, dt: number,
): { state: SliderState; justLocked: GearId | null; forkForce: number } {
  const forkForce = DG.forkForceMax * clamp((command - s.x) / DG.forkCompliance, -1, 1);
  const maxStep = DG.sliderRate * dt;
  let x = s.x + clamp(command - s.x, -maxStep, maxStep);
  // kept within one dog pitch so long runs do not lose precision; locked dogs do not rotate
  const phi = s.locked === null ? wrap(s.phi + relativeOmega * dt, PITCH) : s.phi;
  const outward = Math.abs(x) > Math.abs(s.x);

  if (s.locked !== null) {
    if (!outward && x !== s.x && Math.abs(forkForce) <= withdrawalForce(dogTorque)) x = s.x;
    const locked = Math.abs(x) < DG.contactX ? null : s.locked;
    return { state: { x, phi, locked, blocked: false }, justLocked: null, forkForce };
  }

  if (outward && Math.abs(x) > DG.contactX) {
    if (!dogAligned(phi)) {
      return {
        state: { x: Math.sign(x) * DG.contactX, phi, locked: null, blocked: true },
        justLocked: null, forkForce,
      };
    }
    const gear = targetGear(slider, x);
    return { state: { x, phi, locked: gear, blocked: false }, justLocked: gear, forkForce };
  }

  return { state: { x, phi, locked: null, blocked: false }, justLocked: null, forkForce };
}

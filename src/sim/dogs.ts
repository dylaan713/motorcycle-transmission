import { PARAMS } from './params';
import { clamp, deg, wrap } from './units';
import { freeGearAngle, gearRatio } from './kinematics';
import type { DogSide, GearId, ShaftAngles, SliderId, SliderState } from './types';

const DG = PARAMS.dogs;
const PITCH = (2 * Math.PI) / DG.count;
const WINDOW = deg(DG.windowDeg);
const CENTRE_DEADBAND = 0.05; // |x| below this heads for no gear

/**
 * How far a slider has turned against the free gear on `side`, unwrapped: its shaft angle minus
 * that gear's angle, both in the slider shaft's forward sense. It changes at the slider's speed
 * minus the gear's, and holds still while that pair is locked, since the locked pair turns together.
 */
export function dogTurn(slider: SliderId, side: DogSide, angles: ShaftAngles): number {
  const s = PARAMS.sliders[slider];
  const shaft = s.shaft === 'input' ? angles.input : angles.output;
  return shaft - freeGearAngle(s[side], angles);
}

/** Angle of a slider's dogs against the lugs of the gear on `side`, wrapped to one dog pitch. */
export const dogPhase = (slider: SliderId, side: DogSide, angles: ShaftAngles, phase: number): number =>
  wrap(dogTurn(slider, side, angles) + phase, PITCH);

/** The side of a slider that locks gear g. */
export const sideOf = (slider: SliderId, g: GearId): DogSide => (PARAMS.sliders[slider].neg === g ? 'neg' : 'pos');

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

export interface SliderStep { state: SliderState; justLocked: GearId | null; forkForce: number }

/**
 * One timestep for one slider on its own, integrating phi from relativeOmega: the slider's speed
 * minus the speed of the free gear it is heading for. dogTorque is the torque through the dog while
 * locked. The simulation derives phi from the shaft angles instead and calls moveSlider.
 */
export function stepSlider(
  slider: SliderId, s: SliderState, command: number, relativeOmega: number, dogTorque: number, dt: number,
): SliderStep {
  // kept within one dog pitch so long runs do not lose precision; locked dogs do not rotate
  const phi = s.locked === null ? wrap(s.phi + relativeOmega * dt, PITCH) : s.phi;
  return moveSlider(slider, s, command, phi, dogTorque, dt);
}

/**
 * One timestep for one slider whose dog angle at the end of the step is phi: the fork moves it
 * toward command, and a dog reaching the contact point drops in only when phi is aligned.
 */
export function moveSlider(
  slider: SliderId, s: SliderState, command: number, phi: number, dogTorque: number, dt: number,
): SliderStep {
  const forkForce = DG.forkForceMax * clamp((command - s.x) / DG.forkCompliance, -1, 1);
  const maxStep = DG.sliderRate * dt;
  let x = s.x + clamp(command - s.x, -maxStep, maxStep);
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

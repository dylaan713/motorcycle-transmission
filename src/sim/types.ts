export type GearId = 1 | 2 | 3 | 4 | 5 | 6;
export type SliderId = 'A' | 'B' | 'C';
/** A drum detent: one per gear, and neutral between first and second. */
export type DetentName = GearId | 'N';

export interface Inputs {
  throttle: number; // 0..1
  clutchLever: number; // 0 released .. 1 fully pulled
  pedal: number; // -1 full down .. +1 full up, 0 at rest
  brake: number; // 0..1
  ignition: boolean;
  starter: boolean;
  handDrumTorque: number; // N·m, for direct manipulation
  handWheelTorque: number; // N·m at the rear wheel
  handInputShaftTorque: number; // N·m
}

export const NEUTRAL_INPUTS: Inputs = {
  throttle: 0,
  clutchLever: 0,
  pedal: 0,
  brake: 0,
  ignition: true,
  starter: false,
  handDrumTorque: 0,
  handWheelTorque: 0,
  handInputShaftTorque: 0,
};

export interface SliderState {
  x: number;
  phi: number;
  locked: GearId | null;
  blocked: boolean;
}

/** Which way a slider moves: negative x toward its neg gear, positive toward its pos gear. */
export type DogSide = 'neg' | 'pos';

/**
 * A slider inside the simulation. Its phi is derived, not integrated: the angle of its dogs against
 * the lugs of the gear on `side`, from the shaft angles plus that dog ring's fixed `phase` offset.
 */
export interface SimSliderState extends SliderState {
  side: DogSide; // the gear it is heading for, or last headed for
  phase: Record<DogSide, number>; // rad, fixed angular offset of the dogs against each gear's lugs
}

/** Shaft angles, unwrapped, rad, each positive in its own shaft's forward sense of rotation. */
export interface ShaftAngles {
  crank: number;
  input: number;
  output: number;
}

export interface SimState {
  t: number;
  engine: { omega: number; running: boolean; torque: number };
  clutch: { capacity: number; torque: number; slip: number; locked: boolean };
  inputShaftOmega: number;
  outputShaftOmega: number;
  roadSpeed: number; // m/s
  // detent: the detent the drum is seated in (within 3°), null between detents (a false neutral)
  drum: { angle: number; omega: number; detent: DetentName | null };
  // strokeStartAngle: drum angle where the current pedal stroke began; travel: the sanitised pedal
  // input of the last step, -1 full down .. +1 full up, 0 at rest (for drawing the pedal)
  pedal: { strokeStartAngle: number; travel: number };
  sliders: Record<SliderId, SimSliderState>;
  lockedGear: GearId | null; // null = neutral or false neutral
  dogTorque: number; // N·m through the locked dog, signed
  angles: ShaftAngles;
}

/** Every field optional, recursively; used to patch a SimState. */
export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

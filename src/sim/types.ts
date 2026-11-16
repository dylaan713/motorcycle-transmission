export type GearId = 1 | 2 | 3 | 4 | 5 | 6;
export type SliderId = 'A' | 'B' | 'C';

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

export interface SimState {
  t: number;
  engine: { omega: number; running: boolean; torque: number };
  clutch: { capacity: number; torque: number; slip: number; locked: boolean };
  inputShaftOmega: number;
  outputShaftOmega: number;
  roadSpeed: number; // m/s
  drum: { angle: number; omega: number };
  pedal: { armed: boolean; strokeStartAngle: number };
  sliders: Record<SliderId, SliderState>;
  lockedGear: GearId | null; // null = neutral or false neutral
  dogTorque: number; // N·m through the locked dog, signed
}

/** Every field optional, recursively; used to patch a SimState. */
export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

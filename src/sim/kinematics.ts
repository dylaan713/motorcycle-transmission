import { PARAMS } from './params';
import type { GearId, ShaftAngles } from './types';

export type Shaft = 'input' | 'output';

export const primaryRatio: number = PARAMS.primary.driven / PARAMS.primary.drive;
export const finalRatio: number = PARAMS.final.rear / PARAMS.final.front;

/** Output teeth / input teeth of the pair for gear g. */
export const gearRatio = (g: GearId): number => {
  const [input, output] = PARAMS.gears[g];
  return output / input;
};

/** Crank revolutions per rear wheel revolution. */
export const overallRatio = (g: GearId): number => primaryRatio * gearRatio(g) * finalRatio;

/** Road speed (m/s) from output shaft speed (rad/s). */
export const roadSpeed = (outputOmega: number): number =>
  (outputOmega / finalRatio) * PARAMS.wheelRadius;

export const outputOmegaFromRoad = (v: number): number => (v / PARAMS.wheelRadius) * finalRatio;

/** Speed of the free-spinning gear of pair g. Gears 1 to 4 are free on the output shaft, 5 and 6 on the input shaft. */
export const freeGearOmega = (g: GearId, inputOmega: number, outputOmega: number): number =>
  g <= 4 ? inputOmega / gearRatio(g) : outputOmega * gearRatio(g);

/** The shaft that gear g's free gear spins on (it is driven by its partner on the other shaft). */
export const freeShaftOf = (g: GearId): Shaft => (g <= 4 ? 'output' : 'input');

/**
 * Angle the free gear of pair g has turned, in the forward sense of the shaft it spins on: the
 * integral of freeGearOmega. A slider's dog angle against that gear is its shaft angle minus this.
 */
export const freeGearAngle = (g: GearId, angles: ShaftAngles): number =>
  freeShaftOf(g) === 'output' ? angles.input / gearRatio(g) : angles.output * gearRatio(g);

/**
 * Angle of a gear as drawn, in one frame shared by both shafts. Meshing gears turn in opposite
 * senses, so the output shaft, whose angle is counted positive in its own forward sense, draws at
 * -angles.output. Fixed and sliding gears take their shaft's drawn angle; a free gear follows its
 * meshing partner on the other shaft, turning the other way by the tooth ratio.
 */
export function gearAngle(shaft: Shaft, g: GearId, angles: ShaftAngles): number {
  const free = freeShaftOf(g) === shaft;
  if (shaft === 'input') return free ? angles.output * gearRatio(g) : angles.input;
  return free ? -angles.input / gearRatio(g) : -angles.output;
}

/** Vehicle mass and wheel inertia reflected to the output shaft (kg·m²). */
export const reflectedVehicleInertia: number =
  (PARAMS.mass * PARAMS.wheelRadius ** 2 + PARAMS.wheelInertia) / finalRatio ** 2;

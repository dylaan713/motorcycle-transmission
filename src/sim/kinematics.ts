import { PARAMS } from './params';
import type { GearId } from './types';

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

/** Vehicle mass and wheel inertia reflected to the output shaft (kg·m²). */
export const reflectedVehicleInertia: number =
  (PARAMS.mass * PARAMS.wheelRadius ** 2 + PARAMS.wheelInertia) / finalRatio ** 2;

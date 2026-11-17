import { PARAMS } from '../sim/params';
import type { GearId, SimState, SliderId } from '../sim/types';
import { GEAR_ORDER, gearKind, sliderOfGear } from './geometry';
import type { PartId } from './parts';

export interface TorquePath { parts: PartId[]; torque: number; slipping: boolean; reach: 'none' | 'clutch' | 'inputShaft' | 'wheel' }

const MIN_TORQUE = 0.5; // N·m; below this nothing is shown as carrying torque
const MIN_SLIP = 0.5; // rad/s
const TO_INPUT: readonly PartId[] = [
  'crank', 'primaryDrive', 'clutchBasket', 'frictionPlates', 'steelPlates', 'clutchHub', 'inputShaft',
];
const TO_WHEEL: readonly PartId[] = ['outputShaft', 'sprocket', 'chain', 'rearSprocket', 'rearWheel'];
const SLIDER_IDS = Object.keys(PARAMS.sliders) as SliderId[];

/**
 * The gears torque passes between the shafts in gear g: the locked pair, and the sliding piece whose
 * dogs lock its free gear to the shaft, listed in the order the torque reaches them. A sliding piece
 * that carries two gears (third and fourth) is one rigid part, so both are listed, in axial order.
 */
function throughGears(g: GearId): PartId[] {
  const id = SLIDER_IDS.find((k) => PARAMS.sliders[k].neg === g || PARAMS.sliders[k].pos === g)!;
  const { shaft } = PARAMS.sliders[id];
  const end = shaft === 'input' ? 'in' : 'out';
  const piece = GEAR_ORDER
    .filter((h) => gearKind(shaft, h) === 'slider' && sliderOfGear(shaft, h) === id)
    .map((h): PartId => `gear${h}${end}`);
  const pair: PartId[] = [`gear${g}in`, `gear${g}out`];
  return shaft === 'input' ? [...piece, ...pair] : [...pair, ...piece];
}
const THROUGH: Record<GearId, readonly PartId[]> = {
  1: throughGears(1), 2: throughGears(2), 3: throughGears(3), 4: throughGears(4), 5: throughGears(5), 6: throughGears(6),
};

/**
 * The parts carrying torque from the crank, as far as it gets. Its size is the clutch torque; in
 * gear it takes the sign of the dog torque, so it goes negative when the wheel drives the engine.
 * Out of gear, and below MIN_TORQUE where no part is listed, torque is the clutch torque itself.
 */
export function torquePath(state: SimState): TorquePath {
  const size = Math.abs(state.clutch.torque);
  const slipping = !state.clutch.locked && Math.abs(state.clutch.slip) > MIN_SLIP;
  if (size < MIN_TORQUE) return { parts: [], torque: state.clutch.torque, slipping, reach: 'none' };
  const g = state.lockedGear;
  if (g === null) return { parts: [...TO_INPUT], torque: state.clutch.torque, slipping, reach: 'inputShaft' };
  const sign = Math.sign(state.dogTorque) || Math.sign(state.clutch.torque);
  return {
    parts: [...TO_INPUT, ...THROUGH[g], ...TO_WHEEL],
    torque: sign * size,
    slipping,
    reach: 'wheel',
  };
}

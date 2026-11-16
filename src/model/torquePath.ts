import type { SimState } from '../sim/types';
import type { PartId } from './parts';

export interface TorquePath { parts: PartId[]; torque: number; slipping: boolean; reach: 'none' | 'clutch' | 'inputShaft' | 'wheel' }

const MIN_TORQUE = 0.5; // N·m; below this nothing is shown as carrying torque
const MIN_SLIP = 0.5; // rad/s
const TO_INPUT: readonly PartId[] = [
  'crank', 'primaryDrive', 'clutchBasket', 'frictionPlates', 'steelPlates', 'clutchHub', 'inputShaft',
];
const TO_WHEEL: readonly PartId[] = ['outputShaft', 'sprocket', 'chain', 'rearSprocket', 'rearWheel'];

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
    parts: [...TO_INPUT, `gear${g}in`, `gear${g}out`, ...TO_WHEEL],
    torque: sign * size,
    slipping,
    reach: 'wheel',
  };
}

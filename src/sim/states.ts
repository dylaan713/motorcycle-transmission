import { PARAMS } from './params';
import { deg, rpm } from './units';
import { gearRatio, primaryRatio } from './kinematics';
import type { DeepPartial, GearId, SimState, SliderId } from './types';

const SLIDER_IDS: readonly SliderId[] = ['A', 'B', 'C'];

/** The slider that locks gear g. */
const sliderFor = (g: GearId): SliderId =>
  SLIDER_IDS.find((k) => PARAMS.sliders[k].neg === g || PARAMS.sliders[k].pos === g)!;

/**
 * A setState patch for riding steadily in gear g at engineRpm: drum seated at g's detent, its
 * slider locked, clutch locked, shafts at the speeds the ratios give. Applied to a reset
 * simulation, so the other sliders sit in neutral.
 */
export function inGearPatch(g: GearId, engineRpm: number): DeepPartial<SimState> {
  const wOut = rpm(engineRpm) / primaryRatio / gearRatio(g);
  const id = sliderFor(g);
  const x = PARAMS.sliders[id].neg === g ? -1 : 1;
  return {
    drum: { angle: deg(PARAMS.drum.detents[g]), omega: 0 },
    sliders: { [id]: { x, phi: 0, locked: g, blocked: false } },
    lockedGear: g,
    engine: { omega: rpm(engineRpm), running: true },
    clutch: { locked: true },
    inputShaftOmega: wOut * gearRatio(g),
    outputShaftOmega: wOut,
  };
}

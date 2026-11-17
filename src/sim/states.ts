import { PARAMS } from './params';
import { deg, rpm } from './units';
import { gearRatio, primaryRatio } from './kinematics';
import { grooveCommand } from './shiftDrum';
import { targetGear } from './dogs';
import type { DeepPartial, GearId, SimSliderState, SimState, SliderId } from './types';

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

/** Dog angle that puts a slider's dogs face to face with the lugs: mid-way between two slots. */
const FACE_TO_FACE = deg(40);

/**
 * A setState patch for a bike at rest with the engine stopped: engine and shafts still, drum at
 * drumDeg, and every slider where its groove puts it. Past the dog contact point a slider is
 * locked in its gear, or, if it is the `misaligned` one, held face to face against it (blocked).
 * The misaligned slider's dogs are set face to face in every case. Applied to a reset simulation.
 */
export function engineOffPatch(drumDeg: number, misaligned?: SliderId): DeepPartial<SimState> {
  const angle = deg(drumDeg);
  const sliders: DeepPartial<Record<SliderId, SimSliderState>> = {};
  for (const id of SLIDER_IDS) {
    const cmd = grooveCommand(id, angle);
    const gear = targetGear(id, cmd);
    const engaged = gear !== null && Math.abs(cmd) > PARAMS.dogs.contactX;
    const blocked = engaged && id === misaligned;
    sliders[id] = {
      x: blocked ? Math.sign(cmd) * PARAMS.dogs.contactX : cmd,
      locked: engaged && !blocked ? gear : null,
      blocked,
      ...(id === misaligned ? { phi: FACE_TO_FACE } : {}),
    };
  }
  return {
    engine: { omega: 0, running: false },
    inputShaftOmega: 0,
    outputShaftOmega: 0,
    drum: { angle, omega: 0 },
    sliders,
  };
}

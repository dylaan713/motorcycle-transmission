import { PARAMS } from '../sim/params';
import { gearAngle as simGearAngle } from '../sim/kinematics';
import { dogPhase as simDogPhase } from '../sim/dogs';
import type { SimState, SliderId } from '../sim/types';
import type { GearNo } from './parts';

/** Gear module, m; pitch radius = teeth * MODULE / 2. */
export const MODULE = 0.0025;
/** Every pair has 50 teeth in all, so every pair meshes at this distance, m. */
export const CENTRE_DISTANCE: number = (50 * MODULE) / 2;
export const FACE_WIDTH = 0.014;
/** Axial order of the gear pairs, left to right. */
export const GEAR_ORDER: readonly GearNo[] = [1, 5, 3, 4, 6, 2];
/** Axial distance between neighbouring gears in GEAR_ORDER, m. */
export const GEAR_PITCH = 0.021;
/** How far a slider moves axially per unit of its x, m. */
export const SLIDER_TRAVEL = 0.004;

type Shaft = 'input' | 'output';
export type GearKind = 'fixed' | 'free' | 'slider';

// The sliding gears: third and fourth are one piece on the input shaft; fifth and sixth slide on the output.
const SLIDING: Record<Shaft, Partial<Record<GearNo, SliderId>>> = {
  input: { 3: 'C', 4: 'C' },
  output: { 5: 'A', 6: 'B' },
};
// Gears 1 to 4 spin free on the output shaft, 5 and 6 on the input shaft.
const isFree = (shaft: Shaft, g: GearNo): boolean => (shaft === 'output' ? g <= 4 : g >= 5);

export const gearKind = (shaft: Shaft, g: GearNo): GearKind =>
  SLIDING[shaft][g] !== undefined ? 'slider' : isFree(shaft, g) ? 'free' : 'fixed';

export const sliderOfGear = (shaft: Shaft, g: GearNo): SliderId | null => SLIDING[shaft][g] ?? null;

export const pitchRadius = (shaft: Shaft, g: GearNo): number =>
  (PARAMS.gears[g][shaft === 'input' ? 0 : 1] * MODULE) / 2;

/** Axial centre of gear pair g at rest, m, with the middle of the gear train at 0. */
export const gearAxialPosition = (g: GearNo): number =>
  (GEAR_ORDER.indexOf(g) - (GEAR_ORDER.length - 1) / 2) * GEAR_PITCH;

/**
 * Drawn angle of any gear given the state's shaft angles, in one frame for both shafts: input
 * shaft gears at angles.input, output shaft gears at -angles.output, and a free gear following its
 * meshing partner the other way round by the tooth ratio.
 */
export const gearAngle = (shaft: Shaft, g: GearNo, angles: SimState['angles']): number =>
  simGearAngle(shaft, g, angles);

/**
 * Angle of a slider's dogs against the lugs and slots of the gear on that side, rad, wrapped to
 * one dog pitch (2π/5), measured in the slider's own shaft's forward sense. The simulation tests
 * alignment on this same angle.
 */
export const dogPhase = (slider: SliderId, side: 'neg' | 'pos', state: SimState): number =>
  simDogPhase(slider, side, state.angles, state.sliders[slider].phase[side]);

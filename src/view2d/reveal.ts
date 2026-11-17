import { PART_GROUPS, type PartId } from '../model/parts';
import { clamp } from '../sim/units';

const group = (title: string): readonly PartId[] => PART_GROUPS.find((g) => g.title === title)!.parts;
const shafts = group('Shafts and gears');
const onInput = (id: PartId): boolean => id === 'inputShaft' || /^gear\din$/.test(id);

/**
 * The arrival's order, the way the torque travels: crank and clutch, the input shaft and its gears,
 * the output shaft and its gears, the final drive; the shift mechanism, which carries no drive, last.
 */
export const REVEAL_ORDER: readonly PartId[] = [
  ...group('Clutch'),
  ...shafts.filter(onInput),
  ...shafts.filter((id) => !onInput(id)),
  ...group('Final drive'),
  ...group('Shift mechanism'),
];

/** Share of the arrival over which each part fades in. */
export const REVEAL_FADE = 0.15;

/**
 * Opacity of the part at `index` in REVEAL_ORDER at arrival progress 0..1. Part i starts at
 * i/(n-1) of (1 - REVEAL_FADE), so none starts before its share of the arrival is past, and the
 * last is fully drawn at 1.
 */
export function revealAlpha(index: number, progress: number): number {
  const n = REVEAL_ORDER.length;
  const start = (index / (n - 1)) * (1 - REVEAL_FADE);
  return clamp((progress - start) / REVEAL_FADE, 0, 1);
}

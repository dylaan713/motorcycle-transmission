import { test, expect } from 'vitest';
import { gearRatio } from '../../src/sim/kinematics';
import { createSimulation } from '../../src/sim/simulation';
import { deg } from '../../src/sim/units';
import {
  CENTRE_DISTANCE, FACE_WIDTH, GEAR_ORDER, GEAR_PITCH, SLIDER_TRAVEL, dogPhase, gearAngle,
  gearAxialPosition, gearKind, pitchRadius, sliderOfGear,
} from '../../src/model/geometry';
import { inGear, inp, run } from '../sim/helpers';

const PITCH = (2 * Math.PI) / 5;
/** Distance between two dog phases, the short way round one pitch. */
const phaseGap = (a: number, b: number): number => {
  const d = (((a - b) % PITCH) + PITCH) % PITCH;
  return Math.min(d, PITCH - d);
};

test('axial order and kinds', () => {
  expect(GEAR_ORDER).toEqual([1, 5, 3, 4, 6, 2]);
  expect(gearKind('input', 1)).toBe('fixed');
  expect(gearKind('input', 3)).toBe('slider');
  expect(gearKind('input', 5)).toBe('free');
  expect(gearKind('output', 5)).toBe('slider');
  expect(gearKind('output', 1)).toBe('free');
  expect(sliderOfGear('output', 6)).toBe('B');
  expect(sliderOfGear('input', 4)).toBe('C');
  expect(sliderOfGear('input', 1)).toBeNull();
});
test('every pair meshes at one centre distance', () => {
  for (const g of [1, 2, 3, 4, 5, 6] as const)
    expect(pitchRadius('input', g) + pitchRadius('output', g)).toBeCloseTo(CENTRE_DISTANCE, 12);
});
test('positions increase along GEAR_ORDER with room for slider travel', () => {
  const xs = GEAR_ORDER.map(gearAxialPosition);
  for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(FACE_WIDTH + SLIDER_TRAVEL);
});
test('gears sit at a uniform pitch, centred on the middle of the train', () => {
  const xs = GEAR_ORDER.map(gearAxialPosition);
  for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeCloseTo(GEAR_PITCH, 12);
  expect(xs[0] + xs.at(-1)!).toBeCloseTo(0, 12);
});
test('meshing gears counter-rotate at the tooth ratio', () => {
  const angles = { crank: 0, input: 1.3, output: 0 };
  expect(gearAngle('input', 1, angles)).toBe(1.3);
  expect(gearAngle('output', 1, angles)).toBeCloseTo(-1.3 / gearRatio(1), 12);
});
test('every pair counter-rotates, including the pairs whose free gear is on the input shaft', () => {
  const angles = { crank: 0, input: 0.9, output: 0.4 };
  for (const g of [1, 2, 3, 4, 5, 6] as const) {
    const a = { ...angles, input: 0 }, b = { ...angles, output: 0 };
    for (const ang of [a, b]) {
      const i = gearAngle('input', g, ang), o = gearAngle('output', g, ang);
      if (i !== 0 || o !== 0) expect(i * o).toBeLessThanOrEqual(0);
    }
  }
  // the fifth pair: a turn of the output shaft turns the free input gear by the tooth ratio
  expect(gearAngle('input', 5, { crank: 0, input: 0, output: 1 }) / gearAngle('output', 5, { crank: 0, input: 0, output: 1 }))
    .toBeCloseTo(-gearRatio(5), 12);
});
test('the simulation stores the dog phase it tests alignment on', () => {
  const s = run(inGear(3, 6000), inp({ throttle: 0.3 }), 0.3);
  expect(dogPhase('A', 'pos', s)).toBeCloseTo(s.sliders.A.phi, 9);
});
test('a locked dog keeps its phase: the locked pair turns together', () => {
  const sim = inGear(5, 7000);
  const p0 = dogPhase('C', 'neg', sim.getState());
  const s = run(sim, inp({ throttle: 0.6 }), 1);
  expect(s.lockedGear).toBe(5);
  expect(s.angles.input).toBeGreaterThan(10);
  expect(phaseGap(dogPhase('C', 'neg', s), p0)).toBeLessThan(1e-6);
});
test('a free dog ring turns against its gear at the speed difference', () => {
  const sim = createSimulation();
  sim.setState({ inputShaftOmega: 100, outputShaftOmega: 0 });
  const p0 = dogPhase('B', 'pos', sim.getState());
  sim.step(inp({ clutchLever: 1 }));
  const s = sim.getState();
  // slider B rides the output shaft; gear 2 on it is driven by the input shaft
  const expected = (0 - 100 / gearRatio(2)) * 5e-4;
  expect(phaseGap(dogPhase('B', 'pos', s), p0 + expected)).toBeLessThan(1e-9);
});
test('patching phi sets the derived phase on both sides at that instant', () => {
  const sim = createSimulation();
  sim.setState({ angles: { input: 2.1, output: -0.7 } });
  sim.setState({ sliders: { C: { phi: deg(40) } } });
  const s = sim.getState();
  expect(s.sliders.C.phi).toBeCloseTo(deg(40), 12);
  expect(dogPhase('C', 'neg', s)).toBeCloseTo(deg(40), 12);
  expect(dogPhase('C', 'pos', s)).toBeCloseTo(deg(40), 12);
  sim.setState({ sliders: { C: { phi: 0 } } });
  expect(sim.getState().sliders.C.phi).toBe(0); // exactly aligned, not a hair short of a pitch
});

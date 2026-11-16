import { describe, test, expect } from 'vitest';
import { PARAMS } from '../../src/sim/params';
import { dogAligned } from '../../src/sim/dogs';
import type { SimState, SliderId } from '../../src/sim/types';
import { finalRatio, gearRatio, primaryRatio } from '../../src/sim/kinematics';
import { createSimulation } from '../../src/sim/simulation';
import { deg, wrap } from '../../src/sim/units';
import {
  CENTRE_DISTANCE, FACE_WIDTH, GEAR_ORDER, GEAR_PITCH, SLIDER_TRAVEL, dogPhase, drawnAngles, drawnDogPhase, gearAngle,
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

describe('the dog phase in the drawn frame', () => {
  const W = deg(PARAMS.dogs.windowDeg);
  const SLIDER_GEAR = { A: ['output', 5], B: ['output', 6], C: ['input', 3] } as const;
  /** The drawn alignment window: [0, W) for an input-shaft slider, its mirror (-W, 0] for an output one. */
  const inDrawnWindow = (slider: SliderId, d: number): boolean =>
    PARAMS.sliders[slider].shaft === 'input' ? d < W : d === 0 || d > PITCH - W;

  test('the drawn relative angle lies in the drawn window exactly when the simulation aligns the dogs', () => {
    let aligned = 0, total = 0;
    for (const slider of ['A', 'B', 'C'] as const) {
      const s = PARAMS.sliders[slider];
      const [shaft, g] = SLIDER_GEAR[slider];
      const sense = shaft === 'input' ? 1 : -1;
      for (let i = 0; i < 60; i++) {
        const sim = createSimulation();
        sim.setState({ angles: { input: 0.37 * i - 4, output: -0.23 * i + 1.1, crank: 0 } });
        sim.setState({ sliders: { [slider]: { phi: deg((i * 7.3) % 72), x: i % 2 ? 0.6 : -0.6 } } });
        const st = sim.getState();
        const side = st.sliders[slider].side;
        const freeShaft = shaft === 'input' ? 'input' : 'output';
        const independent = wrap(
          gearAngle(shaft, g, st.angles) + sense * st.sliders[slider].phase[side]
            - gearAngle(freeShaft, s[side], st.angles),
          PITCH,
        );
        expect(phaseGap(drawnDogPhase(slider, side, st), independent)).toBeLessThan(1e-9);
        expect(inDrawnWindow(slider, drawnDogPhase(slider, side, st))).toBe(dogAligned(st.sliders[slider].phi));
        total++; if (dogAligned(st.sliders[slider].phi)) aligned++;
      }
    }
    expect(aligned).toBeGreaterThan(0); // the sweep covers both cases
    expect(aligned).toBeLessThan(total);
  });

  test('output-shaft sliders draw at minus the dog phase, input-shaft sliders at plus', () => {
    const s = run(inGear(3, 6000), inp({ throttle: 0.3 }), 0.2);
    expect(phaseGap(drawnDogPhase('A', 'pos', s), -dogPhase('A', 'pos', s))).toBeLessThan(1e-9);
    expect(phaseGap(drawnDogPhase('C', 'neg', s), dogPhase('C', 'neg', s))).toBeLessThan(1e-9);
  });

  test('a locked free gear keeps a constant drawn offset from its shaft', () => {
    for (const [g, shaft, ref] of [
      [1, 'output', (a: SimState['angles']) => -a.output],
      [5, 'input', (a: SimState['angles']) => a.input],
    ] as const) {
      const sim = inGear(g, 7000);
      const a0 = sim.getState().angles;
      const off0 = gearAngle(shaft, g, a0) - ref(a0);
      const s = run(sim, inp({ throttle: 0.5 }), 0.5);
      expect(s.lockedGear).toBe(g);
      expect(Math.abs(s.angles.output)).toBeGreaterThan(5);
      expect(gearAngle(shaft, g, s.angles) - ref(s.angles)).toBeCloseTo(off0, 6);
    }
  });
});

describe('drawn angles of the parts that are not gears', () => {
  test('signs: output and wheel counter-rotate to the input shaft, the crank to the basket', () => {
    const s = createSimulation().getState();
    s.angles = { crank: 3, input: 1.2, output: 0.6 };
    const d = drawnAngles(s);
    expect(d.crank).toBe(-3);
    expect(d.basket).toBeCloseTo(3 / primaryRatio, 12);
    expect(d.input).toBe(1.2);
    expect(d.output).toBe(-0.6);
    expect(d.wheel).toBeCloseTo(-0.6 / finalRatio, 12);
  });
  test('the basket and the input shaft turn together when the clutch is locked', () => {
    const sim = inGear(3, 6000);
    const d0 = drawnAngles(sim.getState());
    const s = run(sim, inp({ throttle: 0.4 }), 0.5);
    expect(s.clutch.locked).toBe(true);
    const d1 = drawnAngles(s);
    const turned = d1.input - d0.input;
    expect(turned).toBeGreaterThan(10);
    expect((d1.basket - d0.basket) / turned).toBeCloseTo(1, 3);
  });
});

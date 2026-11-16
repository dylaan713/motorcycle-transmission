import { expect, test } from 'vitest';
import { createLoop } from '../../src/app/loop';
import { createSimulation } from '../../src/sim/simulation';
import { NEUTRAL_INPUTS } from '../../src/sim/types';

test('real time maps to fixed steps with the remainder carried', () => {
  const sim = createSimulation(); const loop = createLoop(sim, () => () => NEUTRAL_INPUTS, () => {});
  loop.tick(0.0163); expect(sim.getState().t).toBeCloseTo(0.016, 9);
  loop.tick(0.0163); expect(sim.getState().t).toBeCloseTo(0.0325, 9);
});
test('a long gap is capped, slow motion scales, pause holds, stepOnce steps', () => {
  const sim = createSimulation(); let frames = 0;
  const loop = createLoop(sim, () => () => NEUTRAL_INPUTS, () => { frames++; });
  loop.tick(30); expect(sim.getState().t).toBeCloseTo(0.1, 9);
  loop.setTimeScale(0.1); loop.tick(0.05); expect(sim.getState().t).toBeCloseTo(0.105, 9);
  loop.setPaused(true); loop.tick(0.05); expect(sim.getState().t).toBeCloseTo(0.105, 9);
  loop.stepOnce(); expect(sim.getState().t).toBeCloseTo(0.1055, 9);
  expect(frames).toBe(3);
  loop.setTimeScale(5); expect(loop.timeScale).toBe(1);
});

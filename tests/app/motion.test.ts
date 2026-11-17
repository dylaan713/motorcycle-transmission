import { expect, test } from 'vitest';
import { createDriver } from '../../src/app/driver';
import { createLoop } from '../../src/app/loop';
import { holdForReducedMotion } from '../../src/app/motion';
import { createSimulation } from '../../src/sim/simulation';
import { NEUTRAL_INPUTS } from '../../src/sim/types';

function rig(reduced: boolean) {
  const sim = createSimulation();
  const driver = createDriver(() => ({ ...NEUTRAL_INPUTS, throttle: 0.3 }), { autoStart: false });
  let frames = 0;
  const loop = createLoop(sim, () => driver.source(), () => { frames++; hold.frame(); });
  const hold = holdForReducedMotion(loop, driver, reduced);
  return { sim, driver, loop, frames: () => frames };
}

test('under reduced motion the first frame is drawn, then nothing moves until the visitor asks', () => {
  const { sim, driver, loop, frames } = rig(true);
  loop.tick(0); // the first frame
  expect(frames()).toBe(1);
  const t0 = sim.getState().t;
  const crank0 = sim.getState().angles.crank;
  for (let i = 0; i < 10; i++) loop.tick(1 / 60);
  expect(loop.paused).toBe(true);
  expect(sim.getState().t).toBe(t0);
  expect(sim.getState().angles.crank).toBe(crank0); // the idling engine does not turn the drawing
  expect(frames()).toBe(11); // frames still render, so a camera drag or a selection still shows
  driver.takeOver(); // touching a control
  loop.tick(1 / 60);
  expect(loop.paused).toBe(false);
  expect(sim.getState().t).toBeGreaterThan(t0);
});

test('"Start the demo ride" releases the hold too, and it never comes back', () => {
  const { sim, driver, loop } = rig(true);
  loop.tick(0); loop.tick(1 / 60);
  expect(loop.paused).toBe(true);
  driver.startDemo();
  loop.tick(1 / 60);
  const t = sim.getState().t;
  expect(t).toBeGreaterThan(0);
  driver.takeOver(); driver.startDemo();
  loop.tick(1 / 60);
  expect(sim.getState().t).toBeGreaterThan(t);
});

test('without reduced motion nothing is held', () => {
  const { sim, loop } = rig(false);
  loop.tick(0); loop.tick(1 / 60);
  expect(loop.paused).toBe(false);
  expect(sim.getState().t).toBeGreaterThan(0);
});

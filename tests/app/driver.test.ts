import { expect, test } from 'vitest';
import { createDriver } from '../../src/app/driver';
import { createAutopilot, type InputSource } from '../../src/sim/inputScript';
import { PARAMS } from '../../src/sim/params';
import { createSimulation } from '../../src/sim/simulation';
import { NEUTRAL_INPUTS } from '../../src/sim/types';

test('driver: demo until taken over, and back', () => {
  const visitor: InputSource = () => ({ ...NEUTRAL_INPUTS, throttle: 0.77 });
  const d = createDriver(visitor, { autoStart: true }); const modes: string[] = [];
  d.onModeChange((m) => modes.push(m));
  expect(d.mode).toBe('demo');
  d.takeOver(); d.takeOver();
  expect(d.mode).toBe('visitor');
  expect(d.source()(0, createSimulation().getState()).throttle).toBe(0.77);
  d.startDemo(); expect(modes).toEqual(['visitor', 'demo']);
  expect(createDriver(visitor, { autoStart: false }).mode).toBe('idle');
});
test('startDemo hands over to a fresh autopilot whose script time starts at 0', () => {
  const d = createDriver(() => NEUTRAL_INPUTS, { autoStart: true });
  const sim = createSimulation();
  const at = (n: number) => n * PARAMS.dt; // loop time, as the loop computes it
  let n = 0;
  for (; n < 7000; n++) sim.step(d.source()(at(n), sim.getState())); // 3.5 s of demo
  // a stalled engine puts the autopilot in its crank phase, whose timing is script time
  sim.setState({ engine: { running: false, omega: 0 } });
  d.takeOver(); d.startDemo();
  expect(d.source()(at(n), sim.getState()).starter).toBe(true); // 0 s into the script: cranking
  // a fresh autopilot given script time from 0 at the first step after startDemo
  const reference = createAutopilot();
  d.startDemo(); // fresh again, so the probe above does not count
  const n0 = n;
  for (; n < n0 + 6000; n++) {
    const state = sim.getState();
    const expected = reference(at(n) - at(n0), state);
    const got = d.source()(at(n), state);
    expect(got).toEqual(expected);
    sim.step(got);
  }
});
test('lesson mode rides the lesson source until left, then the visitor', () => {
  const visitor: InputSource = () => ({ ...NEUTRAL_INPUTS, throttle: 0.77 });
  const lesson: InputSource = () => ({ ...NEUTRAL_INPUTS, clutchLever: 1 });
  const other: InputSource = () => ({ ...NEUTRAL_INPUTS, brake: 1 });
  const d = createDriver(visitor, { autoStart: true }); const modes: string[] = [];
  d.onModeChange((m) => modes.push(m));
  const state = createSimulation().getState();
  d.enterLesson(lesson);
  expect(d.mode).toBe('lesson');
  expect(d.source()(0, state).clutchLever).toBe(1);
  d.enterLesson(other); // a new step's source replaces the last, still in lesson mode
  expect(d.source()(0, state).brake).toBe(1);
  d.leaveLesson();
  expect(d.mode).toBe('visitor');
  expect(d.source()(0, state).throttle).toBe(0.77);
  expect(modes).toEqual(['lesson', 'visitor']);
  // leaving from the demo (a lesson step that starts with the visitor in control) stops the demo
  const demo = createDriver(visitor, { autoStart: true });
  demo.leaveLesson();
  expect(demo.mode).toBe('visitor');
});

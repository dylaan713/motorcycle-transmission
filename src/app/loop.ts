import { PARAMS } from '../sim/params';
import type { InputSource } from '../sim/inputScript';
import type { Simulation } from '../sim/simulation';
import { NEUTRAL_INPUTS, type Inputs, type SimState } from '../sim/types';

export interface Loop {
  tick(elapsedSeconds: number): void; // called once per animation frame with real elapsed time
  stepOnce(): void; // exactly one simulation step, for pause-and-step
  setTimeScale(scale: number): void; // clamped to 0.02..1
  setPaused(paused: boolean): void;
  readonly timeScale: number;
  readonly paused: boolean;
  readonly lastInputs: Inputs; // the inputs given to the most recent step
}

const MAX_FRAME = 0.1; // s of real time per tick; a longer gap (a hidden tab) is dropped
const MIN_SCALE = 0.02;
const MAX_SCALE = 1;
// The accumulator counts in steps, so 0.1 s / 0.0005 s is 200 steps even when the division
// lands a hair under 200; a tolerance far below one step absorbs that drift.
const STEP_EPSILON = 1e-6;

/**
 * Maps real time to whole PARAMS.dt simulation steps. Each step asks `getSource()` for inputs,
 * passing seconds since the loop was created (loop time, counted in steps) and the current state.
 */
export function createLoop(
  sim: Simulation, getSource: () => InputSource, onFrame: (state: SimState) => void,
): Loop {
  let steps = 0; // steps run since creation
  let pending = 0; // accumulated, not yet run, in steps
  let timeScale = 1;
  let paused = false;
  let lastInputs: Inputs = { ...NEUTRAL_INPUTS };

  const step = (): void => {
    lastInputs = getSource()(steps * PARAMS.dt, sim.getState());
    sim.step(lastInputs);
    steps++;
  };

  return {
    tick(elapsedSeconds) {
      if (!paused && elapsedSeconds > 0) {
        pending += (Math.min(elapsedSeconds, MAX_FRAME) * timeScale) / PARAMS.dt;
        const n = Math.floor(pending + STEP_EPSILON);
        pending = Math.max(0, pending - n);
        for (let i = 0; i < n; i++) step();
      }
      onFrame(sim.getState());
    },
    stepOnce: step,
    setTimeScale(scale) {
      timeScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number.isFinite(scale) ? scale : MAX_SCALE));
    },
    setPaused(p) {
      paused = p;
      pending = 0; // resuming starts from a clean accumulator
    },
    get timeScale() { return timeScale; },
    get paused() { return paused; },
    get lastInputs() { return lastInputs; },
  };
}

/** Drives `loop.tick` from requestAnimationFrame; returns a function that stops it. */
export function startAnimation(loop: Loop): () => void {
  let last: number | null = null;
  let id = 0;
  const frame = (now: number): void => {
    loop.tick(last === null ? 0 : (now - last) / 1000);
    last = now;
    id = requestAnimationFrame(frame);
  };
  id = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(id);
}

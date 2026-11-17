import { createAutopilot, type InputSource } from '../sim/inputScript';
import { NEUTRAL_INPUTS, type Inputs } from '../sim/types';

export type DriverMode = 'idle' | 'demo' | 'visitor' | 'lesson';

export interface Driver {
  source(): InputSource; // autopilot or the visitor's
  takeOver(): void; // idempotent
  startDemo(): void; // hands control back to a fresh autopilot
  enterLesson(source: InputSource): void; // a lesson's scripted or held inputs ride; replaces any earlier one
  leaveLesson(): void; // the visitor rides, from any mode
  readonly mode: DriverMode;
  onModeChange(fn: (mode: DriverMode) => void): void;
}

const idle: InputSource = (): Inputs => ({ ...NEUTRAL_INPUTS, ignition: true });

/**
 * Chooses who rides: a fresh autopilot (demo), the visitor, a lesson's source, or nobody (idle,
 * engine left on). A lesson's source is given the loop's time unchanged; it keeps its own clock.
 * The autopilot sees script time that starts at 0 on the first step after each startDemo; the
 * visitor's source is given the loop's time unchanged.
 */
export function createDriver(visitor: InputSource, opts: { autoStart: boolean }): Driver {
  let mode: DriverMode = 'idle';
  let demo: InputSource = idle;
  let lesson: InputSource = idle;
  const listeners: Array<(m: DriverMode) => void> = [];

  const setMode = (m: DriverMode): void => {
    if (m === mode) return;
    mode = m;
    for (const fn of listeners) fn(m);
  };

  const freshDemo = (): InputSource => {
    const autopilot = createAutopilot();
    let t0: number | null = null;
    return (t, state) => {
      if (t0 === null) t0 = t;
      return autopilot(t - t0, state);
    };
  };

  const startDemo = (): void => {
    demo = freshDemo();
    setMode('demo');
  };

  if (opts.autoStart) startDemo();

  return {
    source() {
      if (mode === 'lesson') return lesson;
      return mode === 'visitor' ? visitor : mode === 'demo' ? demo : idle;
    },
    takeOver() { setMode('visitor'); },
    startDemo,
    enterLesson(source) { lesson = source; setMode('lesson'); },
    leaveLesson() { lesson = idle; setMode('visitor'); },
    get mode() { return mode; },
    onModeChange(fn) { listeners.push(fn); },
  };
}

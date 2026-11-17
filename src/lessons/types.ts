import type { InputSource } from '../sim/inputScript';
import type { GearId, SimState, SliderId } from '../sim/types';
import type { PartId } from '../model/parts';

/** Where a step starts: a reset bike, wherever the last step left it, riding in a gear, or engine off. */
export type StepStart =
  | 'reset'
  | 'keep'
  | { gear: GearId; rpm: number }
  | { engineOff: true; drumDeg?: number; misaligned?: SliderId };

/** View settings a step asks for; data for the view, read by a later stage. */
export interface StepView {
  xray?: boolean;
  explode?: boolean;
  schematic?: boolean;
  focus?: PartId;
  highlight?: PartId[];
}

export interface LessonStep {
  id: string;
  title: string; // 2 to 5 words
  text: string; // 1 to 3 short sentences; what to watch for and why it happens
  start?: StepStart; // default 'keep'
  script?: InputSource; // scripted rider for this step; built with keyframes()/pedalStroke()
  seconds?: number; // how long the script runs before handing over (default 4)
  timeScale?: 1 | 0.25 | 0.05;
  /** Ignition the runner applies to the visitor's controls during this step (default true). */
  ignition?: boolean;
  view?: StepView;
  /** Must hold after the script; trace is sampled every 5 ms of simulated time and ends with the final state. */
  outcome?: (final: SimState, trace: SimState[]) => boolean;
  tryIt?: string; // what the visitor should now try, one sentence
}

export interface Lesson {
  id: string;
  number: number;
  title: string;
  summary: string; // one sentence
  steps: LessonStep[];
}

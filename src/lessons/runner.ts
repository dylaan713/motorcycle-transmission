import { PARAMS } from '../sim/params';
import type { InputSource } from '../sim/inputScript';
import { NEUTRAL_INPUTS, type DeepPartial, type Inputs, type SimState } from '../sim/types';
import { LESSONS, startState } from './lessons';
import type { Lesson, LessonStep } from './types';

export type RunnerPhase = 'idle' | 'ready' | 'playing' | 'handover' | 'timed-out';

export interface LessonRunner {
  start(lessonId: string): void; // throws on an unknown id
  next(): void; // ignored while playing; on the last step, from handover, completes and exits
  prev(): void; // the previous step from its start; stays on the first step
  exit(): void; // from any phase: view, time scale and ignition restored, the visitor in control
  play(): void; // from ready only
  retry(): void; // the step again from its start (or the nearest earlier step that has one)
  notifyVisitorInput(): void; // the visitor touched a ride control: ends a script or a hold
  readonly lesson: Lesson | null;
  readonly stepIndex: number; // -1 when idle
  readonly phase: RunnerPhase;
  readonly completed: ReadonlySet<string>; // lesson ids finished this session
  onChange(fn: () => void): void;
  tick(state: SimState): void; // called each frame; advances playing -> handover or timed-out
}

export interface RunnerHooks {
  setState(patch: DeepPartial<SimState> | 'reset'): void;
  setSource(source: InputSource | null): void; // null returns control to the visitor
  releaseControls(): void; // every held key, pointer and starter let go
  seedControls(inputs: Inputs): void; // the visitor's controls take over from these inputs
  setIgnition(on: boolean): void; // the visitor's ignition switch
  getIgnition(): boolean; // read once on start, so exit can put it back
  applyView(view: LessonStep['view'] | null, timeScale: number | null): void; // null restores what the visitor had
}

const SAMPLE_EVERY = 10; // simulation steps: 5 ms at dt = 0.5 ms
const DEFAULT_SECONDS = 4;

/**
 * A step's script, wrapped to run as the loop's source. It keeps its own clock (one dt per call,
 * as runSource does) and records the outcome trace: the state after step 1, 11, 21 ... and the
 * state after the last scripted step, which is `final`. Past that it repeats the script's last
 * inputs, so a frame that overshoots the scripted time does not drop a held control.
 */
function recorder(script: InputSource, seconds: number) {
  const n = Math.round(seconds / PARAMS.dt);
  const trace: SimState[] = [];
  let calls = 0; // the state passed in has had `calls` steps since the script began
  let last: Inputs = { ...NEUTRAL_INPUTS };
  let final: SimState | null = null;
  const source: InputSource = (_t, state) => {
    if (calls >= 1 && calls <= n && (calls - 1) % SAMPLE_EVERY === 0) trace.push(state);
    if (calls === n) {
      final = state;
      if (trace.at(-1)?.t !== final.t) trace.push(final);
    }
    if (calls < n) last = script(calls * PARAMS.dt, state);
    calls++;
    return { ...last };
  };
  return {
    source,
    trace,
    get final() { return final; },
    get last() { return last; },
  };
}

/**
 * Plays lessons step by step. Entering a step lets go of held controls, applies its start state,
 * ignition and view, and is `ready` (or plays at once with autoPlay). A scripted step runs for its
 * `seconds` of simulated time, then its outcome is checked on the recorded trace: true hands over,
 * false times out. After a script, its last inputs are held (a lever kept in, a pedal kept up)
 * until the visitor touches a ride control, when the visitor's controls are seeded from them.
 */
export function createLessonRunner(
  hooks: RunnerHooks, opts: { autoPlay: boolean; lessons?: Lesson[] },
): LessonRunner {
  const lessons = opts.lessons ?? LESSONS;
  let lesson: Lesson | null = null;
  let stepIndex = -1;
  let phase: RunnerPhase = 'idle';
  const completed = new Set<string>();
  const listeners: Array<() => void> = [];
  let visitorIgnition = true;
  let rec: ReturnType<typeof recorder> | null = null; // the playing script
  let held: Inputs | null = null; // inputs held after a script, until the visitor takes over
  let current: InputSource | null | undefined; // what the runner last gave setSource; undefined: nothing yet

  const step = (): LessonStep => lesson!.steps[stepIndex];
  const ignitionOn = (): boolean => step().ignition ?? true;
  const emit = (): void => { for (const fn of listeners) fn(); };
  const use = (source: InputSource | null): void => {
    if (source === current) return;
    current = source;
    hooks.setSource(source);
  };
  /** The held inputs, with the ignition kept off in a step that needs the engine off. */
  const heldInputs = (): Inputs => ({ ...held!, ignition: held!.ignition && ignitionOn() });
  const holdSource: InputSource = () => heldInputs();

  /** The inputs the runner is supplying now, or null when the visitor rides. */
  const supplied = (): Inputs | null => (rec !== null ? rec.last : held !== null ? heldInputs() : null);

  /** Hands the ride to the visitor, their controls seeded from whatever the runner was supplying. */
  const toVisitor = (): void => {
    const from = supplied();
    if (from !== null) hooks.seedControls(from);
    rec = null;
    held = null;
    use(null);
  };

  /** The nearest step at or before i that sets its own start, so it can be entered on its own. */
  const fromStart = (i: number): number => {
    let j = i;
    while (j > 0 && startState(lesson!.steps[j]) === 'keep') j--;
    return j;
  };

  const enter = (i: number): void => {
    stepIndex = i;
    const s = step();
    if (rec !== null) { held = rec.last; rec = null; } // a script cut short: hold where it was
    hooks.releaseControls();
    const st = startState(s);
    if (st !== 'keep') {
      held = null; // nothing carries over a fresh start
      hooks.setState('reset');
      if (st !== 'reset') hooks.setState(st);
      hooks.seedControls({ ...NEUTRAL_INPUTS, ignition: ignitionOn() });
    }
    hooks.setIgnition(ignitionOn());
    hooks.applyView(s.view ?? {}, s.timeScale ?? 1);
    phase = s.script ? 'ready' : 'handover';
    if (s.script && opts.autoPlay) { play(); return; }
    use(held !== null ? holdSource : null);
    emit();
  };

  const play = (): void => {
    if (phase !== 'ready') return;
    const s = step();
    rec = recorder(s.script!, s.seconds ?? DEFAULT_SECONDS);
    held = null;
    use(rec.source);
    phase = 'playing';
    emit();
  };

  const exit = (): void => {
    if (lesson === null) return;
    toVisitor();
    hooks.setIgnition(visitorIgnition);
    hooks.applyView(null, null);
    lesson = null;
    stepIndex = -1;
    phase = 'idle';
    current = undefined;
    emit();
  };

  return {
    start(lessonId) {
      const found = lessons.find((l) => l.id === lessonId);
      if (!found) throw new Error(`no lesson ${lessonId}`);
      if (lesson === null) visitorIgnition = hooks.getIgnition(); // remembered once, not per lesson
      rec = null;
      held = null;
      lesson = found;
      enter(0);
    },
    next() {
      if (lesson === null || phase === 'playing') return;
      if (stepIndex < lesson.steps.length - 1) { enter(stepIndex + 1); return; }
      if (phase !== 'handover') return;
      completed.add(lesson.id);
      exit();
    },
    prev() {
      if (lesson === null || stepIndex === 0) return;
      enter(fromStart(stepIndex - 1));
    },
    exit,
    play,
    retry() {
      if (lesson === null) return;
      enter(fromStart(stepIndex));
    },
    notifyVisitorInput() {
      if (lesson === null) return;
      if (phase === 'playing') {
        toVisitor();
        phase = 'handover';
        emit();
        return;
      }
      if (held !== null) toVisitor();
    },
    get lesson() { return lesson; },
    get stepIndex() { return stepIndex; },
    get phase() { return phase; },
    completed,
    onChange(fn) { listeners.push(fn); },
    tick() {
      if (phase !== 'playing' || rec === null) return;
      const final = rec.final; // set once the step's seconds of simulated time have run
      if (final === null) return;
      const ok = step().outcome?.(final, rec.trace) ?? true;
      held = rec.last;
      rec = null;
      use(holdSource);
      phase = ok ? 'handover' : 'timed-out';
      emit();
    },
  };
}

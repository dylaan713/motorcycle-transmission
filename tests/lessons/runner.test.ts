import { expect, test } from 'vitest';
import { createLessonRunner, type LessonRunner, type RunnerHooks } from '../../src/lessons/runner';
import { LESSONS } from '../../src/lessons/lessons';
import type { Lesson, LessonStep } from '../../src/lessons/types';
import { keyframes, runSource, type InputSource } from '../../src/sim/inputScript';
import { PARAMS } from '../../src/sim/params';
import { createSimulation, type Simulation } from '../../src/sim/simulation';
import { inGearPatch } from '../../src/sim/states';
import { NEUTRAL_INPUTS, type Inputs } from '../../src/sim/types';
import { rpm } from '../../src/sim/units';

type Call = { hook: string; arg?: unknown; arg2?: unknown };

/**
 * Fake page: records every hook call, keeps a real simulation, a visitor source and a time scale,
 * and steps the simulation the way the loop does (one source call per step, then a frame tick).
 */
function harness(opts: { autoPlay: boolean; lessons?: Lesson[]; ignition?: boolean }) {
  const sim: Simulation = createSimulation();
  const calls: Call[] = [];
  let source: InputSource | null = null;
  let timeScale = 1;
  let visitorInputs: Inputs = { ...NEUTRAL_INPUTS };
  let ignition = opts.ignition ?? true;
  const hooks: RunnerHooks = {
    setState(patch) {
      calls.push({ hook: 'setState', arg: patch });
      if (patch === 'reset') sim.reset(); else sim.setState(patch);
    },
    setSource(s) { calls.push({ hook: 'setSource', arg: s }); source = s; },
    // as the real hook will: keys and pointers let go, so the visitor's inputs fall to rest
    releaseControls() { calls.push({ hook: 'releaseControls' }); visitorInputs = { ...NEUTRAL_INPUTS }; },
    seedControls(inputs) { calls.push({ hook: 'seedControls', arg: { ...inputs } }); visitorInputs = { ...inputs }; },
    setIgnition(on) { calls.push({ hook: 'setIgnition', arg: on }); ignition = on; },
    getIgnition() { return ignition; },
    applyView(view, scale) {
      calls.push({ hook: 'applyView', arg: view, arg2: scale });
      timeScale = scale ?? 1;
    },
  };
  const runner = createLessonRunner(hooks, opts);
  const visitor: InputSource = () => ({ ...visitorInputs, ignition });
  let steps = 0;
  /** One animation frame of `seconds` real time: steps the sim at the current time scale, then ticks. */
  const frame = (seconds = 1 / 60): void => {
    const n = Math.floor((seconds * timeScale) / PARAMS.dt + 1e-6);
    for (let i = 0; i < n; i++) {
      sim.step((source ?? visitor)(steps * PARAMS.dt, sim.getState()));
      steps++;
    }
    runner.tick(sim.getState());
  };
  /** Frames until the phase leaves 'playing' or `limit` seconds of real time pass. */
  const playOut = (limit = 60): void => {
    for (let t = 0; t < limit && runner.phase === 'playing'; t += 1 / 60) frame();
  };
  const last = (hook: string) => calls.filter((c) => c.hook === hook).at(-1);
  return { sim, calls, runner, frame, playOut, last, get source() { return source; }, get timeScale() { return timeScale; } };
}

const byNumber = (n: number) => LESSONS.find((l) => l.number === n)!;
const step = (s: Partial<LessonStep> & { id: string }): LessonStep => ({ title: 'A step', text: 'Text.', ...s });

test('a scripted step plays, verifies and hands over', () => {
  const h = harness({ autoPlay: false });
  const l3 = byNumber(3);
  h.runner.start(l3.id);
  expect(h.runner.lesson?.id).toBe(l3.id);
  expect(h.runner.stepIndex).toBe(0);
  expect(h.runner.phase).toBe('ready');
  h.runner.play();
  expect(h.runner.phase).toBe('playing');
  expect(h.source).not.toBeNull();
  h.playOut();
  expect(h.runner.phase).toBe('handover');
  // the step's simulated seconds have run (within a frame)
  expect(h.sim.getState().t).toBeGreaterThanOrEqual(l3.steps[0].seconds! - 1e-9);
  expect(h.sim.getState().t).toBeLessThan(l3.steps[0].seconds! + 1 / 60 + 1e-9);
  // the lever stays in: control is not dropped to the visitor's resting controls yet
  expect(h.source).not.toBeNull();
  expect(h.source!(0, h.sim.getState()).clutchLever).toBe(1);
  h.runner.notifyVisitorInput();
  expect(h.last('setSource')?.arg).toBeNull();
  expect(h.calls.at(-1)?.hook).toBe('setSource');
});

test('starting a lesson releases held controls and replaces the state', () => {
  const h = harness({ autoPlay: true });
  // mid-ride at speed in fourth, the visitor holding the throttle
  h.sim.setState(inGearPatch(4, 9000));
  h.calls.length = 0;
  h.runner.start(byNumber(2).id);
  const order = h.calls.map((c) => c.hook);
  const firstSource = order.indexOf('setSource');
  expect(order[0]).toBe('releaseControls');
  expect(order.indexOf('setState')).toBeGreaterThan(0);
  expect(order.indexOf('setState')).toBeLessThan(firstSource);
  expect(h.calls.find((c) => c.hook === 'setState')?.arg).toBe('reset');
  // the visitor's controls are seeded at rest, so no ramp from the ride carries over
  const seed = h.calls.find((c) => c.hook === 'seedControls');
  expect(seed?.arg).toEqual({ ...NEUTRAL_INPUTS, ignition: true });
  expect(order.indexOf('seedControls')).toBeLessThan(firstSource);
  const s = h.sim.getState();
  expect(s.lockedGear).toBeNull();
  expect(s.roadSpeed).toBe(0);
  expect(s.engine.omega).toBeLessThan(rpm(2000));
  // a patch start is applied on a reset simulation
  h.calls.length = 0;
  h.runner.start(byNumber(5).id);
  const sets = h.calls.filter((c) => c.hook === 'setState').map((c) => c.arg);
  expect(sets[0]).toBe('reset');
  expect(sets[1]).toEqual(inGearPatch(2, 6000));
  expect(h.sim.getState().lockedGear).toBe(2);
});

const failing: Lesson = {
  id: 'never', number: 99, title: 'Never', summary: 'Never passes.',
  steps: [
    step({ id: 'a', start: 'reset', script: keyframes({ throttle: [[0, 0.3]] }), seconds: 0.5, outcome: () => false }),
    step({ id: 'b', script: keyframes({ clutchLever: [[0, 1]] }), seconds: 0.2, outcome: () => false }),
  ],
};

test('a step whose outcome fails times out and can be retried', () => {
  const h = harness({ autoPlay: false, lessons: [failing] });
  h.runner.start('never');
  h.runner.play();
  h.playOut();
  expect(h.runner.phase).toBe('timed-out');
  for (let i = 0; i < 30; i++) h.frame();
  expect(h.runner.phase).toBe('timed-out'); // stays put, does not wait for ever or pass by itself
  expect(h.sim.getState().t).toBeGreaterThan(0.5);
  h.calls.length = 0;
  h.runner.retry();
  expect(h.runner.phase).toBe('ready');
  expect(h.runner.stepIndex).toBe(0);
  expect(h.calls.filter((c) => c.hook === 'setState').map((c) => c.arg)).toEqual(['reset']);
  expect(h.sim.getState().t).toBe(0);
});

test('retrying a step that keeps the last state restarts from the nearest step with a start', () => {
  const h = harness({ autoPlay: true, lessons: [failing] });
  h.runner.start('never');
  h.playOut();
  h.runner.next();
  expect(h.runner.stepIndex).toBe(1);
  h.playOut();
  expect(h.runner.phase).toBe('timed-out');
  h.calls.length = 0;
  h.runner.retry();
  expect(h.runner.stepIndex).toBe(0); // the card says "Restarting from step 1"
  expect(h.calls.find((c) => c.hook === 'setState')?.arg).toBe('reset');
  expect(h.runner.phase).toBe('playing');
});

test('exit restores view settings and time scale', () => {
  const h = harness({ autoPlay: false });
  const l3 = byNumber(3);
  h.runner.start(l3.id);
  h.runner.play();
  h.playOut();
  h.runner.next();
  const clunk = l3.steps[1];
  expect(h.last('applyView')).toEqual({ hook: 'applyView', arg: clunk.view, arg2: 0.25 });
  expect(h.timeScale).toBe(0.25);
  for (const phase of ['ready', 'playing'] as const) {
    if (phase === 'playing') { h.runner.start(l3.id); h.runner.next(); h.runner.play(); }
    expect(h.runner.phase).toBe(phase);
    h.runner.exit();
    expect(h.last('applyView')).toEqual({ hook: 'applyView', arg: null, arg2: null });
    expect(h.runner.phase).toBe('idle');
    expect(h.runner.lesson).toBeNull();
    expect(h.last('setSource')?.arg).toBeNull();
  }
  // a step without a view still asks for the defaults, so a previous step's settings do not linger
  h.runner.start(byNumber(9).id);
  h.runner.next(); h.runner.next();
  expect(h.last('applyView')).toEqual({ hook: 'applyView', arg: {}, arg2: 1 });
});

test('exit while the runner supplies the inputs seeds the visitor from them', () => {
  const h = harness({ autoPlay: true });
  h.runner.start(byNumber(3).id);
  h.playOut();
  expect(h.runner.phase).toBe('handover');
  h.runner.exit();
  const i = h.calls.map((c) => c.hook).lastIndexOf('seedControls');
  expect((h.calls[i].arg as Inputs).clutchLever).toBe(1);
  expect(h.calls.map((c) => c.hook).lastIndexOf('setSource')).toBeGreaterThan(i);
});

test('next past the last step completes the lesson; prev at the first step stays', () => {
  const h = harness({ autoPlay: true });
  const l1 = byNumber(1);
  h.runner.start(l1.id);
  h.calls.length = 0;
  h.runner.prev();
  expect(h.runner.stepIndex).toBe(0);
  expect(h.calls).toEqual([]);
  for (let i = 1; i < l1.steps.length; i++) { h.runner.next(); expect(h.runner.stepIndex).toBe(i); }
  h.runner.prev();
  expect(h.runner.stepIndex).toBe(l1.steps.length - 2);
  h.runner.next();
  expect(h.runner.stepIndex).toBe(l1.steps.length - 1);
  expect(h.runner.completed.has(l1.id)).toBe(false);
  h.runner.next();
  expect(h.runner.completed.has(l1.id)).toBe(true);
  expect(h.runner.phase).toBe('idle');
  expect(h.last('applyView')).toEqual({ hook: 'applyView', arg: null, arg2: null });
});

test('prev into a step that keeps the last state restarts from the nearest step with a start', () => {
  const h = harness({ autoPlay: true });
  const l2 = byNumber(2); // idling (reset), pull (reset), release (keep), try (keep)
  h.runner.start(l2.id);
  h.runner.next(); h.playOut(); h.runner.next(); h.playOut(); h.runner.next();
  expect(h.runner.stepIndex).toBe(3);
  h.runner.prev();
  expect(h.runner.stepIndex).toBe(1);
  expect(h.runner.phase).toBe('playing');
});

test('prev in a tour with no scripts moves back exactly one step', () => {
  for (const n of [1, 8]) {
    const h = harness({ autoPlay: true });
    const l = byNumber(n);
    expect(l.steps.some((s) => s.script), l.id).toBe(false);
    h.runner.start(l.id);
    for (let i = 1; i < l.steps.length; i++) h.runner.next();
    for (let i = l.steps.length - 1; i > 0; i--) {
      expect(h.runner.stepIndex, l.id).toBe(i);
      h.calls.length = 0;
      h.runner.prev();
      expect(h.runner.stepIndex, l.id).toBe(i - 1);
      expect(h.runner.phase, l.id).toBe('handover');
      // a keep step is entered as it is, without replacing the state
      const keep = l.steps[i - 1].start === undefined || l.steps[i - 1].start === 'keep';
      expect(h.calls.some((c) => c.hook === 'setState'), `${l.id} step ${i - 1}`).toBe(!keep);
      expect(h.last('applyView')?.arg, l.id).toEqual(l.steps[i - 1].view ?? {});
    }
  }
});

test('retry on a tour step with a scripted step before it still restarts from the start', () => {
  const h = harness({ autoPlay: true });
  const l9 = byNumber(9); // idle-in-first (reset, script), dump (script), how-to-restart (keep, no script)
  h.runner.start(l9.id);
  h.playOut(); h.runner.next(); h.playOut(); h.runner.next();
  expect(h.runner.stepIndex).toBe(2);
  h.runner.retry();
  expect(h.runner.stepIndex).toBe(0);
});

test('next during playing is ignored', () => {
  const h = harness({ autoPlay: true });
  h.runner.start(byNumber(3).id);
  h.frame();
  expect(h.runner.phase).toBe('playing');
  h.runner.next();
  expect(h.runner.stepIndex).toBe(0);
  expect(h.runner.phase).toBe('playing');
});

test('without autoPlay nothing plays until play() is called', () => {
  const h = harness({ autoPlay: false });
  h.runner.start(byNumber(3).id);
  for (let i = 0; i < 120; i++) h.frame();
  expect(h.runner.phase).toBe('ready');
  expect(h.sim.getState().clutch.capacity).toBeGreaterThan(0); // the lever was never pulled
  expect(h.calls.some((c) => c.hook === 'setSource' && c.arg !== null)).toBe(false);
  h.runner.play();
  expect(h.runner.phase).toBe('playing');
});

test('the hold at hand-over keeps the lever in until the visitor touches a control', () => {
  const h = harness({ autoPlay: true });
  h.runner.start(byNumber(3).id); // lever-in ends with the lever held
  h.playOut();
  expect(h.runner.phase).toBe('handover');
  for (let i = 0; i < 120; i++) h.frame(); // two seconds of reading the card
  expect(h.sim.getState().clutch.capacity).toBe(0);
  expect(h.calls.some((c) => c.hook === 'setSource' && c.arg === null)).toBe(false);
  h.runner.notifyVisitorInput();
  expect(h.last('setSource')?.arg).toBeNull();
  expect(h.runner.phase).toBe('handover');
});

test('a held control survives play() until the script first runs', () => {
  const h = harness({ autoPlay: false });
  h.runner.start(byNumber(3).id);
  h.runner.play();
  h.playOut(); // lever-in: ends with the lever held
  h.runner.next(); // the clunk step, ready, still holding the lever
  h.runner.play();
  h.runner.notifyVisitorInput(); // before any source call
  expect((h.last('seedControls')?.arg as Inputs).clutchLever).toBe(1);
  expect(h.last('setSource')?.arg).toBeNull();
  // and exit in the same window seeds the lever in as well
  const e = harness({ autoPlay: false });
  e.runner.start(byNumber(3).id);
  e.runner.play(); e.playOut(); e.runner.next(); e.runner.play();
  e.runner.exit();
  expect((e.last('seedControls')?.arg as Inputs).clutchLever).toBe(1);
});

test('ride input while a scripted step is ready hands over, and Play still plays it', () => {
  const h = harness({ autoPlay: false });
  const l3 = byNumber(3);
  h.runner.start(l3.id);
  h.runner.play(); h.playOut(); h.runner.next(); // clunk, ready, lever held
  h.runner.notifyVisitorInput();
  expect(h.runner.phase).toBe('handover');
  expect(h.runner.stepIndex).toBe(1);
  expect(h.last('setSource')?.arg).toBeNull();
  expect((h.last('seedControls')?.arg as Inputs).clutchLever).toBe(1);
  // "Play it for me": re-entered from its start, as retry does, and played
  h.calls.length = 0;
  h.runner.play();
  expect(h.runner.stepIndex).toBe(0); // clunk keeps the last state; lever-in is scripted
  expect(h.calls.find((c) => c.hook === 'setState')?.arg).toBe('reset');
  expect(h.runner.phase).toBe('playing');
  // a ready step entered fresh hands over the same way, seeded at rest
  const f = harness({ autoPlay: false });
  f.runner.start(l3.id);
  f.runner.notifyVisitorInput();
  expect(f.runner.phase).toBe('handover');
  expect(f.last('setSource')?.arg).toBeNull();
  f.runner.play();
  expect(f.runner.stepIndex).toBe(0);
  expect(f.runner.phase).toBe('playing');
});

test('play on a tour step without a script does nothing', () => {
  const h = harness({ autoPlay: false });
  h.runner.start(byNumber(1).id);
  h.calls.length = 0;
  h.runner.play();
  expect(h.runner.phase).toBe('handover');
  expect(h.calls).toEqual([]);
});

test('an ignition-off step keeps the ignition off in what the visitor is seeded with, even mid-script', () => {
  const lesson: Lesson = {
    id: 'off', number: 96, title: 'Off', summary: 'Off.',
    steps: [
      step({ id: 'a', start: { engineOff: true }, ignition: false, script: keyframes({ handDrumTorque: [[0, 1]] }), seconds: 1, outcome: () => true }),
      step({ id: 'b' }),
      step({ id: 'c' }),
    ],
  };
  const h = harness({ autoPlay: true, lessons: [lesson] });
  h.runner.start('off');
  h.frame();
  expect(h.runner.phase).toBe('playing');
  h.runner.notifyVisitorInput();
  expect((h.last('seedControls')?.arg as Inputs).ignition).toBe(false);
});

test('a step continuing from a held control reaches hand-over after time spent on the card', () => {
  // each pair: a step ending with the lever held, and the step that carries on from it
  const cases: Array<[number, string, string]> = [
    [3, 'clunk', 'waiting'], [4, 'ready', 'feed'], [9, 'idle-in-first', 'dump'],
  ];
  for (const [n, before, after] of cases) {
    const h = harness({ autoPlay: true });
    const l = byNumber(n);
    h.runner.start(l.id);
    while (l.steps[h.runner.stepIndex].id !== before) { h.playOut(); h.runner.next(); }
    h.playOut();
    expect(h.runner.phase, `${l.id}/${before}`).toBe('handover');
    for (let t = 0; t < 0.5; t += 1 / 60) h.frame(); // half a second on the card
    expect(h.sim.getState().clutch.capacity, `${l.id}/${before}: lever still in`).toBe(0);
    h.runner.next();
    expect(l.steps[h.runner.stepIndex].id).toBe(after);
    h.playOut();
    expect(h.runner.phase, `${l.id}/${after}`).toBe('handover');
  }
});

test('the visitor is seeded with the held inputs', () => {
  const h = harness({ autoPlay: true });
  const l6 = byNumber(6);
  h.runner.start(l6.id);
  h.runner.next(); // refused: pedal held up at full throttle
  h.playOut();
  expect(h.runner.phase).toBe('handover');
  h.runner.notifyVisitorInput();
  const seeded = h.last('seedControls')?.arg as Inputs;
  expect(seeded.pedal).toBe(1);
  expect(seeded.throttle).toBe(1);
  const order = h.calls.map((c) => c.hook);
  expect(order.lastIndexOf('seedControls')).toBeLessThan(order.lastIndexOf('setSource'));
});

test('a step that keeps the last state continues the hold', () => {
  const h = harness({ autoPlay: true });
  const l9 = byNumber(9);
  h.runner.start(l9.id);
  h.playOut(); h.runner.next(); h.playOut(); // stall: lever out
  h.runner.next(); // how-to-restart: no script, keep
  expect(h.runner.phase).toBe('handover');
  expect(h.source).not.toBeNull();
  expect(h.source!(0, h.sim.getState()).clutchLever).toBe(0);
});

test('an engine-off step turns the ignition off and exit restores it', () => {
  const h = harness({ autoPlay: true, ignition: true });
  h.runner.start(byNumber(8).id);
  expect(h.last('setIgnition')?.arg).toBe(false);
  expect(h.runner.phase).toBe('handover');
  expect(h.last('seedControls')?.arg).toEqual({ ...NEUTRAL_INPUTS, ignition: false });
  for (let i = 0; i < 60; i++) h.frame();
  expect(h.sim.getState().engine.running).toBe(false);
  h.runner.exit();
  expect(h.last('setIgnition')?.arg).toBe(true);

  // a visitor who had the ignition off gets it back off after a lesson that needed it on
  const off = harness({ autoPlay: true, ignition: false });
  off.runner.start(byNumber(2).id);
  expect(off.last('setIgnition')?.arg).toBe(true);
  off.runner.exit();
  expect(off.last('setIgnition')?.arg).toBe(false);
});

test('visitor input during playing hands over at once, with no outcome check', () => {
  let checked = false;
  const lesson: Lesson = {
    id: 'interrupt', number: 98, title: 'Interrupt', summary: 'Interrupted.',
    steps: [
      step({ id: 'a', start: 'reset', script: keyframes({ clutchLever: [[0, 0], [0.2, 1]] }), seconds: 2, outcome: () => { checked = true; return false; } }),
      step({ id: 'b' }),
      step({ id: 'c' }),
    ],
  };
  const h = harness({ autoPlay: true, lessons: [lesson] });
  h.runner.start('interrupt');
  for (let i = 0; i < 30; i++) h.frame(); // half a second in: lever pulled
  expect(h.runner.phase).toBe('playing');
  h.runner.notifyVisitorInput();
  expect(h.runner.phase).toBe('handover');
  expect(h.last('setSource')?.arg).toBeNull();
  expect((h.last('seedControls')?.arg as Inputs).clutchLever).toBe(1);
  for (let i = 0; i < 180; i++) h.frame();
  expect(checked).toBe(false);
  expect(h.runner.phase).toBe('handover');
});

test('the recorded trace matches the headless verification sample for sample', () => {
  let seen: { final: unknown; trace: unknown[] } | null = null;
  const script = keyframes({ throttle: [[0, 0], [0.3, 0.6]], clutchLever: [[0, 0], [0.5, 1]] });
  const lesson: Lesson = {
    id: 'trace', number: 97, title: 'Trace', summary: 'Trace.',
    steps: [
      step({ id: 'a', start: 'reset', script, seconds: 0.8, outcome: (final, trace) => { seen = { final, trace }; return true; } }),
      step({ id: 'b' }),
      step({ id: 'c' }),
    ],
  };
  const h = harness({ autoPlay: true, lessons: [lesson] });
  h.runner.start('trace');
  h.playOut();
  expect(h.runner.phase).toBe('handover');
  const ref = createSimulation();
  const trace: unknown[] = [];
  let n = 0;
  const final = runSource(ref, script, 0.8, (x) => { if (n++ % 10 === 0) trace.push(x); });
  if ((trace.at(-1) as { t: number }).t !== final.t) trace.push(final);
  expect(seen).not.toBeNull();
  expect(seen!.final).toEqual(final);
  expect(seen!.trace).toEqual(trace);
});

test('onChange fires on every phase change', () => {
  const h = harness({ autoPlay: false });
  const phases: string[] = [];
  h.runner.onChange(() => phases.push(`${h.runner.stepIndex}:${h.runner.phase}`));
  h.runner.start(byNumber(3).id);
  h.runner.play();
  h.playOut();
  h.runner.exit();
  expect(phases).toEqual(['0:ready', '0:playing', '0:handover', '-1:idle']);
});

test('an unknown lesson id throws and leaves the runner idle', () => {
  const h = harness({ autoPlay: true });
  expect(() => h.runner.start('no-such-lesson')).toThrow();
  expect(h.runner.phase).toBe('idle');
  expect(h.calls).toEqual([]);
});

/** Plays a whole lesson, pressing next as soon as each step is handed over; returns the phases seen. */
function playThrough(runner: LessonRunner, h: ReturnType<typeof harness>, id: string, dwell: number): string[] {
  const seen: string[] = [];
  runner.start(id);
  const lesson = runner.lesson!;
  for (let i = 0; i < lesson.steps.length; i++) {
    expect(runner.stepIndex).toBe(i);
    h.playOut();
    seen.push(`${lesson.steps[i].id}:${runner.phase}`);
    for (let t = 0; t < dwell; t += 1 / 60) h.frame();
    runner.next();
  }
  return seen;
}

test('every lesson plays start to finish with every scripted step handed over', () => {
  for (const dwell of [0, 0.5]) {
    const h = harness({ autoPlay: true });
    for (const l of LESSONS) {
      const seen = playThrough(h.runner, h, l.id, dwell);
      expect(seen, `${l.id}, ${dwell} s on each card`).toEqual(l.steps.map((s) => `${s.id}:handover`));
      expect(h.runner.completed.has(l.id), l.id).toBe(true);
      expect(h.runner.phase).toBe('idle');
    }
    expect(h.runner.completed.size).toBe(LESSONS.length);
  }
});

import { test, expect } from 'vitest';
import { LESSONS, WEAK_STROKE, startState } from '../../src/lessons/lessons';
import type { Lesson, LessonStep } from '../../src/lessons/types';
import { PARTS } from '../../src/model/parts';
import { PARAMS } from '../../src/sim/params';
import { createSimulation, type Simulation } from '../../src/sim/simulation';
import { inGearPatch } from '../../src/sim/states';
import { keyframes, pedalStroke, runSource, type InputSource } from '../../src/sim/inputScript';
import { NEUTRAL_INPUTS, type SimState } from '../../src/sim/types';
import { deg } from '../../src/sim/units';

const SAMPLE_EVERY = 10; // steps: 5 ms at dt = 0.5 ms

/** Applies a step's start the way the lesson runner does: a patch goes onto a reset simulation. */
function applyStart(sim: Simulation, step: LessonStep): void {
  const st = startState(step);
  if (st === 'keep') return;
  sim.reset();
  if (st !== 'reset') sim.setState(st);
}

/** Runs a step's script (time-stretched by k) and returns the final state and the 5 ms trace. */
function runStep(sim: Simulation, step: LessonStep, k = 1): { final: SimState; trace: SimState[] } {
  const script = step.script!;
  const source: InputSource = k === 1 ? script : (t, s) => script(t / k, s);
  const trace: SimState[] = [];
  let n = 0;
  const final = runSource(sim, source, (step.seconds ?? 4) * k, (x) => {
    if (n++ % SAMPLE_EVERY === 0) trace.push(structuredClone(x));
  });
  if (trace.at(-1)?.t !== final.t) trace.push(final); // the trace ends with the final state
  return { final, trace };
}

/** Plays a lesson's steps in order in one simulation; returns each scripted step's verdict. */
function playLesson(l: Lesson, k = 1): Array<{ id: string; ok: boolean }> {
  const sim = createSimulation();
  const verdicts: Array<{ id: string; ok: boolean }> = [];
  for (const s of l.steps) {
    applyStart(sim, s);
    if (!s.script) continue;
    const { final, trace } = runStep(sim, s, k);
    verdicts.push({ id: `${l.id}/${s.id}`, ok: s.outcome!(final, trace) });
  }
  return verdicts;
}

/** Plays a lesson up to and including one scripted step; returns that step's run. */
function runTo(lessonNumber: number, stepId: string): { step: LessonStep; final: SimState; trace: SimState[] } {
  const l = LESSONS.find((x) => x.number === lessonNumber)!;
  const sim = createSimulation();
  for (const s of l.steps) {
    applyStart(sim, s);
    if (!s.script) continue;
    const r = runStep(sim, s);
    if (s.id === stepId) return { step: s, ...r };
  }
  throw new Error(`no scripted step ${stepId} in lesson ${lessonNumber}`);
}

const allSteps = () => LESSONS.flatMap((l) => l.steps.map((s) => ({ l, s })));
const words = (x: string) => x.trim().split(/\s+/).length;
const sentences = (x: string) => x.split(/[.!?]\s/).length;

test('nine lessons, numbered in order, each with three to six steps', () => {
  expect(LESSONS.map((l) => l.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  for (const l of LESSONS) {
    expect(l.steps.length).toBeGreaterThanOrEqual(3);
    expect(l.steps.length).toBeLessThanOrEqual(6);
  }
});

test('step text is short, plain and complete', () => {
  const banned = /\b(revolutionary|cutting-edge|seamless|powerful|simply|just)\b/i;
  for (const { l, s } of allSteps()) {
    expect(sentences(s.text), `${l.id}/${s.id}`).toBeLessThanOrEqual(3);
    expect(s.text.length, `${l.id}/${s.id}`).toBeLessThanOrEqual(260);
    expect(s.text, `${l.id}/${s.id}`).not.toMatch(banned);
    if (s.tryIt) expect(s.tryIt, `${l.id}/${s.id}`).not.toMatch(banned);
    if (s.script) expect(s.outcome, `${l.id}/${s.id} has a script but no outcome`).toBeDefined();
  }
});

test('titles are two to five words, summaries and tryIt lines one sentence', () => {
  for (const l of LESSONS) {
    expect(sentences(l.summary), l.id).toBe(1);
    expect(l.summary, l.id).toMatch(/\.$/);
    for (const s of l.steps) {
      expect(words(s.title), `${l.id}/${s.id}`).toBeGreaterThanOrEqual(2);
      expect(words(s.title), `${l.id}/${s.id}`).toBeLessThanOrEqual(5);
      if (s.tryIt) expect(sentences(s.tryIt), `${l.id}/${s.id}`).toBe(1);
    }
  }
});

test('ids are unique and every lesson opens from a known state', () => {
  expect(new Set(LESSONS.map((l) => l.id)).size).toBe(LESSONS.length);
  for (const l of LESSONS) {
    expect(new Set(l.steps.map((s) => s.id)).size, l.id).toBe(l.steps.length);
    expect(startState(l.steps[0]), `${l.id} first step`).not.toBe('keep');
  }
});

test('every focus and highlight id is a real part', () => {
  for (const { l, s } of allSteps()) {
    const ids = [...(s.view?.focus ? [s.view.focus] : []), ...(s.view?.highlight ?? [])];
    for (const id of ids) expect(PARTS[id], `${l.id}/${s.id}: ${id}`).toBeDefined();
  }
});

test('engine-off steps keep the ignition off in the controls', () => {
  for (const { l, s } of allSteps()) {
    const st = s.start;
    if (typeof st === 'object' && 'engineOff' in st) {
      expect(s.ignition, `${l.id}/${s.id}`).toBe(false);
    }
  }
});

test('startState resolves every kind of start', () => {
  const step = (start: LessonStep['start']): LessonStep => ({ id: 'x', title: 'a b', text: 'x.', start });
  expect(startState(step(undefined))).toBe('keep');
  expect(startState(step('keep'))).toBe('keep');
  expect(startState(step('reset'))).toBe('reset');
  expect(startState(step({ gear: 3, rpm: 7000 }))).toEqual(inGearPatch(3, 7000));

  const off = createSimulation();
  const patch = startState(step({ engineOff: true }));
  if (patch === 'keep' || patch === 'reset') throw new Error('expected a patch');
  off.setState(patch);
  let s = off.getState();
  expect(s.engine.omega).toBe(0);
  expect(s.engine.running).toBe(false);
  expect(s.inputShaftOmega).toBe(0);
  expect(s.outputShaftOmega).toBe(0);
  expect(s.drum.angle).toBeCloseTo(deg(PARAMS.drum.detents.N), 12);
  expect(s.drum.detent).toBe('N');

  const blocked = createSimulation();
  const p2 = startState(step({ engineOff: true, drumDeg: 60, misaligned: 'A' }));
  if (p2 === 'keep' || p2 === 'reset') throw new Error('expected a patch');
  blocked.setState(p2);
  s = blocked.getState();
  expect(s.drum.angle).toBeCloseTo(deg(60), 12);
  // face to face: the dogs sit well outside the window in which they can enter a slot
  const pitch = 360 / PARAMS.dogs.count;
  const phiDeg = (s.sliders.A.phi * 180) / Math.PI;
  expect(phiDeg).toBeGreaterThan(PARAMS.dogs.windowDeg + 10);
  expect(phiDeg).toBeLessThan(pitch - 10);
});

test('every scripted step does what its text claims', () => {
  for (const l of LESSONS) {
    for (const v of playLesson(l)) expect(v.ok, v.id).toBe(true);
  }
});

test('every scripted step still holds with its timings stretched or squeezed by 10%', () => {
  for (const k of [0.9, 1.1]) {
    for (const l of LESSONS) {
      for (const v of playLesson(l, k)) expect(v.ok, `${v.id} at x${k}`).toBe(true);
    }
  }
});

test('outcomes are not vacuous: doing nothing from the same start fails them', () => {
  // these two are what a released lever does anyway: the clutch locks again, the engine stalls
  const passIdle = new Set(['pull-the-clutch/release', 'stalling/dump']);
  for (const l of LESSONS) {
    const sim = createSimulation();
    const idle = createSimulation();
    for (const s of l.steps) {
      applyStart(sim, s);
      applyStart(idle, s);
      if (!s.script) continue;
      const real = runStep(sim, s);
      const none = runStep(idle, { ...s, script: () => NEUTRAL_INPUTS });
      idle.setState(real.final); // the next step continues from what the script did
      const id = `${l.id}/${s.id}`;
      expect(s.outcome!(none.final, none.trace), id).toBe(passIdle.has(id));
    }
  }
});

test('lesson 7: the weak stroke sits inside the false-neutral window, between a feeble and a full stroke', () => {
  const l7 = LESSONS.find((l) => l.number === 7)!;
  const weak = l7.steps.find((s) => s.id === 'weak')!;
  const strokeEnd = (amount: number) => {
    const sim = createSimulation();
    applyStart(sim, weak);
    return runSource(sim, keyframes({ clutchLever: [[0, 0], [0.1, 1]], pedal: pedalStroke(0.3, amount) }), 1.5);
  };
  for (const a of [WEAK_STROKE - 0.005, WEAK_STROKE, WEAK_STROKE + 0.005]) {
    const s = strokeEnd(a);
    expect(s.lockedGear, `stroke ${a}`).toBeNull();
    expect(s.drum.detent, `stroke ${a}`).toBeNull();
  }
  expect(strokeEnd(0.4).lockedGear).toBe(2);
  expect(strokeEnd(1).lockedGear).toBe(3);
});

test('lesson 8: turning the drum by hand selects a gear or leaves a blocked dog, and the wheel frees it', () => {
  const l8 = LESSONS.find((l) => l.number === 8)!;
  const hold = (key: 'handDrumTorque' | 'handWheelTorque', v: number) =>
    keyframes({ ignition: [[0, false]], [key]: [[0, v], [0.4, v], [0.41, 0]] });

  // first step: drum at neutral, dogs free; turning it toward second selects second
  const sim = createSimulation();
  applyStart(sim, l8.steps[0]);
  const a = runSource(sim, hold('handDrumTorque', 3), 1);
  expect(a.engine.running).toBe(false);
  expect(a.lockedGear).toBe(2);

  // blocked step: turning toward first leaves the dogs face to face, short of the notch
  const blockedStep = l8.steps.find((s) => typeof s.start === 'object' && 'misaligned' in s.start)!;
  applyStart(sim, blockedStep);
  const b = runSource(sim, hold('handDrumTorque', -3), 1);
  expect(b.lockedGear).toBeNull();
  expect(b.sliders.A.blocked).toBe(true);
  expect(b.drum.detent).toBeNull();

  // turning the rear wheel brings a slot round; the dogs drop in and the drum seats in first
  const c = runSource(sim, hold('handWheelTorque', 40), 1.5);
  expect(c.lockedGear).toBe(1);
  expect(c.drum.detent).toBe(1);
  expect(c.engine.running).toBe(false);
});

test('scripts are deterministic and never return a non-input', () => {
  for (const { l, s } of allSteps()) {
    if (!s.script) continue;
    const state = createSimulation().getState();
    const u = s.script(0.5, state);
    expect(Object.keys(u).sort(), `${l.id}/${s.id}`).toEqual(Object.keys(NEUTRAL_INPUTS).sort());
    expect(s.script(0.5, state)).toEqual(u);
  }
});

test('lesson 2: the pull outcome needs the shaft to keep most of its speed through the whole hold', () => {
  const { step, final, trace } = runTo(2, 'pull');
  expect(step.outcome!(final, trace)).toBe(true);
  // a shaft that sagged below half the basket speed mid-hold, then recovered, must not pass
  const sagged = trace.map((s) => structuredClone(s));
  const mid = sagged.findIndex((s) => s.clutch.capacity === 0) + 100;
  sagged[mid].inputShaftOmega = 0.4 * (sagged[mid].engine.omega / (PARAMS.primary.driven / PARAMS.primary.drive));
  expect(step.outcome!(final, sagged)).toBe(false);
  // nor one that ends turning with the basket, as a locked clutch would
  const withBasket = { ...final, inputShaftOmega: final.engine.omega / (PARAMS.primary.driven / PARAMS.primary.drive) };
  expect(step.outcome!(withBasket, [...trace.slice(0, -1), withBasket])).toBe(false);
});

test('lesson 4: one slipping sample is not enough; the feed must slip for more than 0.3 s', () => {
  const { step, final, trace } = runTo(4, 'feed');
  expect(step.outcome!(final, trace)).toBe(true);
  let kept = false;
  const brief = trace.map((s) => {
    const c = structuredClone(s);
    if (c.clutch.capacity > 0 && !c.clutch.locked) {
      if (kept) { c.clutch.locked = true; c.clutch.slip = 0; } else kept = true;
    }
    return c;
  });
  expect(step.outcome!(final, brief)).toBe(false);
});

test('lesson 6: the throttle dip continues from the refused shift, pedal still held up', () => {
  const l6 = LESSONS.find((l) => l.number === 6)!;
  const i = l6.steps.findIndex((s) => s.id === 'dip');
  expect(l6.steps[i - 1].id).toBe('refused');
  expect(startState(l6.steps[i])).toBe('keep');
  const refused = runTo(6, 'refused');
  expect(refused.final.pedal.travel).toBeGreaterThan(0.9);
  expect(refused.final.lockedGear).toBe(2);
  const dip = runTo(6, 'dip');
  expect(dip.trace[0].pedal.travel).toBeGreaterThan(0.9);
});

test('engine-off starts put every slider where the drum grooves put it, and nothing moves at rest', () => {
  const step = (start: LessonStep['start']): LessonStep => ({ id: 'x', title: 'a b', text: 'x.', start, ignition: false });
  const off = keyframes({ ignition: [[0, false]] });
  const detents = Object.entries(PARAMS.drum.detents) as Array<[string, number]>;
  for (const [name, a] of [...detents, ['between', 90] as [string, number]]) {
    const sim = createSimulation();
    applyStart(sim, step({ engineOff: true, drumDeg: a }));
    const s0 = sim.getState();
    const gear = name === 'N' || name === 'between' ? null : Number(name);
    expect(s0.lockedGear, `drum at ${a}°`).toBe(gear);
    const s1 = runSource(sim, off, 0.05);
    for (const id of ['A', 'B', 'C'] as const) {
      expect(s1.sliders[id].x, `drum at ${a}°, slider ${id}`).toBeCloseTo(s0.sliders[id].x, 9);
      expect(s1.sliders[id].locked, `drum at ${a}°, slider ${id}`).toBe(s0.sliders[id].locked);
    }
    expect(s1.lockedGear).toBe(gear);
  }
  // a misaligned slider at its own gear's detent starts blocked, face to face, and stays so
  const sim = createSimulation();
  applyStart(sim, step({ engineOff: true, drumDeg: 0, misaligned: 'A' }));
  const b0 = sim.getState();
  expect(b0.lockedGear).toBeNull();
  expect(b0.sliders.A.blocked).toBe(true);
  expect(Math.abs(b0.sliders.A.x)).toBeCloseTo(PARAMS.dogs.contactX, 9);
  const b1 = runSource(sim, off, 0.05);
  expect(b1.lockedGear).toBeNull();
  expect(b1.sliders.A.blocked).toBe(true);
});

test('counts in the copy match the model', () => {
  const NUMBER: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };
  const N = `(${Object.keys(NUMBER).join('|')}|\\d+)`;
  const value = (w: string) => NUMBER[w.toLowerCase()] ?? Number(w);
  const sliders = Object.keys(PARAMS.sliders).length;
  const pairs = Object.keys(PARAMS.gears).length;
  const expected: Array<{ phrase: RegExp; count: number }> = [
    { phrase: new RegExp(`\\b${N} gear pairs\\b`, 'gi'), count: pairs },
    { phrase: new RegExp(`\\ball ${N} (?:gear )?pairs\\b`, 'gi'), count: pairs },
    { phrase: new RegExp(`\\b${N} grooves\\b`, 'gi'), count: sliders }, // one groove per fork, one fork per slider
    { phrase: new RegExp(`\\b${N} sliding pieces\\b`, 'gi'), count: sliders },
  ];
  const copy = LESSONS.flatMap((l) => [l.summary, ...l.steps.flatMap((s) => [s.text, s.tryIt ?? ''])]).join('\n');
  for (const { phrase, count } of expected) {
    const found = [...copy.matchAll(phrase)].map((m) => m[1]);
    expect(found.length, `${phrase} is used in the copy`).toBeGreaterThan(0);
    for (const w of found) expect(value(w), `${phrase}: "${w}"`).toBe(count);
  }
});

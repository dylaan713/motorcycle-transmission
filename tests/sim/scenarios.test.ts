import { test, expect } from 'vitest';
import { PARAMS } from '../../src/sim/params';
import { deg, toDeg, toRpm } from '../../src/sim/units';
import { gearRatio } from '../../src/sim/kinematics';
import { DRUM_MAX, DRUM_MIN } from '../../src/sim/shiftDrum';
import { createSimulation } from '../../src/sim/simulation';
import { NEUTRAL_INPUTS, type GearId, type Inputs } from '../../src/sim/types';
import { createAutopilot, keyframes, pedalStroke, runSource, strokeAmount } from '../../src/sim/inputScript';
import { inGear } from './helpers';

const fresh = () => createSimulation();

test('launch: the clutch slips, then locks, and the engine survives', () => {
  const sim = fresh();
  let slipped = false;
  const s = runSource(sim, keyframes({
    clutchLever: [[0, 1], [0.6, 1], [2.4, 0]],
    pedal: pedalStroke(0.2, -1),
    throttle: [[0.6, 0.1], [1.2, 0.35]],
  }), 5, (st) => { if (st.lockedGear === 1 && st.clutch.slip > 5) slipped = true; });
  expect(s.lockedGear).toBe(1);
  expect(slipped).toBe(true);
  expect(s.clutch.locked).toBe(true);
  expect(s.engine.running).toBe(true);
  expect(s.roadSpeed).toBeGreaterThan(3);
});
test('dumping the clutch at idle in first stalls the engine', () => {
  const s = runSource(fresh(), keyframes({
    clutchLever: [[0, 1], [0.8, 1], [0.82, 0]],
    pedal: pedalStroke(0.2, -1),
  }), 3);
  expect(s.engine.running).toBe(false);
});
test('first gear clunks in from neutral: the input shaft is snapped to rest', () => {
  const sim = fresh();
  let before = 0;
  runSource(sim, keyframes({ clutchLever: [[0, 1]] }), 1, (st) => { before = st.inputShaftOmega; });
  const s = runSource(sim, keyframes({ clutchLever: [[0, 1]], pedal: pedalStroke(0, -1) }), 0.6);
  expect(before).toBeGreaterThan(5);
  expect(s.lockedGear).toBe(1);
  expect(s.inputShaftOmega).toBeCloseTo(0, 1);
});
test('an upshift under full throttle is refused; easing the throttle lets it through', () => {
  const loaded = inGear(2, 8000);
  const a = runSource(loaded, keyframes({ throttle: [[0, 1]], pedal: pedalStroke(0.3, +1) }), 1);
  expect(a.lockedGear).toBe(2);
  expect(toDeg(a.drum.angle)).toBeCloseTo(60, 0);   // the drum went solid, then the detent took it back
  const eased = inGear(2, 8000);
  const b = runSource(eased, keyframes({
    throttle: [[0, 1], [0.3, 1], [0.32, 0.12], [0.5, 0.12], [0.52, 1]],
    pedal: pedalStroke(0.3, +1),
  }), 1.2);
  expect(b.lockedGear).toBe(3);
});
test('a clutched downshift raises engine speed to the lower gear', () => {
  const sim = inGear(4, 6000);
  const s = runSource(sim, keyframes({
    clutchLever: [[0, 0], [0.2, 1], [0.5, 1], [0.9, 0]],
    pedal: pedalStroke(0.3, -1),
  }), 2);
  expect(s.lockedGear).toBe(3);
  expect(toRpm(s.engine.omega)).toBeGreaterThan(6000);
});
test('engine off, nothing turning: blocked dogs give a false neutral until the wheel is rocked', () => {
  const sim = fresh();
  sim.setState({ engine: { omega: 0, running: false }, inputShaftOmega: 0, sliders: { A: { phi: deg(40) } } });
  const off = { ignition: [[0, false]] as Array<[number, boolean]> };
  const a = runSource(sim, keyframes({ ...off, pedal: pedalStroke(0, -1) }), 1);
  expect(a.lockedGear).toBeNull();
  expect(a.sliders.A.blocked).toBe(true);
  const b = runSource(sim, keyframes({ ...off, handWheelTorque: [[0, 40], [0.5, 40], [0.51, 0]] }), 1.5);
  expect(b.lockedGear).toBe(1);
});
test('turning the drum by hand with the engine off selects a gear', () => {
  const sim = fresh();
  sim.setState({ engine: { omega: 0, running: false }, inputShaftOmega: 0, sliders: { B: { phi: deg(5) } } });
  const s = runSource(sim, keyframes({ ignition: [[0, false]], handDrumTorque: [[0, 3], [0.4, 3], [0.41, 0]] }), 1);
  expect(s.lockedGear).toBe(2);
});
test('a weak stroke can leave the box between gears', () => {
  const outcomes: Array<GearId | null> = [];
  for (let amount = 0.3; amount <= 1.0001; amount += 0.01) {
    const s = runSource(inGear(2, 5000), keyframes({ clutchLever: [[0, 1]], pedal: pedalStroke(0.2, amount) }), 1.2);
    outcomes.push(s.lockedGear);
  }
  expect(outcomes.at(-1)).toBe(3);        // a full stroke shifts
  expect(outcomes[0]).toBe(2);            // a feeble one does not
  expect(outcomes).toContain(null);       // somewhere between, a false neutral
});
test('starter in gear with the clutch out lurches the bike but stays sane', () => {
  const sim = fresh();
  sim.setState({ engine: { omega: 0, running: false }, inputShaftOmega: 0 });
  runSource(sim, keyframes({ ignition: [[0, false]], pedal: pedalStroke(0, -1), handWheelTorque: [[0, 40], [0.4, 40], [0.41, 0]] }), 1);
  const s = runSource(sim, keyframes({ starter: [[0, true]] }), 1);
  expect(Number.isFinite(s.roadSpeed)).toBe(true);
  expect(s.lockedGear).toBe(1);
});
test('autopilot visits every gear and comes back to rest without stalling', () => {
  const seen = new Set<number>();
  let stalled = false, stoppedAfterSixth = false;
  runSource(fresh(), createAutopilot(), 120, (st) => {
    if (st.lockedGear) seen.add(st.lockedGear);
    if (st.t > 2 && !st.engine.running) stalled = true;
    if (seen.has(6) && st.roadSpeed === 0) stoppedAfterSixth = true;
  });
  expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  expect(stalled).toBe(false);
  expect(stoppedAfterSixth).toBe(true);
});
test('autopilot recovers from a false neutral and from a stalled engine in gear', () => {
  const falseNeutral = inGear(2, 6000);
  falseNeutral.setState({ drum: { angle: deg(90), omega: 0 }, sliders: { B: { x: 0, locked: null } } });
  const stalled = inGear(1, 1000);
  stalled.setState({ engine: { omega: 0, running: false }, inputShaftOmega: 0, outputShaftOmega: 0 });
  for (const sim of [falseNeutral, stalled]) {
    const seen = new Set<number>();
    let started = false, stalledAgain = false;
    runSource(sim, createAutopilot(), 60, (st) => {
      if (st.lockedGear) seen.add(st.lockedGear);
      if (st.engine.running) started = true;
      else if (started) stalledAgain = true;
    });
    expect(seen.has(6)).toBe(true);
    expect(started).toBe(true);
    expect(stalledAgain).toBe(false);
  }
});
test('invariants hold under 60 s of seeded random inputs', () => {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  let held: Inputs = NEUTRAL_INPUTS;
  runSource(fresh(), (t) => {
    if (Math.floor(t * 4) !== Math.floor((t - PARAMS.dt) * 4)) {
      held = { ...NEUTRAL_INPUTS, throttle: rnd(), clutchLever: rnd(), pedal: rnd() * 2 - 1, brake: rnd() < 0.2 ? rnd() : 0, starter: rnd() < 0.1 };
    }
    return held;
  }, 60, (st) => {
    const locked = (['A', 'B', 'C'] as const).filter((k) => st.sliders[k].locked !== null).length;
    expect(locked).toBeLessThanOrEqual(1);
    expect(st.drum.angle).toBeGreaterThanOrEqual(DRUM_MIN - 1e-9);
    expect(st.drum.angle).toBeLessThanOrEqual(DRUM_MAX + 1e-9);
    expect(st.outputShaftOmega).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(st.engine.omega + st.inputShaftOmega + st.outputShaftOmega)).toBe(true);
    if (st.lockedGear) expect(st.inputShaftOmega).toBeCloseTo(gearRatio(st.lockedGear) * st.outputShaftOmega, 5);
  });
});
test('from a false neutral a full stroke finds the next gear, never neutral or two gears away', () => {
  // [rest angle, gear above, gear below]
  const cases: Array<[number, GearId, GearId]> = [[90, 3, 2], [150, 4, 3], [210, 5, 4]];
  for (const [a, above, below] of cases) {
    for (const [dir, want] of [[+1, above], [-1, below]] as const) {
      const sim = inGear(2, 5000);
      sim.setState({ drum: { angle: deg(a), omega: 0 }, sliders: { B: { x: 0, locked: null } } });
      const s = runSource(sim, keyframes({ clutchLever: [[0, 1]], pedal: pedalStroke(0.2, dir) }), 1.2);
      expect(s.lockedGear).toBe(want);
    }
  }
});
test('autopilot strokes: none when the drum already sits at the target, full toward a gear', () => {
  // dogs merely blocked near the target detent: wait, do not kick the drum backwards
  for (const a of [57.5, 59, 60, 61.5, 62.5]) expect(strokeAmount(2, deg(a))).toBe(0);
  expect(strokeAmount(3, deg(90))).toBe(1);        // the pawl itself ends the stroke at third
  expect(strokeAmount(2, deg(90))).toBe(-1);
  expect(strokeAmount(2, deg(30))).toBe(1);        // short stroke from neutral
  const toN = strokeAmount('N', deg(60));
  expect(toN).toBeLessThan(-0.4);                   // a half stroke, not a full one
  expect(toN).toBeGreaterThan(-0.8);
});
test('a forced clutchless downshift from sixth to first is resisted above the limiter', () => {
  const pedal: Array<[number, number]> = [];
  for (let i = 0; i < 6; i++) pedal.push(...pedalStroke(0.2 + i * 0.4, -1));
  let maxRpm = 0;
  const s = runSource(inGear(6, 9000), keyframes({ pedal }), 3.5, (st) => {
    maxRpm = Math.max(maxRpm, toRpm(st.engine.omega));
    expect(Number.isFinite(st.engine.omega + st.inputShaftOmega + st.outputShaftOmega)).toBe(true);
    expect(st.engine.omega).toBeGreaterThanOrEqual(0);
    expect(st.outputShaftOmega).toBeGreaterThanOrEqual(0);
  });
  expect(s.lockedGear).not.toBe(6);              // the strokes did force lower gears in
  expect(maxRpm).toBeLessThan(17000);
});
test('autopilot moves every analog control smoothly', () => {
  const ap = createAutopilot();
  const channels = ['throttle', 'clutchLever', 'brake', 'handDrumTorque', 'handWheelTorque', 'handInputShaftTorque'] as const;
  let prev: Inputs | null = null;
  let worst = 0;
  runSource(fresh(), (t, st) => {
    const u = ap(t, st);
    if (prev) for (const k of channels) worst = Math.max(worst, Math.abs(u[k] - prev[k]));
    prev = u;
    return u;
  }, 60);
  expect(worst).toBeLessThanOrEqual(0.02);
});
test('autopilot rides like a competent rider: quick launch, upshifts that land on the next gear', () => {
  const sim = fresh();
  let launchSlip = 0;
  let launchLow = Infinity; // lowest engine speed while the launch slips
  let upshifts = 0;
  let gear: GearId | null = null;
  let shifting: GearId | null = null; // new gear after an upshift, until the clutch locks again
  let bitten = false;
  let worstMismatch = 0;
  runSource(sim, createAutopilot(), 40, (st) => {
    const g = st.lockedGear;
    if (g !== null && gear !== null && g === gear + 1) { shifting = g; bitten = false; upshifts++; }
    if (g !== null) gear = g;
    if (upshifts === 0 && g === 1 && !st.clutch.locked && st.clutch.capacity > 0) {
      launchSlip += PARAMS.dt;
      launchLow = Math.min(launchLow, toRpm(st.engine.omega));
    }
    if (shifting !== null && g === shifting) {
      if (st.clutch.capacity > 0) bitten = true;
      if (st.clutch.locked) shifting = null;
      else if (bitten) {
        // engine speed against the speed it turns at once the clutch is home in the new gear
        const matched = toRpm(st.inputShaftOmega * PARAMS.primary.driven / PARAMS.primary.drive);
        worstMismatch = Math.max(worstMismatch, Math.abs(toRpm(st.engine.omega) - matched));
      }
    }
  });
  expect(upshifts).toBeGreaterThanOrEqual(5);
  expect(launchSlip).toBeGreaterThan(0.3);
  expect(launchSlip).toBeLessThan(2);
  expect(launchLow).toBeGreaterThan(2800);       // the launch holds its revs rather than bogging
  expect(worstMismatch).toBeLessThan(600);
});

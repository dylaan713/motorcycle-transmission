import { test, expect } from 'vitest';
import { deg, toDeg, toRpm } from '../../src/sim/units';
import { gearRatio, primaryRatio } from '../../src/sim/kinematics';
import { createSimulation, sanitizeInputs } from '../../src/sim/simulation';
import type { Inputs } from '../../src/sim/types';
import { PARAMS } from '../../src/sim/params';
import { inGear, inp, run } from './helpers';

test('reset state idles in neutral at a standstill', () => {
  const s = run(createSimulation(), inp(), 2);
  expect(s.lockedGear).toBeNull();
  expect(s.roadSpeed).toBe(0);
  expect(toRpm(s.engine.omega)).toBeGreaterThan(1100);
  expect(toRpm(s.engine.omega)).toBeLessThan(1500);
});
test('in neutral, clutch drag keeps the input shaft turning with the lever pulled', () => {
  const s = run(createSimulation(), inp({ clutchLever: 1 }), 3);
  expect(s.inputShaftOmega).toBeGreaterThan(5);
  expect(s.clutch.slip).toBeGreaterThan(0);
});
test('shaft speeds match the ratio exactly in every gear', () => {
  for (const g of [1, 2, 3, 4, 5, 6] as const) {
    const s = run(inGear(g, 6000), inp({ throttle: 0.4 }), 1);
    expect(s.lockedGear).toBe(g);
    expect(s.inputShaftOmega).toBeCloseTo(gearRatio(g) * s.outputShaftOmega, 6);
    expect(s.clutch.locked).toBe(true);
    expect(s.engine.omega / primaryRatio).toBeCloseTo(s.inputShaftOmega, 3);
  }
});
test('full throttle accelerates and the limiter holds', () => {
  const s = run(inGear(1, 6000), inp({ throttle: 1 }), 6);
  expect(toRpm(s.engine.omega)).toBeLessThan(15300);
  expect(s.roadSpeed).toBeGreaterThan(19.21);
});
test('closed throttle in gear slows the bike by engine braking', () => {
  const sim = inGear(3, 9000);
  const v0 = sim.getState().roadSpeed;
  const s = run(sim, inp(), 2);
  expect(s.roadSpeed).toBeLessThan(v0);
  expect(s.dogTorque).toBeLessThan(0);
});
test('revving in neutral does not move the bike', () => {
  expect(run(createSimulation(), inp({ throttle: 1 }), 2).roadSpeed).toBe(0);
});
test('brake stops the bike and never reverses it', () => {
  const sim = inGear(2, 5000);
  const s = run(sim, inp({ brake: 1, clutchLever: 1 }), 8);
  expect(s.roadSpeed).toBe(0);
  expect(run(sim, inp({ brake: 1, clutchLever: 1 }), 1).outputShaftOmega).toBe(0);
});
test('bad inputs are sanitised', () => {
  expect(sanitizeInputs({ throttle: 2, pedal: NaN, brake: -1 })).toMatchObject({ throttle: 1, pedal: 0, brake: 0 });
  const s = run(createSimulation(), { ...inp(), throttle: Infinity, clutchLever: NaN } as Inputs, 1);
  expect(Number.isFinite(s.engine.omega)).toBe(true);
});
test('advance caps a long frame gap', () => {
  const sim = createSimulation();
  expect(sim.advance(inp(), 30)).toBeCloseTo(0.1, 6);
  expect(sim.getState().t).toBeCloseTo(0.1, 6);
});
test('getState returns a copy', () => {
  const sim = createSimulation();
  const a = sim.getState(); a.engine.omega = -1;
  expect(sim.getState().engine.omega).toBeGreaterThan(0);
});
test('a fully pulled lever never sticks the clutch, even when the throttle snaps shut', () => {
  const sim = inGear(3, 9000);
  const check = (inputs: Inputs, seconds: number) => {
    for (let t = 0; t < seconds; t += PARAMS.dt) {
      sim.step(inputs);
      const c = sim.getState().clutch;
      expect(c.locked).toBe(false);
      expect(Math.abs(c.torque)).toBeLessThanOrEqual(PARAMS.clutch.dragMax);
    }
  };
  check(inp({ clutchLever: 1, throttle: 1 }), 0.5);
  check(inp({ clutchLever: 1, throttle: 0 }), 1);
});
test('the fork block: a full pedal stroke under full throttle cannot pull a loaded dog', () => {
  const sim = inGear(3, 9000);
  const detent = deg(PARAMS.drum.detents[3]);
  let maxSwing = 0;
  // the pedal starts at rest so the ratchet arms at this drum angle, then one full stroke
  for (let t = 0; t < 1; t += PARAMS.dt) {
    sim.step(inp({ throttle: 1, pedal: t > 0.01 && t < 0.16 ? 1 : 0 }));
    const s = sim.getState();
    expect(s.lockedGear).toBe(3);
    expect(['A', 'B', 'C'].filter((k) => s.sliders[k as 'A'].locked !== null)).toHaveLength(1);
    maxSwing = Math.max(maxSwing, Math.abs(s.drum.angle - detent));
  }
  expect(toDeg(maxSwing)).toBeGreaterThan(1); // the pedal did move the drum until it went solid
  // back in its detent: within the band where the detent torque is below the drum's stiction
  const band = (Math.asin(PARAMS.drum.staticFriction / PARAMS.drum.detentPeak) * 60) / (2 * Math.PI);
  expect(Math.abs(toDeg(sim.getState().drum.angle - detent))).toBeLessThanOrEqual(band);
});
test('dog torque on a slider-C gear is positive under drive and negative under engine braking', () => {
  for (const g of [5, 6] as const) {
    expect(run(inGear(g, 8000), inp({ throttle: 1 }), 0.3).dogTorque).toBeGreaterThan(0);
    expect(run(inGear(g, 9000), inp(), 0.3).dogTorque).toBeLessThan(0);
  }
});

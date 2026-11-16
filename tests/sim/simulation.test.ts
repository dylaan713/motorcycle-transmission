import { test, expect } from 'vitest';
import { PARAMS } from '../../src/sim/params';
import { deg, rpm, toRpm } from '../../src/sim/units';
import { gearRatio, primaryRatio } from '../../src/sim/kinematics';
import { createSimulation, sanitizeInputs, type Simulation } from '../../src/sim/simulation';
import { NEUTRAL_INPUTS, type GearId, type Inputs, type SliderId } from '../../src/sim/types';

const inp = (o: Partial<Inputs> = {}): Inputs => ({ ...NEUTRAL_INPUTS, ...o });
const run = (sim: Simulation, inputs: Inputs, seconds: number) => {
  for (let t = 0; t < seconds; t += PARAMS.dt) sim.step(inputs);
  return sim.getState();
};
const inGear = (g: GearId, engineRpm: number) => {   // locked clutch, steady, in gear g
  const sim = createSimulation();
  const wOut = rpm(engineRpm) / primaryRatio / gearRatio(g);
  const drumDeg = PARAMS.drum.detents[g];
  const id = (['A', 'B', 'C'] as SliderId[]).find(
    (k) => PARAMS.sliders[k].neg === g || PARAMS.sliders[k].pos === g,
  )!;
  const x = PARAMS.sliders[id].neg === g ? -1 : 1;
  sim.setState({
    drum: { angle: deg(drumDeg), omega: 0 },
    sliders: { [id]: { x, phi: 0, locked: g, blocked: false } },
    lockedGear: g,
    engine: { omega: rpm(engineRpm), running: true },
    inputShaftOmega: wOut * gearRatio(g),
    outputShaftOmega: wOut,
  });
  return sim;
};

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

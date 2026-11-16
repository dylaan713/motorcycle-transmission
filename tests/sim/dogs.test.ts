import { test, expect } from 'vitest';
import { PARAMS } from '../../src/sim/params';
import { deg } from '../../src/sim/units';
import { gearRatio, reflectedVehicleInertia } from '../../src/sim/kinematics';
import { dogAligned, engageSpeeds, stepSlider, targetGear, withdrawalForce } from '../../src/sim/dogs';
import type { GearId, SliderState } from '../../src/sim/types';

const free = (): SliderState => ({ x: 0, phi: 0, locked: null, blocked: false });
const run = (s: SliderState, command: number, relOmega: number, torque: number, seconds: number) => {
  let locked: GearId | null = null;
  for (let t = 0; t < seconds; t += PARAMS.dt) {
    const r = stepSlider('A', s, command, relOmega, torque, PARAMS.dt);
    s = r.state; locked = r.justLocked ?? locked;
  }
  return { s, locked };
};

test('alignment window is 16 of every 72 degrees', () => {
  expect(dogAligned(deg(5))).toBe(true);
  expect(dogAligned(deg(20))).toBe(false);
  expect(dogAligned(deg(72 + 5))).toBe(true);
  expect(dogAligned(deg(-60))).toBe(true);
});
test('aligned dogs drop straight in', () => {
  const { s } = run({ ...free(), phi: deg(5) }, -1, 0, 0, 0.2);
  expect(s.locked).toBe(1);
  expect(s.x).toBeCloseTo(-1, 3);
});
test('face-to-face dogs wait at contact until rotation lines them up', () => {
  const stuck = run({ ...free(), phi: deg(40) }, -1, 0, 0, 0.2).s;
  expect(stuck.locked).toBeNull();
  expect(stuck.blocked).toBe(true);
  expect(stuck.x).toBeCloseTo(-0.5, 6);
  expect(run(stuck, -1, deg(200), 0, 0.5).s.locked).toBe(1);
});
test('a loaded dog will not withdraw; an unloaded one will', () => {
  const engaged: SliderState = { x: -1, phi: deg(5), locked: 1, blocked: false };
  expect(withdrawalForce(360)).toBeCloseTo(1800, 9);
  expect(run(engaged, 0, 0, 360, 0.3).s.locked).toBe(1);
  expect(run(engaged, 0, 0, 20, 0.3).s.locked).toBeNull();
});
test('engagement matches speeds and conserves momentum', () => {
  const g = gearRatio(2), Jin = 0.004, Jout = reflectedVehicleInertia;
  const r = engageSpeeds(2, 400, 30, Jin, Jout);
  expect(r.inputOmega).toBeCloseTo(g * r.outputOmega, 9);
  expect(g * Jin * r.inputOmega + Jout * r.outputOmega).toBeCloseTo(g * Jin * 400 + Jout * 30, 9);
});
test('slider sign picks the gear', () => {
  expect(targetGear('A', -0.6)).toBe(1);
  expect(targetGear('A', 0.6)).toBe(3);
  expect(targetGear('B', 0.6)).toBe(2);
  expect(targetGear('C', -0.6)).toBe(5);
  expect(targetGear('C', 0)).toBeNull();
});

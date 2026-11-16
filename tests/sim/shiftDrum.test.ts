import { test, expect } from 'vitest';
import { PARAMS } from '../../src/sim/params';
import { deg, toDeg } from '../../src/sim/units';
import { detentTorque, grooveCommand, nearestDetent, pawlTorque, stepDrum } from '../../src/sim/shiftDrum';

const settle = (startDeg: number, pedalTrace: (t: number) => number, seconds = 1) => {
  // integrates pawl + detent only (no forks): returns the final drum angle in degrees
  let drum = { angle: deg(startDeg), omega: 0 };
  let ratchet = { strokeStartAngle: drum.angle };
  for (let t = 0; t < seconds; t += PARAMS.dt) {
    const p = pawlTorque(pedalTrace(t), drum.angle, ratchet);
    ratchet = p.ratchet;
    drum = stepDrum(drum, p.torque + detentTorque(drum.angle), PARAMS.dt);
  }
  return toDeg(drum.angle);
};
const stroke = (amount: number) => (t: number) => (t < 0.15 ? amount : 0);

test('detent pulls toward each gear and neutral is the weakest', () => {
  for (const a of [0, 30, 60, 120, 180, 240, 300]) expect(detentTorque(deg(a))).toBeCloseTo(0, 9);
  expect(detentTorque(deg(125))).toBeLessThan(0);
  expect(detentTorque(deg(115))).toBeGreaterThan(0);
  expect(Math.abs(detentTorque(deg(33)))).toBeLessThan(Math.abs(detentTorque(deg(123))));
});
test('grooves command one slider per gear', () => {
  const at = (a: number) => (['A', 'B', 'C'] as const).map((s) => grooveCommand(s, deg(a)));
  expect(at(0)).toEqual([-1, 0, 0]);
  expect(at(30)).toEqual([0, 0, 0]);
  expect(at(60)).toEqual([0, 1, 0]);
  expect(at(120)).toEqual([1, 0, 0]);
  expect(at(180)).toEqual([0, -1, 0]);
  expect(at(240)).toEqual([0, 0, -1]);
  expect(at(300)).toEqual([0, 0, 1]);
  expect(at(90)).toEqual([0, 0, 0]);          // between gears nothing is commanded
  expect(grooveCommand('A', deg(15))).toBeCloseTo(-0.5, 9);
});
test('at no drum angle are two sliders commanded at once', () => {
  for (let a = 0; a <= 300; a += 0.5) {
    const n = (['A', 'B', 'C'] as const).filter((s) => grooveCommand(s, deg(a)) !== 0).length;
    expect(n).toBeLessThanOrEqual(1);
  }
});
test('full strokes walk the pattern 1-N-2-3-4-5-6 and stop at both ends', () => {
  expect(settle(0, stroke(+1))).toBeCloseTo(60, 0);    // 1st -> 2nd, past neutral
  expect(settle(0, stroke(+0.5))).toBeCloseTo(30, 0);  // half stroke finds neutral
  expect(settle(30, stroke(+1))).toBeCloseTo(60, 0);
  expect(settle(30, stroke(-1))).toBeCloseTo(0, 0);
  expect(settle(60, stroke(+1))).toBeCloseTo(120, 0);
  expect(settle(240, stroke(+1))).toBeCloseTo(300, 0);
  expect(settle(300, stroke(+1))).toBeCloseTo(300, 0);
  expect(settle(0, stroke(-1))).toBeCloseTo(0, 0);
  expect(settle(180, stroke(-1))).toBeCloseTo(120, 0);
});
test('a short stroke does not change gear', () => {
  expect(settle(120, stroke(+0.3))).toBeCloseTo(120, 0);
});
test('holding the pedal gives one shift, not several', () => {
  expect(settle(60, () => +1, 2)).toBeLessThan(125);
});
test('the drum can rest between detents', () => {
  expect(toDeg(stepDrum({ angle: deg(90), omega: 0 }, detentTorque(deg(90)), PARAMS.dt).angle)).toBeCloseTo(90, 6);
});
test('stiction holds a resting drum inside the static band', () => {
  expect(Math.abs(detentTorque(deg(89.2)))).toBeLessThan(PARAMS.drum.staticFriction);
  expect(settle(89.2, () => 0)).toBeCloseTo(89.2, 6);
});
test('a resting drum outside the static band returns to its detent', () => {
  expect(Math.abs(settle(85, () => 0) - 60)).toBeLessThan(0.5);
});
test('a drum pushed slowly to a halt near the peak sticks there when the pedal lets go', () => {
  // the pawl creeps the drum to a balance just short of 90°; its speed only decays toward zero
  const end = settle(60, stroke(+0.48));
  expect(Math.abs(detentTorque(deg(end)))).toBeLessThan(PARAMS.drum.staticFriction);
  expect(end).toBeGreaterThan(89);
  expect(end).toBeLessThan(90);
});
test('a full stroke from a false neutral lands on the adjacent gear', () => {
  // [rest angle, gear above, gear below] in degrees
  const cases: Array<[number, number, number]> = [[90, 120, 60], [150, 180, 120], [210, 240, 180], [45, 60, 0], [15, 60, 0]];
  for (const [start, above, below] of cases) {
    expect(settle(start, stroke(+1))).toBeCloseTo(above, 0);
    expect(settle(start, stroke(-1))).toBeCloseTo(below, 0);
  }
});
test('a full stroke reaches neutral only from the half-step between first and second', () => {
  for (let start = 61; start <= 300; start += 1) {
    for (const dir of [+1, -1]) expect(Math.abs(settle(start, stroke(dir)) - 30)).toBeGreaterThan(5);
  }
});
test('nearest detent names the closest detent and the error from it', () => {
  expect(nearestDetent(deg(31))).toMatchObject({ name: 'N', angle: deg(30) });
  expect(toDeg(nearestDetent(deg(31)).error)).toBeCloseTo(1, 9);
  expect(nearestDetent(deg(89)).name).toBe(2);
  expect(nearestDetent(deg(91)).name).toBe(3);
  expect(toDeg(nearestDetent(deg(298)).error)).toBeCloseTo(-2, 9);
  expect(nearestDetent(deg(-1)).name).toBe(1);
});

import { test, expect } from 'vitest';
import { deg, rpm, toRpm, clamp, wrap } from '../../src/sim/units';
import { PARAMS } from '../../src/sim/params';

test('unit helpers', () => {
  expect(deg(180)).toBeCloseTo(Math.PI, 12);
  expect(toRpm(rpm(1300))).toBeCloseTo(1300, 9);
  expect(clamp(2, 0, 1)).toBe(1);
  expect(clamp(NaN, 0, 1)).toBe(0);
  expect(wrap(deg(-10), deg(72))).toBeCloseTo(deg(62), 12);
});
test('every gear pair shares one centre distance', () => {
  for (const [a, b] of Object.values(PARAMS.gears)) expect(a + b).toBe(50);
});
test('wrap stays strictly below the period for tiny negative input', () => {
  expect(wrap(-1e-20, 1)).toBeLessThan(1);
  expect(wrap(-1e-20, 1)).toBeGreaterThanOrEqual(0);
});
test('wrapPi wraps an angle into (-π, π], the one source for every view', async () => {
  const { wrapPi } = await import('../../src/sim/units');
  expect(wrapPi(deg(190))).toBeCloseTo(deg(-170), 12);
  expect(wrapPi(deg(-190))).toBeCloseTo(deg(170), 12);
  expect(wrapPi(deg(45) + 6 * Math.PI)).toBeCloseTo(deg(45), 12);
  expect(wrapPi(0)).toBe(0);
});

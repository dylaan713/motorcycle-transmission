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

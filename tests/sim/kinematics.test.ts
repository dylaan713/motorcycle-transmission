import { test, expect } from 'vitest';
import {
  primaryRatio, gearRatio, overallRatio, roadSpeed, freeGearOmega, reflectedVehicleInertia,
} from '../../src/sim/kinematics';
import { rpm } from '../../src/sim/units';
import type { GearId } from '../../src/sim/types';

test('ratios come from tooth counts', () => {
  expect(gearRatio(1)).toBeCloseTo(37 / 13, 12);
  expect(gearRatio(6)).toBeCloseTo(26 / 24, 12);
  expect(overallRatio(1)).toBeCloseTo(16.8990, 3);
  expect(overallRatio(6)).toBeCloseTo(6.4323, 3);
});
test('road speed at 10 000 rpm matches the hand calculation', () => {
  const v = (g: GearId) => roadSpeed(rpm(10000) / primaryRatio / gearRatio(g));
  expect(v(1)).toBeCloseTo(19.21, 2);
  expect(v(6)).toBeCloseTo(50.47, 2);
});
test('ratios fall monotonically from first to sixth', () => {
  for (const g of [1, 2, 3, 4, 5] as const) expect(gearRatio(g)).toBeGreaterThan(gearRatio((g + 1) as GearId));
});
test('the free gear of the locked pair turns with its shaft', () => {
  const wOut = 40;
  expect(freeGearOmega(3, wOut * gearRatio(3), wOut)).toBeCloseTo(wOut, 9);
  expect(freeGearOmega(5, wOut * gearRatio(5), wOut)).toBeCloseTo(wOut * gearRatio(5), 9);
});
test('reflected vehicle inertia', () => {
  expect(reflectedVehicleInertia).toBeCloseTo((270 * 0.31 ** 2 + 1.0) / (45 / 16) ** 2, 9);
});

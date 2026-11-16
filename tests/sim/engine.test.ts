import { test, expect } from 'vitest';
import { fullThrottleTorque, closedThrottleTorque, engineTorque, nextRunning } from '../../src/sim/engine';
import { rpm } from '../../src/sim/units';

test('torque curve', () => {
  expect(fullThrottleTorque(rpm(11000))).toBeCloseTo(60, 9);
  expect(fullThrottleTorque(rpm(6000))).toBeCloseTo(48.5, 9);
  expect(fullThrottleTorque(rpm(15001))).toBe(0);
});
test('closed throttle brakes the engine', () => {
  expect(closedThrottleTorque(rpm(10000))).toBeCloseTo(-16, 9);
});
test('idle control holds the engine up below idle speed', () => {
  expect(engineTorque(rpm(1000), true, 0, true, false)).toBeGreaterThan(0);
  expect(engineTorque(rpm(3000), true, 0, true, false)).toBeLessThan(0);
});
test('start and stall', () => {
  expect(nextRunning(rpm(650), false, true)).toBe(true);
  expect(nextRunning(rpm(650), false, false)).toBe(false);
  expect(nextRunning(rpm(350), true, true)).toBe(false);
  expect(nextRunning(rpm(3000), true, false)).toBe(false);
  expect(engineTorque(0, false, 0, true, true)).toBeCloseTo(15, 9);
  expect(engineTorque(0, false, 1, true, false)).toBe(0);
});

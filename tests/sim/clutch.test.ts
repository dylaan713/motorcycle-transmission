import { test, expect } from 'vitest';
import { clutchCapacityMax, clutchCapacity, clutchDrag, clutchTorque } from '../../src/sim/clutch';

test('capacity', () => {
  expect(clutchCapacityMax).toBeCloseTo(200.448, 3);
  expect(clutchCapacity(0)).toBeCloseTo(clutchCapacityMax, 9);
  expect(clutchCapacity(0.35)).toBeCloseTo(clutchCapacityMax / 2, 9);
  expect(clutchCapacity(0.7)).toBe(0);
  expect(clutchCapacity(1)).toBe(0);
});
test('a locked clutch carries exactly the load, with no slip', () => {
  expect(clutchTorque(0, 80, 200)).toEqual({ torque: 80, locked: true });
});
test('a slipping clutch transmits exactly its capacity plus drag', () => {
  const r = clutchTorque(50, 300, 120);
  expect(r.locked).toBe(false);
  expect(r.torque).toBeCloseTo(120 + clutchDrag(50), 9);
  expect(clutchTorque(-50, -300, 120).torque).toBeCloseTo(-120 + clutchDrag(-50), 9);
});
test('an open clutch still drags', () => {
  expect(clutchTorque(60, 0, 0).torque).toBeCloseTo(0.24, 9);
  expect(clutchDrag(10000)).toBe(1.5);
});

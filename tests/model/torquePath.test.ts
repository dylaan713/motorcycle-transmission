import { test, expect } from 'vitest';
import { torquePath } from '../../src/model/torquePath';
import { PARTS } from '../../src/model/parts';
import { stateWith } from './helpers';

test('no torque, no path', () => {
  expect(torquePath(stateWith({ clutchTorque: 0.1 }))).toMatchObject({ parts: [], reach: 'none' });
});
test('neutral: the path stops at the input shaft', () => {
  const p = torquePath(stateWith({ clutchTorque: 1.2, lockedGear: null }));
  expect(p.reach).toBe('inputShaft');
  expect(p.parts.at(-1)).toBe('inputShaft');
});
test('in fourth the path runs through the fourth gear pair to the wheel', () => {
  const p = torquePath(stateWith({ clutchTorque: 80, lockedGear: 4, dogTorque: 110 }));
  expect(p.reach).toBe('wheel');
  expect(p.parts).toContain('gear4in');
  expect(p.parts).toContain('gear4out');
  expect(p.parts).not.toContain('gear3in');
  expect(p.parts.at(-1)).toBe('rearWheel');
  expect(p.torque).toBeGreaterThan(0);
});
test('engine braking reverses the sign, slipping is flagged', () => {
  expect(torquePath(stateWith({ clutchTorque: -12, lockedGear: 2, dogTorque: -20 })).torque).toBeLessThan(0);
  expect(torquePath(stateWith({ clutchTorque: 60, lockedGear: 1, dogTorque: 150, slip: 40, clutchLocked: false })).slipping).toBe(true);
});
test('every part has a name and a one-sentence role', () => {
  for (const p of Object.values(PARTS)) { expect(p.name.length).toBeGreaterThan(2); expect(p.role).toMatch(/\.$/); }
});
test('every part is keyed by its own id', () => {
  for (const [k, p] of Object.entries(PARTS)) expect(p.id).toBe(k);
});

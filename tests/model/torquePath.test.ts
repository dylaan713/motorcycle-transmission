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

// between the input and output shafts the torque passes the locked pair and the sliding gear whose
// dogs lock it; for fifth and sixth that is the half of the third-and-fourth piece facing the gear
const THROUGH_GEARS: Record<1 | 2 | 3 | 4 | 5 | 6, string[]> = {
  1: ['gear1in', 'gear1out', 'gear5out'],
  2: ['gear2in', 'gear2out', 'gear6out'],
  3: ['gear3in', 'gear3out', 'gear5out'],
  4: ['gear4in', 'gear4out', 'gear6out'],
  5: ['gear3in', 'gear5in', 'gear5out'],
  6: ['gear4in', 'gear6in', 'gear6out'],
};
for (const g of [1, 2, 3, 4, 5, 6] as const) {
  test(`in gear ${g} the path runs through the locked pair and the slider that locks it`, () => {
    const p = torquePath(stateWith({ clutchTorque: 80, lockedGear: g, dogTorque: 110 }));
    const from = p.parts.indexOf('inputShaft'), to = p.parts.indexOf('outputShaft');
    expect(p.parts.slice(from + 1, to)).toEqual(THROUGH_GEARS[g]);
  });
}

import { expect, test } from 'vitest';
import { PARTS, PART_GROUPS, type PartId } from '../../src/model/parts';
import { gearKind } from '../../src/model/geometry';

test('only a gear fixed to its shaft is described as fixed, and only first is cut into the shaft', () => {
  for (const g of [1, 2, 3, 4, 5, 6] as const) {
    for (const [end, shaft] of [['in', 'input'], ['out', 'output']] as const) {
      const role = PARTS[`gear${g}${end}`].role;
      if (/^Cut into/.test(role)) expect(`gear${g}${end}`).toBe('gear1in');
      if (/^Fixed/.test(role) || /^Cut into/.test(role)) expect(gearKind(shaft, g)).toBe('fixed');
    }
  }
  expect(PARTS.gear2in.role).toBe('Fixed on the end of the input shaft, it drives the second-gear pair whenever the input shaft turns.');
});

test('the pressure plate is lifted off the stack, as the release rod and lifter drawn push it', () => {
  expect(PARTS.pressurePlate.role).toContain('pulling the lever lifts it off the stack');
  expect(PARTS.pressurePlate.role).not.toContain('pulls it away');
});

test('every part is in exactly one group', () => {
  const listed: PartId[] = PART_GROUPS.flatMap((g) => g.parts);
  expect(new Set(listed).size).toBe(listed.length);
  expect([...listed].sort()).toEqual(Object.keys(PARTS).sort());
});

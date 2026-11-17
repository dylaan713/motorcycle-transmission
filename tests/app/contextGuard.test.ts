import { expect, test } from 'vitest';
import { createContextGuard } from '../../src/app/contextGuard';

test('losing the context shows the schematic and refuses 3D until it is back', () => {
  const g = createContextGuard();
  expect(g.request('3d')).toBe('3d');
  expect(g.lose('3d')).toBe('schematic');
  expect(g.lost).toBe(true);
  expect(g.request('3d')).toBeNull(); // the inset click or the toolbar cannot bring the dead canvas back
  expect(g.request('schematic')).toBe('schematic');
  expect(g.restore('schematic')).toBe('3d'); // 3D was main at the loss: back to it
  expect(g.lost).toBe(false);
  expect(g.request('3d')).toBe('3d');
});

test('a visitor who had chosen the schematic before the loss keeps it after the restore', () => {
  const g = createContextGuard();
  expect(g.lose('schematic')).toBe('schematic');
  expect(g.restore('schematic')).toBe('schematic');
});

test('a second loss event while lost keeps what was main at the first', () => {
  const g = createContextGuard();
  g.lose('3d'); g.lose('schematic');
  expect(g.restore('schematic')).toBe('3d');
  expect(g.restore('3d')).toBe('3d'); // a restore with nothing lost changes nothing
});

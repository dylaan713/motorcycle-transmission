import { expect, test } from 'vitest';
import { actionable, rovingIndex, TOOLS } from '../../src/ui/toolbar';

const key = (k: string, mods: Partial<{ altKey: boolean; ctrlKey: boolean; metaKey: boolean }> = {}) =>
  ({ key: k, altKey: false, ctrlKey: false, metaKey: false, ...mods });

test('roving focus moves over the shown buttons only, wrapping, with Home and End', () => {
  const shown = [true, true, false, true, false, true]; // e.g. a phone hides some
  expect(rovingIndex(key('ArrowRight'), shown, 1)).toBe(3);
  expect(rovingIndex(key('ArrowRight'), shown, 5)).toBe(0);
  expect(rovingIndex(key('ArrowLeft'), shown, 0)).toBe(5);
  expect(rovingIndex(key('ArrowLeft'), shown, 3)).toBe(1);
  expect(rovingIndex(key('Home'), shown, 5)).toBe(0);
  expect(rovingIndex(key('End'), shown, 0)).toBe(5);
  expect(rovingIndex(key('Enter'), shown, 1)).toBeNull();
  expect(rovingIndex(key('ArrowRight', { altKey: true }), shown, 1)).toBeNull();
});

test('camera buttons act only on the 3D view; the 3D view button and the inset toggle wait while 3D is unavailable', () => {
  const ids = TOOLS.map((t) => t.id);
  expect(ids).toEqual(['3d', 'schematic', 'inset', 'torque', 'labels', 'orbitLeft', 'orbitRight', 'zoomOut', 'zoomIn', 'reset']);
  const on3d = { view: '3d', available3d: true } as const;
  const onSchematic = { view: 'schematic', available3d: true } as const;
  const lost = { view: 'schematic', available3d: false } as const;
  for (const t of TOOLS) expect(actionable(t, on3d), t.id).toBe(true);
  for (const id of ['orbitLeft', 'orbitRight', 'zoomOut', 'zoomIn', 'reset', 'labels']) expect(actionable(TOOLS.find((t) => t.id === id)!, onSchematic), id).toBe(false);
  for (const id of ['3d', 'inset']) expect(actionable(TOOLS.find((t) => t.id === id)!, lost), id).toBe(false);
  for (const id of ['schematic', 'torque']) expect(actionable(TOOLS.find((t) => t.id === id)!, lost), id).toBe(true);
});

test('buttons with a key say so', () => {
  const keys = Object.fromEntries(TOOLS.filter((t) => t.keys).map((t) => [t.id, t.keys]));
  expect(keys).toEqual({ orbitLeft: 'Q', orbitRight: 'E', zoomOut: 'X', zoomIn: 'Z', reset: '0' });
});

import { expect, test } from 'vitest';
import { createStatusText } from '../../src/ui/status';

test('a notice stays until the next status change, and clear removes only its own text', () => {
  const s = createStatusText();
  s.notice('3D view paused; showing the schematic.');
  expect(s.text('running', false)).toBe('3D view paused; showing the schematic.');
  s.clear('something else');
  expect(s.text('running', false)).toBe('3D view paused; showing the schematic.');
  s.clear('3D view paused; showing the schematic.');
  expect(s.text('running', false)).toBe('');
});

test('a stall takes over the line, in the wording for the input in use, and ends the notice', () => {
  const s = createStatusText();
  s.notice('3D view unavailable on this device; showing the schematic.');
  expect(s.text('stalled', false)).toMatch(/press Enter/);
  expect(s.text('stalled', true)).toMatch(/press Start/);
  expect(s.text('running', false)).toBe('');
  expect(s.text('off', true)).toMatch(/Tap Ignition/);
});

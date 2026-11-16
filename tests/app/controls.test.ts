import { expect, test } from 'vitest';
import { createControls, type Controls } from '../../src/app/controls';

const hold = (c: Controls, seconds: number) => { for (let t = 0; t < seconds; t += 0.001) c.update(0.001); };
test('throttle ramps up while held and falls when released', () => {
  const c = createControls(); c.setKey('ArrowUp', true);
  hold(c, 0.2); expect(c.inputs().throttle).toBeCloseTo(0.5, 1);
  hold(c, 0.3); expect(c.inputs().throttle).toBe(1);
  c.setKey('ArrowUp', false); hold(c, 0.25); expect(c.inputs().throttle).toBe(0);
});
test('a quick pedal tap is a short stroke, a held key is a full one', () => {
  const c = createControls(); c.setKey('KeyW', true); hold(c, 0.04);
  expect(c.inputs().pedal).toBeGreaterThan(0.4); expect(c.inputs().pedal).toBeLessThan(0.6);
  hold(c, 0.1); expect(c.inputs().pedal).toBe(1);
  c.setKey('KeyW', false); hold(c, 0.1); expect(c.inputs().pedal).toBe(0);
  c.setKey('KeyS', true); hold(c, 0.2); expect(c.inputs().pedal).toBe(-1);
});
test('clutch pulls fast and feeds out slowly', () => {
  const c = createControls(); c.setKey('KeyC', true); hold(c, 0.13); expect(c.inputs().clutchLever).toBe(1);
  c.setKey('KeyC', false); hold(c, 0.3); expect(c.inputs().clutchLever).toBeCloseTo(0.5, 1);
});
test('pointer overrides keys until released; unknown keys are ignored', () => {
  const c = createControls(); c.setPointer('throttle', 0.33); c.setKey('ArrowUp', true); hold(c, 0.5);
  expect(c.inputs().throttle).toBe(0.33);
  c.setPointer('throttle', null); hold(c, 0.5); expect(c.inputs().throttle).toBe(1);
  expect(c.setKey('KeyQ', true)).toBe(false);
});
test('ignition toggles and starter holds', () => {
  const c = createControls(); expect(c.inputs().ignition).toBe(true);
  c.toggleIgnition(); expect(c.inputs().ignition).toBe(false);
  c.setStarter(true); expect(c.inputs().starter).toBe(true);
});

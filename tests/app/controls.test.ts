import { expect, test } from 'vitest';
import { createControls, type Controls } from '../../src/app/controls';
import { NEUTRAL_INPUTS } from '../../src/sim/types';

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
test('a released pointer springs back at the key ramp rate', () => {
  const c = createControls(); c.setPointer('clutchLever', 1); c.setPointer('clutchLever', null);
  hold(c, 0.3); expect(c.inputs().clutchLever).toBeCloseTo(0.5, 1);
});
test('releaseAll lets go of keys, pointers and the starter', () => {
  const c = createControls();
  c.setKey('ArrowUp', true); c.setKey('KeyC', true); c.setPointer('pedal', 1); c.setStarter(true); c.setKey('Enter', true);
  hold(c, 0.5); c.releaseAll();
  expect(c.inputs().starter).toBe(false);
  hold(c, 1); expect(c.inputs()).toMatchObject({ throttle: 0, clutchLever: 0, pedal: 0, brake: 0 });
});
test('the clutch key is C only', () => {
  expect(createControls().setKey('ShiftLeft', true)).toBe(false);
});
test('seeding takes over from the inputs in use, then each channel returns at its own rate', () => {
  const c = createControls();
  c.toggleIgnition();
  c.seed({ ...NEUTRAL_INPUTS, throttle: 0.8, clutchLever: 1, pedal: -0.5, brake: 0.4, ignition: true });
  expect(c.inputs()).toMatchObject({ throttle: 0.8, clutchLever: 1, pedal: -0.5, brake: 0.4, ignition: true, starter: false });
  hold(c, 0.3);
  expect(c.inputs()).toMatchObject({ throttle: 0, pedal: 0, brake: 0 });
  expect(c.inputs().clutchLever).toBeCloseTo(0.5, 1);
});

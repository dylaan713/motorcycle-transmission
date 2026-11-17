import { describe, expect, test } from 'vitest';
import { shouldHandleCameraKey, shouldHandleKey, type KeyTarget } from '../../src/app/keys';
import { CAMERA_KEYS, KEYMAP } from '../../src/app/controls';

const key = (code: string, mods: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean }> = {}) =>
  ({ code, metaKey: false, ctrlKey: false, altKey: false, ...mods });
const target = (t: Partial<KeyTarget> = {}): KeyTarget =>
  ({ tag: 'DIV', role: null, editable: false, inPanel: false, keyboardFocus: false, ...t });

describe('shouldHandleKey', () => {
  test('our keys on the page body are handled; others are not', () => {
    expect(shouldHandleKey(key('ArrowUp'), target({ tag: 'BODY' }))).toBe(true);
    expect(shouldHandleKey(key('KeyW'), null)).toBe(true);
    expect(shouldHandleKey(key('KeyQ'), target())).toBe(false);
  });
  test('Shift is not the clutch, so Shift+Tab moves focus', () => {
    expect(shouldHandleKey(key('ShiftLeft'), target())).toBe(false);
  });
  test('browser shortcuts pass through', () => {
    expect(shouldHandleKey(key('KeyR', { metaKey: true }), target())).toBe(false);
    expect(shouldHandleKey(key('KeyC', { ctrlKey: true }), target())).toBe(false);
    expect(shouldHandleKey(key('KeyW', { altKey: true }), target())).toBe(false);
  });
  test('typing in a form field passes through', () => {
    for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) expect(shouldHandleKey(key('KeyS'), target({ tag }))).toBe(false);
    expect(shouldHandleKey(key('KeyS'), target({ editable: true }))).toBe(false);
  });
  test('Enter activates a focused button, link or tab instead of the starter', () => {
    expect(shouldHandleKey(key('Enter'), target({ tag: 'BUTTON' }))).toBe(false);
    expect(shouldHandleKey(key('Enter'), target({ tag: 'A' }))).toBe(false);
    expect(shouldHandleKey(key('Enter'), target({ tag: 'SUMMARY' }))).toBe(false);
    for (const role of ['tab', 'button', 'link', 'switch', 'menuitem'])
      expect(shouldHandleKey(key('Enter'), target({ role }))).toBe(false);
    expect(shouldHandleKey(key('Enter'), target({ tag: 'BODY' }))).toBe(true);
    expect(shouldHandleKey(key('Enter'), target({ role: 'slider' }))).toBe(true);
    // other keys still reach the deck from a focused button
    expect(shouldHandleKey(key('KeyW'), target({ tag: 'BUTTON' }))).toBe(true);
  });
  test('arrow keys scroll the information panel when the keyboard put focus there', () => {
    expect(shouldHandleKey(key('ArrowUp'), target({ inPanel: true, keyboardFocus: true }))).toBe(false);
    expect(shouldHandleKey(key('ArrowDown'), target({ inPanel: true, role: 'tabpanel', keyboardFocus: true }))).toBe(false);
    expect(shouldHandleKey(key('KeyW'), target({ inPanel: true, keyboardFocus: true }))).toBe(true);
  });
  test('after a mouse click in the panel the arrow keys still ride', () => {
    // a click on the panel's text focuses the tabpanel, a click on a part focuses its button
    expect(shouldHandleKey(key('ArrowUp'), target({ inPanel: true, role: 'tabpanel' }))).toBe(true);
    expect(shouldHandleKey(key('ArrowDown'), target({ inPanel: true, tag: 'BUTTON' }))).toBe(true);
  });
});

describe('shouldHandleCameraKey', () => {
  test('Q, E, Z, X and 0 move the camera; the deck keys do not', () => {
    for (const code of ['KeyQ', 'KeyE', 'KeyZ', 'KeyX', 'Digit0']) expect(shouldHandleCameraKey(key(code), target())).toBe(true);
    for (const code of ['ArrowUp', 'KeyW', 'KeyC', 'Enter']) expect(shouldHandleCameraKey(key(code), target())).toBe(false);
  });
  test('camera keys are never deck keys, so they cannot take over the ride', () => {
    for (const code of Object.keys(CAMERA_KEYS)) {
      expect(Object.hasOwn(KEYMAP, code)).toBe(false);
      expect(shouldHandleKey(key(code), target())).toBe(false);
    }
  });
  test('ignored with a modifier held or while typing', () => {
    expect(shouldHandleCameraKey(key('KeyZ', { metaKey: true }), target())).toBe(false);
    expect(shouldHandleCameraKey(key('KeyX', { ctrlKey: true }), target())).toBe(false);
    expect(shouldHandleCameraKey(key('KeyQ', { altKey: true }), target())).toBe(false);
    for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) expect(shouldHandleCameraKey(key('KeyE'), target({ tag }))).toBe(false);
    expect(shouldHandleCameraKey(key('Digit0'), target({ editable: true }))).toBe(false);
    expect(shouldHandleCameraKey(key('KeyQ'), target({ tag: 'BUTTON' }))).toBe(true);
  });
});

import { describe, expect, test } from 'vitest';
import { shouldHandleKey, type KeyTarget } from '../../src/app/keys';

const key = (code: string, mods: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean }> = {}) =>
  ({ code, metaKey: false, ctrlKey: false, altKey: false, ...mods });
const target = (t: Partial<KeyTarget> = {}): KeyTarget =>
  ({ tag: 'DIV', role: null, editable: false, inPanel: false, ...t });

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
  test('arrow keys inside the information panel scroll it', () => {
    expect(shouldHandleKey(key('ArrowUp'), target({ inPanel: true }))).toBe(false);
    expect(shouldHandleKey(key('ArrowDown'), target({ inPanel: true }))).toBe(false);
    expect(shouldHandleKey(key('KeyW'), target({ inPanel: true }))).toBe(true);
  });
});

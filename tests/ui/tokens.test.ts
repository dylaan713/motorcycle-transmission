import { describe, expect, test } from 'vitest';
import { COLORS, contrast, applyTokens } from '../../src/ui/tokens';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../../src/ui/styles.css', import.meta.url), 'utf8');

const NAMES: Record<string, string> = {
  ground: '--ground', surface: '--surface', ink: '--ink', third: '--third', signal: '--signal',
  steel1: '--steel-1', steel2: '--steel-2', steel3: '--steel-3', steel4: '--steel-4', steel5: '--steel-5',
};

describe('tokens', () => {
  test('palette matches the design plan', () => {
    expect(COLORS).toMatchObject({ ground: '#14161A', surface: '#1E2228', ink: '#E8EAED', third: '#8F99A8', signal: '#FF6A1A' });
    expect(COLORS).toMatchObject({ steel1: '#2A3038', steel2: '#3A424D', steel3: '#566170' });
    expect(COLORS).toMatchObject({ steel4: '#7C8796', steel5: '#A9B4C2' });
  });
  test('every text pair passes 4.5', () => {
    for (const text of [COLORS.ink, COLORS.third, COLORS.signal])
      for (const bg of [COLORS.ground, COLORS.surface]) expect(contrast(text, bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(COLORS.ground, COLORS.signal)).toBeGreaterThanOrEqual(4.5);
  });
  test('ink on the steel fills under buttons and the current table row passes 4.5', () => {
    for (const bg of [COLORS.steel1, COLORS.steel2]) expect(contrast(COLORS.ink, bg)).toBeGreaterThanOrEqual(4.5);
  });
  test('ink on signal is banned for text', () => {
    expect(contrast(COLORS.ink, COLORS.signal)).toBeLessThan(4.5);
  });
  test('known ratio', () => {
    expect(contrast('#E8EAED', '#14161A')).toBeCloseTo(15.03, 1);
  });
  test('the :root block in styles.css matches COLORS exactly', () => {
    const block = /:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    const found: Record<string, string> = {};
    for (const m of block.matchAll(/(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) found[m[1]!] = m[2]!.toUpperCase();
    const expected: Record<string, string> = {};
    for (const [k, v] of Object.entries(COLORS)) expected[NAMES[k]!] = v.toUpperCase();
    expect(found).toEqual(expected);
  });
  test('no other hex literal in styles.css', () => {
    const rest = css.replace(/:root\s*\{[^}]*\}/, '');
    expect(rest).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
  test('applyTokens writes every colour as a custom property', () => {
    const set: Record<string, string> = {};
    applyTokens({ style: { setProperty: (k: string, v: string) => { set[k] = v; } } } as unknown as HTMLElement);
    for (const [k, v] of Object.entries(COLORS)) expect(set[NAMES[k]!]).toBe(v);
  });
});

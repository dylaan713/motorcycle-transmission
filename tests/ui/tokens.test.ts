import { describe, expect, test } from 'vitest';
import { COLORS, contrast, applyTokens, cssName } from '../../src/ui/tokens';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../../src/ui/styles.css', import.meta.url), 'utf8');
const rules = css.replace(/:root\s*\{[^}]*\}/, '');

const NAMES: Record<string, string> = {
  ground: '--ground', surface: '--surface', edge: '--edge', steel: '--steel',
  ink: '--ink', ink2: '--ink-2', ink3: '--ink-3', torque: '--torque',
  steel1: '--steel-1', steel2: '--steel-2', steel3: '--steel-3', steel4: '--steel-4', steel5: '--steel-5',
};
const TONES = ['steel1', 'steel2', 'steel3', 'steel4', 'steel5'] as const;

/** The declarations of every top-level rule whose selector list includes `selector`. */
const decls = (selector: string): string =>
  [...rules.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((m) => m[1]!.split(',').map((s) => s.trim()).includes(selector))
    .map((m) => m[2]).join(';');

describe('tokens', () => {
  test('the page roles match the instrument palette', () => {
    expect(COLORS).toMatchObject({
      ground: '#060708', surface: '#121519', edge: '#2A2F36', steel: '#5B636D',
      ink: '#F2F4F6', ink2: '#A3ACB7', ink3: '#7D8692', torque: '#FF7A1A',
    });
  });
  test('the old role names are gone', () => {
    expect(Object.keys(COLORS)).not.toContain('third');
    expect(Object.keys(COLORS)).not.toContain('signal');
  });
  test('every text colour passes 4.5 on ground and surface', () => {
    for (const text of [COLORS.ink, COLORS.ink2, COLORS.ink3])
      for (const bg of [COLORS.ground, COLORS.surface]) expect(contrast(text, bg)).toBeGreaterThanOrEqual(4.5);
  });
  test('ink-3 is banned on anything lighter than surface: it fails on edge and on a raised #1B1F24', () => {
    expect(contrast(COLORS.ink3, COLORS.edge)).toBeLessThan(4.5);
    expect(contrast(COLORS.ink3, '#1B1F24')).toBeLessThan(4.5);
  });
  test('ink and ink-2 pass 4.5 on the edge fill a held or current control sits on', () => {
    for (const text of [COLORS.ink, COLORS.ink2]) expect(contrast(text, COLORS.edge)).toBeGreaterThanOrEqual(4.5);
  });
  test('steel carries meaning as a non-text graphic: 3:1 on ground and on surface', () => {
    expect(contrast(COLORS.steel, COLORS.ground)).toBeGreaterThanOrEqual(3);
    expect(contrast(COLORS.steel, COLORS.surface)).toBeGreaterThanOrEqual(3);
  });
  test('edge is below 3:1, so it is a hairline only and never the sole cue for anything', () => {
    expect(contrast(COLORS.edge, COLORS.ground)).toBeLessThan(3);
  });
  test('torque reads as a graphic on ground (3:1) but ink on torque fails 4.5, and no rule sets torque as text', () => {
    expect(contrast(COLORS.torque, COLORS.ground)).toBeGreaterThanOrEqual(3);
    expect(contrast(COLORS.ink, COLORS.torque)).toBeLessThan(4.5);
    expect(rules).not.toMatch(/(?:^|[;{\s])color\s*:\s*var\(--torque\)/);
  });
  test('the part tones climb in brightness, stay cool, the darkest still clear of ground (1.5:1), and are never text', () => {
    for (let i = 1; i < TONES.length; i++) expect(contrast(COLORS[TONES[i]], COLORS.ground)).toBeGreaterThan(contrast(COLORS[TONES[i - 1]], COLORS.ground));
    for (const t of TONES) {
      const n = parseInt(COLORS[t].slice(1), 16);
      expect((n & 255) > (n >> 16 & 255), t).toBe(true); // blue over red: cool steel, the complement of torque
    }
    expect(contrast(COLORS.steel1, COLORS.ground)).toBeGreaterThanOrEqual(1.5);
    expect(rules).not.toMatch(/var\(--steel-[1-5]\)/); // the page never uses the part tones at all
  });
  test('known ratio', () => {
    expect(contrast('#F2F4F6', '#060708')).toBeCloseTo(18.29, 1);
  });
  test('css names: digits and ink levels take a hyphen', () => {
    expect(cssName('ink2')).toBe('--ink-2');
    expect(cssName('steel3')).toBe('--steel-3');
    expect(cssName('torque')).toBe('--torque');
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
    expect(rules).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
  test('applyTokens writes every colour as a custom property', () => {
    const set: Record<string, string> = {};
    applyTokens({ style: { setProperty: (k: string, v: string) => { set[k] = v; } } } as unknown as HTMLElement);
    for (const [k, v] of Object.entries(COLORS)) expect(set[NAMES[k]!]).toBe(v);
  });
});

describe('type: one family, three widths', () => {
  test('expanded bold for the title', () => {
    const d = decls('.type-expanded');
    expect(d).toMatch(/font-stretch:\s*var\(--wdth-expanded\)/);
    expect(css).toMatch(/--wdth-expanded:\s*118%;/);
    expect(d).toMatch(/font-weight:\s*700/);
  });
  test('condensed heavy italic with tabular figures for everything that moves', () => {
    const d = decls('.type-condensed');
    expect(d).toMatch(/font-style:\s*italic/);
    expect(d).toMatch(/font-weight:\s*(800|900)/);
    expect(d).toMatch(/font-variant-numeric:\s*tabular-nums/);
    expect(d).toMatch(/font-stretch:\s*var\(--wdth-condensed\)/);
    const w = Number(/--wdth-condensed:\s*(\d+)%/.exec(css)?.[1]); // readouts may tighten toward 62% later
    expect(w).toBeGreaterThanOrEqual(62);
    expect(w).toBeLessThanOrEqual(72);
  });
  test('normal width for body text', () => {
    expect(decls('.type-normal')).toMatch(/font-stretch:\s*100%/);
    expect(decls('body')).toMatch(/font-family:\s*var\(--font-text\)/);
  });
  test('only the latin width-axis faces of the family are loaded, roman and italic', () => {
    const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1]!);
    expect(faces).toHaveLength(2);
    for (const f of faces) {
      expect(f).toMatch(/font-family:\s*'Archivo Variable'/);
      expect(f).toMatch(/font-stretch:\s*62% 125%/);
      expect(f).toMatch(/archivo-latin-wdth-(normal|italic)\.woff2/);
    }
    expect(faces.map((f) => /font-style:\s*(\w+)/.exec(f)?.[1]).sort()).toEqual(['italic', 'normal']);
  });
});

describe('the one stacking order for the stage layers', () => {
  const ORDER = ['view', 'tach', 'callouts', 'readings', 'inset', 'toolbar', 'card', 'status', 'loader', 'drawer'];
  test('declared once in :root, bottom to top, each above the last', () => {
    const block = /:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    const z = ORDER.map((name) => Number(new RegExp(`--z-${name}:\\s*(\\d+)\\s*;`).exec(block)?.[1]));
    for (const v of z) expect(Number.isInteger(v)).toBe(true);
    for (let i = 1; i < z.length; i++) expect(z[i]).toBeGreaterThan(z[i - 1]!);
  });
  test('every z-index outside :root names a layer', () => {
    const uses = [...rules.matchAll(/z-index\s*:\s*([^;}]+)/g)].map((m) => m[1]!.trim());
    expect(uses.length).toBeGreaterThan(0);
    for (const u of uses) expect(u).toMatch(/^var\(--z-[a-z]+\)$/);
  });
});

describe('tachometer graphics reach 3:1 against what they sit on (white and steel, never torque)', () => {
  test('steel fill and ink-2 band hatch on the ground track, the ink needle on both', () => {
    expect(contrast(COLORS.steel, COLORS.ground)).toBeGreaterThanOrEqual(3); // fill on the track
    expect(contrast(COLORS.ink2, COLORS.ground)).toBeGreaterThanOrEqual(3); // band hatch and track outline
    expect(contrast(COLORS.ink, COLORS.ground)).toBeGreaterThanOrEqual(3); // needle on the track
    expect(contrast(COLORS.ink, COLORS.steel)).toBeGreaterThanOrEqual(3); // needle on the fill
  });
});

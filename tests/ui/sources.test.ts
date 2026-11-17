import { expect, test } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';

const SRC = new URL('../../src/', import.meta.url);
const files = readdirSync(SRC, { recursive: true })
  .map((f) => f.split('\\').join('/'))
  .filter((f) => /\.(ts|css|html)$/.test(f));
const read = (f: string): string => {
  const text = readFileSync(new URL(f, SRC), 'utf8');
  // the :root block of styles.css mirrors the tokens and is tested against them in tokens.test.ts
  return f === 'ui/styles.css' ? text.replace(/:root\s*\{[^}]*\}/, '') : text;
};

test('the scan sees the source tree', () => {
  expect(files).toContain('tokens.ts');
  expect(files).toContain('ui/styles.css');
  expect(files).toContain('view2d/draw/finalDrive.ts');
});

test('no hex colour literal outside the tokens module', () => {
  const HEX = /(?<![\w&])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b/;
  const offenders = files.filter((f) => f !== 'tokens.ts' && HEX.test(read(f)));
  expect(offenders).toEqual([]);
});

test('the torque colour is named only where torque is drawn', () => {
  // the token was called signal before stage 3b; neither name may appear anywhere else
  const ALLOWED = new Set(['tokens.ts', 'ui/tokens.ts', 'view2d/paint.ts', 'view2d/flow.ts', 'view2d/draw/finalDrive.ts']);
  const NAMED = /COLORS\.torque|--torque\b|signal/i;
  const offenders = files.filter((f) => !ALLOWED.has(f) && !f.startsWith('view3d/') && NAMED.test(read(f)));
  expect(offenders).toEqual([]);
});

test('the page has one stage, no permanent panel column and no old header readings', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  expect(html).toContain('class="topbar"');
  expect(html).not.toContain('app-header');
  expect(html).toMatch(/<section id="stage"[^>]*>/);
  expect(html).toMatch(/id="lessons"/);
  expect(read('ui/styles.css')).not.toMatch(/--panel-w|grid-template-areas:\s*'stage panel'/);
});

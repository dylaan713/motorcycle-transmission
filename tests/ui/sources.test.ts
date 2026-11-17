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

test('the signal colour is named only where torque is drawn', () => {
  const ALLOWED = new Set(['tokens.ts', 'ui/tokens.ts', 'view2d/paint.ts', 'view2d/flow.ts', 'view2d/draw/finalDrive.ts']);
  const offenders = files.filter((f) => !ALLOWED.has(f) && !f.startsWith('view3d/') && /signal/i.test(read(f)));
  expect(offenders).toEqual([]);
});

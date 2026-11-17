import { readdirSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

// Initial JavaScript is everything needed before the 3D chunk; the 3D chunk is any file whose
// name starts with view3d (vite.config.ts names it).
const BUDGETS = { initial: 60, '3D chunk': 220 }; // kB gzip
const dir = 'dist/assets';
let files;
try {
  files = readdirSync(dir).filter((f) => f.endsWith('.js'));
} catch {
  console.error('dist/assets not found: run npm run build first');
  process.exit(1);
}
const totals = { initial: 0, '3D chunk': 0 };
for (const f of files) {
  const kb = gzipSync(readFileSync(join(dir, f))).length / 1000;
  const group = f.startsWith('view3d') ? '3D chunk' : 'initial';
  totals[group] += kb;
  console.log(`${f}  ${kb.toFixed(2)} kB gzip  (${group})`);
}
let over = false;
for (const [group, kb] of Object.entries(totals)) {
  const limit = BUDGETS[group];
  console.log(`${group}  ${kb.toFixed(2)} kB gzip (limit ${limit})`);
  if (kb > limit) { over = true; console.error(`${group} is over its ${limit} kB budget`); }
}
if (totals['3D chunk'] === 0) { over = true; console.error('no view3d chunk found: check vite.config.ts'); }
if (over) process.exit(1);

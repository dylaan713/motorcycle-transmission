import { readdirSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const LIMIT_KB = 60;
const dir = 'dist/assets';
let files;
try {
  files = readdirSync(dir).filter((f) => f.endsWith('.js'));
} catch {
  console.error('dist/assets not found: run npm run build first');
  process.exit(1);
}
let total = 0;
for (const f of files) {
  const kb = gzipSync(readFileSync(join(dir, f))).length / 1000;
  total += kb;
  console.log(`${f}  ${kb.toFixed(2)} kB gzip`);
}
console.log(`total  ${total.toFixed(2)} kB gzip (limit ${LIMIT_KB})`);
if (total > LIMIT_KB) process.exit(1);

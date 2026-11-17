import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { ORDINAL } from '../../src/model/parts';
import { gearRatio, overallRatio } from '../../src/sim/kinematics';
import { PARAMS } from '../../src/sim/params';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const noscript = /<noscript>([\s\S]*?)<\/noscript>/.exec(html)?.[1] ?? '';

test('the no-JavaScript ratio table carries the simulation figures, teeth driver:driven', () => {
  const rows = [...noscript.matchAll(/<tr><th scope="row">([^<]+)<\/th><td>([^<]+)<\/td><td>([^<]+)<\/td><td>([^<]+)<\/td><\/tr>/g)];
  expect(rows).toHaveLength(6);
  rows.forEach((m, i) => {
    const g = (i + 1) as 1 | 2 | 3 | 4 | 5 | 6;
    const [driver, driven] = PARAMS.gears[g];
    expect(m.slice(1)).toEqual([ORDINAL[g].short, `${driver}:${driven}`, gearRatio(g).toFixed(3), overallRatio(g).toFixed(2)]);
  });
});

test('the no-JavaScript note names the primary drive and chain driver:driven', () => {
  expect(noscript).toContain(`primary drive (${PARAMS.primary.drive}:${PARAMS.primary.driven} teeth)`);
  expect(noscript).toContain(`chain (${PARAMS.final.front}:${PARAMS.final.rear} teeth)`);
  expect(noscript).toContain('representative of a middleweight sport bike');
});

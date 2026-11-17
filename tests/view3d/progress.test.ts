import { expect, test } from 'vitest';
import { afterChunk, buildProgress } from '../../src/view3d/load';

test('loader progress only climbs, counts the renderer as the last step, and says Ready only at 100%', () => {
  const seen: [number, string][] = [];
  const outer = (d: number, t: number, l: string) => seen.push([d / t, l]);
  outer(0, 1, 'Loading 3D view'); // load3d's own first report
  const p = buildProgress(afterChunk(outer), 6);
  p.start();
  for (let k = 1; k <= 6; k++) p.build(k, 6, `step ${k}`);
  p.renderer();
  p.ready();
  for (let i = 1; i < seen.length; i++) expect(seen[i][0], `${seen[i][1]}`).toBeGreaterThanOrEqual(seen[i - 1][0]);
  expect(seen.at(-1)).toEqual([1, 'Ready']);
  expect(seen.filter(([f]) => f === 1).map(([, l]) => l)).toEqual(['Ready']);
  const renderer = seen.find(([, l]) => l === 'Starting the renderer')!;
  expect(renderer[0]).toBeLessThan(1);
});

test('a build reporting its own total is rescaled onto the one fixed total', () => {
  const seen: number[] = [];
  const p = buildProgress((d, t) => seen.push(d / t), 6);
  p.build(3, 6, 'x');
  expect(seen[0]).toBeCloseTo(3 / 7, 12);
});

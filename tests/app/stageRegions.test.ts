import { expect, test } from 'vitest';
import { CLUSTER_MAX_H, CLUSTER_W, EDGE, stageRegions, type Region } from '../../src/app/stageRegions';

const overlap = (a: Region, b: Region): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (r: Region, w: number, h: number): boolean => r.x >= 0 && r.y >= 0 && r.x + r.w <= w + 1e-9 && r.y + r.h <= h + 1e-9;

test('wide: the cluster sits in the top-right corner and the part card under it, above the toolbar band', () => {
  const r = stageRegions(1080, 712, { wide: true, partCard: true, inset: true, toolbar: true });
  expect(r.cluster).toEqual({ x: 1080 - EDGE - CLUSTER_W, y: EDGE, w: CLUSTER_W, h: CLUSTER_MAX_H });
  expect(r.partCard!.x).toBe(r.cluster.x);
  expect(r.partCard!.w).toBe(CLUSTER_W);
  expect(r.partCard!.y).toBeGreaterThan(r.cluster.y + r.cluster.h);
  expect(r.partCard!.y + r.partCard!.h).toBe(r.toolbar!.y - EDGE);
  const all = [r.cluster, r.partCard!, r.inset!, r.toolbar!];
  for (const a of all) expect(inside(a, 1080, 712)).toBe(true);
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    if (all[j] === r.toolbar) continue; // the inset stands in the toolbar band's left end, as drawn
    expect(overlap(all[i], all[j])).toBe(false);
  }
});

test('regions not on the stage are null', () => {
  const r = stageRegions(1080, 712, { wide: true, partCard: false, inset: false, toolbar: false });
  expect(r.partCard).toBeNull(); expect(r.inset).toBeNull(); expect(r.toolbar).toBeNull();
});

test('narrow: the cluster is a strip across the top and the part card a strip above the toolbar, no inset', () => {
  const r = stageRegions(390, 330, { wide: false, partCard: true, inset: true, toolbar: true });
  expect(r.cluster.x).toBe(0); expect(r.cluster.y).toBe(0); expect(r.cluster.w).toBe(390);
  expect(r.inset).toBeNull();
  expect(r.partCard!.w).toBe(390);
  expect(r.partCard!.y + r.partCard!.h).toBe(r.toolbar!.y);
  expect(overlap(r.cluster, r.partCard!)).toBe(false);
});

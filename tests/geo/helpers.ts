import { expect } from 'vitest';
import type { BufferGeometry } from 'three';

/** Distance of every vertex from the x axis. */
export const radii = (g: BufferGeometry): number[] => {
  const p = g.getAttribute('position');
  const out: number[] = [];
  for (let i = 0; i < p.count; i++) out.push(Math.hypot(p.getY(i), p.getZ(i)));
  return out;
};

export const triangleCount = (g: BufferGeometry): number => g.getAttribute('position').count / 3;

const key = (x: number, y: number, z: number): string =>
  `${Math.round(x * 1e7)},${Math.round(y * 1e7)},${Math.round(z * 1e7)}`;

/**
 * The generic quality check every generator must pass: non-indexed triangles, finite positions,
 * unit normals that agree with the winding, no degenerate triangles, closed (every directed edge
 * has its reverse) and outward-facing (positive enclosed volume).
 */
export function expectCleanSolid(g: BufferGeometry, name: string): void {
  expect(g.index, name).toBeNull();
  const p = g.getAttribute('position');
  const n = g.getAttribute('normal');
  expect(n, name).toBeDefined();
  expect(p.count % 3, name).toBe(0);
  expect(p.count, name).toBeGreaterThanOrEqual(3);
  expect(n.count, name).toBe(p.count);
  const edges = new Map<string, number>();
  let volume = 0, badNormals = 0, degenerate = 0, nonFinite = 0;
  for (let t = 0; t < p.count; t += 3) {
    const v = [0, 1, 2].map((k) => [p.getX(t + k), p.getY(t + k), p.getZ(t + k)]);
    if (!v.flat().every(Number.isFinite)) { nonFinite++; continue; }
    const [a, b, c] = v;
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cr = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const len = Math.hypot(cr[0], cr[1], cr[2]);
    if (len / 2 < 1e-12) degenerate++;
    volume += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0])
      + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    for (let k = 0; k < 3; k++) {
      const nx = n.getX(t + k), ny = n.getY(t + k), nz = n.getZ(t + k);
      const nl = Math.hypot(nx, ny, nz);
      if (!(Math.abs(nl - 1) < 1e-4) || (nx * cr[0] + ny * cr[1] + nz * cr[2]) / (len || 1) <= 0) badNormals++;
    }
    const ks = v.map(([x, y, z]) => key(x, y, z));
    for (let k = 0; k < 3; k++) {
      const e = `${ks[k]}|${ks[(k + 1) % 3]}`;
      edges.set(e, (edges.get(e) ?? 0) + 1);
    }
  }
  let open = 0;
  for (const [e, count] of edges) {
    const [from, to] = e.split('|');
    if ((edges.get(`${to}|${from}`) ?? 0) !== count) open++;
  }
  expect(nonFinite, `${name}: non-finite positions`).toBe(0);
  expect(degenerate, `${name}: degenerate triangles`).toBe(0);
  expect(badNormals, `${name}: normals not unit or against the winding`).toBe(0);
  expect(open, `${name}: unmatched edges`).toBe(0);
  expect(volume, `${name}: enclosed volume`).toBeGreaterThan(0);
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  expect([bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z].every(Number.isFinite), name).toBe(true);
}

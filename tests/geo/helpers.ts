import { expect } from 'vitest';
import type { BufferGeometry } from 'three';

/** Distance of every vertex from the x axis. */
export const radii = (g: BufferGeometry): number[] => {
  const p = g.getAttribute('position');
  const out: number[] = [];
  for (let i = 0; i < p.count; i++) out.push(Math.hypot(p.getY(i), p.getZ(i)));
  return out;
};

type P = [number, number];
const inside = (pt: P, poly: P[]): boolean => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const toBoundary = (p: P, poly: P[]): number => {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
    d = Math.min(d, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy));
  }
  return d;
};

/**
 * Deepest overlap, m, between two gear outlines in mesh, swept through one tooth pitch of gear A.
 * A sits at the origin turned by a; B's centre is `centreDistance` away at angle psi, turned by
 * phase - a × zA / zB (meshing gears counter-rotate). Outlines are in the shared angle convention:
 * a point (u, v) is (y, z), angle measured from +y toward +z. Edges are densified 4× and only
 * points near the pitch point are tested.
 */
export function meshPenetration(
  profileA: { x: number; y: number }[], zA: number, profileB: { x: number; y: number }[], zB: number,
  centreDistance: number, psi: number, phase: number, steps = 40,
): number {
  const cy = centreDistance * Math.cos(psi), cz = centreDistance * Math.sin(psi);
  const rA = (centreDistance * zA) / (zA + zB);
  const pitchPoint: P = [rA * Math.cos(psi), rA * Math.sin(psi)];
  const module = (2 * rA) / zA;
  const reach = 4 * module; // the contact zone: four modules round the pitch point
  const place = (pts: { x: number; y: number }[], rot: number, oy: number, oz: number): P[] =>
    pts.map((p) => [p.x * Math.cos(rot) - p.y * Math.sin(rot) + oy, p.x * Math.sin(rot) + p.y * Math.cos(rot) + oz]);
  const dense = (poly: P[]): P[] => poly.flatMap((p, i) => {
    const q = poly[(i + 1) % poly.length];
    return [0, 1, 2, 3].map((k) => [p[0] + ((q[0] - p[0]) * k) / 4, p[1] + ((q[1] - p[1]) * k) / 4] as P);
  });
  const near = (p: P): boolean => Math.hypot(p[0] - pitchPoint[0], p[1] - pitchPoint[1]) < reach;
  let worst = 0;
  for (let k = 0; k < steps; k++) {
    const a = ((2 * Math.PI) / zA) * (k / steps);
    const A = place(profileA, a, 0, 0);
    const B = place(profileB, phase - (a * zA) / zB, cy, cz);
    for (const p of dense(B).filter(near)) if (inside(p, A)) worst = Math.max(worst, toBoundary(p, A));
    for (const p of dense(A).filter(near)) if (inside(p, B)) worst = Math.max(worst, toBoundary(p, B));
  }
  return worst;
}

export const triangleCount =(g: BufferGeometry): number => g.getAttribute('position').count / 3;

const key = (x: number, y: number, z: number): string =>
  `${Math.round(x * 1e7)},${Math.round(y * 1e7)},${Math.round(z * 1e7)}`;

/**
 * Pairs of triangles that lie in the same plane, face the same way and overlap in area: coincident
 * faces from overlapping solids, which z-fight when drawn. Touching along an edge is not overlap.
 */
export function coplanarOverlaps(g: BufferGeometry): number {
  const p = g.getAttribute('position');
  const groups = new Map<string, number[][][]>();
  for (let t = 0; t < p.count; t += 3) {
    const v = [0, 1, 2].map((k) => [p.getX(t + k), p.getY(t + k), p.getZ(t + k)]);
    const u = [0, 1, 2].map((i) => v[1][i] - v[0][i]), w = [0, 1, 2].map((i) => v[2][i] - v[0][i]);
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const l = Math.hypot(n[0], n[1], n[2]);
    const nu = n.map((c) => c / l);
    const d = nu[0] * v[0][0] + nu[1] * v[0][1] + nu[2] * v[0][2];
    // project onto the two axes the normal is least aligned with
    const drop = [0, 1, 2].reduce((m, i) => (Math.abs(nu[i]) > Math.abs(nu[m]) ? i : m), 0);
    const [i1, i2] = [0, 1, 2].filter((i) => i !== drop);
    const k = `${nu.map((c) => Math.round(c * 1e4)).join(',')}|${Math.round(d * 1e6)}`;
    const tri = v.map((q) => [q[i1], q[i2]]);
    const list = groups.get(k); if (list) list.push(tri); else groups.set(k, [tri]);
  }
  const EPS = 1e-8;
  const separated = (a: number[][], b: number[][]): boolean => {
    for (const tri of [a, b]) {
      for (let e = 0; e < 3; e++) {
        const q = tri[e], r = tri[(e + 1) % 3];
        const ax = [r[1] - q[1], q[0] - r[0]]; const al = Math.hypot(ax[0], ax[1]);
        const proj = (pts: number[][]) => pts.map((pt) => (pt[0] * ax[0] + pt[1] * ax[1]) / al);
        const pa = proj(a), pb = proj(b);
        if (Math.max(...pa) <= Math.min(...pb) + EPS || Math.max(...pb) <= Math.min(...pa) + EPS) return true;
      }
    }
    return false;
  };
  let overlaps = 0;
  for (const tris of groups.values()) {
    if (tris.length < 2) continue;
    const boxes = tris.map((t) => [Math.min(t[0][0], t[1][0], t[2][0]), Math.max(t[0][0], t[1][0], t[2][0]),
      Math.min(t[0][1], t[1][1], t[2][1]), Math.max(t[0][1], t[1][1], t[2][1])]);
    for (let i = 0; i < tris.length; i++) for (let j = i + 1; j < tris.length; j++) {
      const A = boxes[i], B = boxes[j];
      if (A[1] <= B[0] + EPS || B[1] <= A[0] + EPS || A[3] <= B[2] + EPS || B[3] <= A[2] + EPS) continue;
      if (!separated(tris[i], tris[j])) overlaps++;
    }
  }
  return overlaps;
}

/**
 * The generic quality check every generator must pass: non-indexed triangles, finite positions,
 * unit normals that agree with the winding, no degenerate triangles, closed (every directed edge
 * has its reverse), outward-facing (positive enclosed volume) and free of coincident faces.
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
  expect(coplanarOverlaps(g), `${name}: coincident same-facing faces`).toBe(0);
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  expect([bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z].every(Number.isFinite), name).toBe(true);
}

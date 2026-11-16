import { test, expect } from 'vitest';
import { chainLink, chainLinkCount, chainPath, rearWheel } from '../../src/geo/finalDrive';
import { expectCleanSolid, triangleCount } from './helpers';

const DRIVE = { frontRadius: 0.0407, rearRadius: 0.1138, centreDistance: 0.56 };

test('chain path is a closed belt and the link count is even', () => {
  const p = chainPath({ frontRadius: 0.0407, rearRadius: 0.1138, centreDistance: 0.56 });
  expect(p.length).toBeGreaterThan(2 * 0.56); expect(p.length).toBeLessThan(2 * 0.56 + 2 * Math.PI * 0.1138);
  const a = p.pointAt(0), b = p.pointAt(p.length); expect(b.y).toBeCloseTo(a.y, 9); expect(b.z).toBeCloseTo(a.z, 9);
  expect(chainLinkCount(p.length, 0.015875) % 2).toBe(0);
});

test('chain path: open-belt length, continuous, tangent matches the direction of travel', () => {
  const { frontRadius: rf, rearRadius: rr, centreDistance: d } = DRIVE;
  const p = chainPath(DRIVE);
  const beta = Math.asin((rr - rf) / d);
  expect(p.length).toBeCloseTo(2 * d * Math.cos(beta) + rf * (Math.PI - 2 * beta) + rr * (Math.PI + 2 * beta), 12);
  const n = 2000, ds = p.length / n;
  for (let i = 0; i < n; i++) {
    const a = p.pointAt(i * ds), b = p.pointAt((i + 1) * ds);
    const step = Math.hypot(b.y - a.y, b.z - a.z);
    expect(step).toBeGreaterThan(ds * 0.999); expect(step).toBeLessThanOrEqual(ds + 1e-12);
    const mid = p.pointAt((i + 0.5) * ds);
    const dir = Math.atan2(b.z - a.z, b.y - a.y);
    expect(Math.abs(Math.atan2(Math.sin(mid.tangent - dir), Math.cos(mid.tangent - dir)))).toBeLessThan(1e-3);
  }
  expect(p.pointAt(-ds).z).toBeCloseTo(p.pointAt(p.length - ds).z, 9);
});

test('chain path: s = 0 where the top run meets the front sprocket, top run moving forward', () => {
  const p = chainPath(DRIVE);
  const s0 = p.pointAt(0);
  expect(Math.hypot(s0.y, s0.z)).toBeCloseTo(DRIVE.frontRadius, 12);
  expect(s0.y).toBeGreaterThan(0);
  const beta = Math.asin((DRIVE.rearRadius - DRIVE.frontRadius) / DRIVE.centreDistance);
  expect(s0.tangent).toBeCloseTo(Math.PI / 2 + beta, 9); // along the top run, toward +z and slightly down
  const top = p.pointAt(-0.2); // 0.2 m back along the top run
  expect(top.y).toBeGreaterThan(0); expect(top.z).toBeLessThan(0); expect(Math.sin(top.tangent)).toBeGreaterThan(0.99);
  const bottom = p.pointAt(0.2 + DRIVE.frontRadius * Math.PI); // past the front sprocket, on the bottom run
  expect(bottom.y).toBeLessThan(0); expect(Math.sin(bottom.tangent)).toBeLessThan(-0.99);
  const behind = p.pointAt(p.length / 2 + 0.1);
  expect(Math.hypot(behind.y, behind.z + DRIVE.centreDistance)).toBeCloseTo(DRIVE.rearRadius, 9);
});

test('a chain link spans one pitch with its roller at the origin', () => {
  for (const inner of [true, false]) {
    const g = chainLink(inner); g.computeBoundingBox();
    expect(g.boundingBox!.max.x - g.boundingBox!.min.x).toBeLessThanOrEqual(0.016 + 1e-9);
    expect(g.boundingBox!.max.y).toBeCloseTo(0.015875 + 0.006, 9);
    expect(g.boundingBox!.min.y).toBeCloseTo(-0.006, 9);
    expect(triangleCount(g)).toBeLessThan(300);
  }
});

test('the rear wheel is tyre, rim and hub of the stated size', () => {
  const [tyre, rim, hub] = rearWheel();
  tyre.computeBoundingBox(); rim.computeBoundingBox(); hub.computeBoundingBox();
  expect(tyre.boundingBox!.max.y).toBeCloseTo(0.31, 6);
  expect(tyre.boundingBox!.max.x - tyre.boundingBox!.min.x).toBeCloseTo(0.14, 6);
  expect(rim.boundingBox!.max.y).toBeLessThan(0.31 - 0.09 + 0.01);
  expect(hub.boundingBox!.max.y).toBeCloseTo(0.04, 6);
});

test('every generator in this file builds a clean closed solid', () => {
  expectCleanSolid(chainLink(true), 'inner link'); expectCleanSolid(chainLink(false), 'outer link');
  rearWheel().forEach((g, i) => expectCleanSolid(g, ['tyre', 'rim', 'hub'][i]));
});

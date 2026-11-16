import { test, expect } from 'vitest';
import type * as THREE from 'three';
import {
  CLUTCH, clutchBasket, clutchHub, clutchSpring, frictionPlate, hubEnd, plateStackOffsets, pressurePlate, springLength, steelPlate,
} from '../../src/geo/clutch';
import { DIM } from '../../src/geo/dimensions';
import { expectCleanSolid, radii } from './helpers';

const vertices = (g: THREE.BufferGeometry): { x: number; r: number; a: number }[] => {
  const p = g.getAttribute('position'); const out = [];
  for (let i = 0; i < p.count; i++) out.push({ x: p.getX(i), r: Math.hypot(p.getY(i), p.getZ(i)), a: Math.atan2(p.getZ(i), p.getY(i)) });
  return out;
};
/** Angular distance from a to the nearest multiple of `pitch` plus `offset`. */
const offPitch = (a: number, pitch: number, offset = 0): number => {
  const w = ((((a - offset) % pitch) + pitch) % pitch);
  return Math.min(w, pitch - w);
};

test('plate stack closes solid and opens by the gap', () => {
  const closed = plateStackOffsets(0), open = plateStackOffsets(1); const pitch = 0.003 + 0.0016;
  expect(closed.friction.length).toBe(8); expect(closed.steel.length).toBe(7);
  expect(closed.steel[0] - closed.friction[0]).toBeCloseTo(pitch / 2, 9);
  expect(open.steel[0] - open.friction[0]).toBeCloseTo(pitch / 2 + 0.0006, 9);
  expect(open.pressurePlate - closed.pressurePlate).toBeCloseTo(15 * 0.0006, 9);
});

test('friction plate tabs reach the basket, steel plates do not', () => {
  const r = (g: THREE.BufferGeometry) => { g.computeBoundingSphere(); return g.boundingSphere!.radius; };
  expect(r(frictionPlate())).toBeGreaterThan(0.070); expect(r(frictionPlate())).toBeLessThanOrEqual(0.078);
  expect(r(steelPlate())).toBeLessThanOrEqual(0.0701);
});

test('the stack starts on the hub back wall and the pressure plate sits on the last friction plate', () => {
  const s = plateStackOffsets(0);
  expect(s.friction[0] - 0.0015).toBeCloseTo(CLUTCH.hubFace, 9);
  expect(s.pressurePlate - (s.friction[7] + 0.0015)).toBeCloseTo(0, 9);
  expect(plateStackOffsets(-1)).toEqual(s);
  expect(plateStackOffsets(2)).toEqual(plateStackOffsets(1));
});

test('friction tabs sit in the basket slots and steel teeth in the hub grooves', () => {
  const pitch12 = Math.PI / 6;
  const basket = vertices(clutchBasket()).filter((v) => v.x > CLUTCH.fingerBase + 1e-6);
  const tabs = vertices(frictionPlate()).filter((v) => v.r > 0.0701);
  // every tab vertex is nearer its slot centre than any finger vertex at the same radius band
  const tabHalf = Math.max(...tabs.map((v) => offPitch(v.a, pitch12)));
  const fingerEdge = Math.min(...basket.filter((v) => v.r > 0.071).map((v) => offPitch(v.a, pitch12)));
  expect(tabHalf).toBeLessThan(fingerEdge);
  expect(Math.max(...tabs.map((v) => v.r))).toBeLessThan(0.078);
  const pitch18 = (2 * Math.PI) / 18;
  const teeth = vertices(steelPlate()).filter((v) => v.r < 0.0449);
  const hubTips = vertices(clutchHub()).filter((v) => v.r > 0.0425 && v.r < 0.0441);
  const teethHalf = Math.max(...teeth.map((v) => offPitch(v.a, pitch18, pitch18 / 2)));
  const grooveHalf = Math.min(...hubTips.map((v) => offPitch(v.a, pitch18, pitch18 / 2)));
  expect(teethHalf).toBeLessThan(grooveHalf);
  expect(Math.min(...teeth.map((v) => v.r))).toBeGreaterThan(0.041);
});

test('the basket carries the 76-tooth primary ring on its back and opens toward +x', () => {
  const g = clutchBasket(); g.computeBoundingBox();
  expect(Math.max(...radii(g))).toBeCloseTo((76 * 0.0025) / 2 + 0.0025, 6);
  expect(g.boundingBox!.min.x).toBeCloseTo(-0.016, 8);
  expect(g.boundingBox!.max.x).toBeCloseTo(CLUTCH.fingerBase + 0.046, 8);
});

test('springs span their length and fit between the pressure plate and the seat', () => {
  const g = clutchSpring(0.02); g.computeBoundingBox();
  expect(g.boundingBox!.min.x).toBeCloseTo(0, 5); expect(g.boundingBox!.max.x).toBeCloseTo(0.02, 5);
  expect(springLength(plateStackOffsets(0).pressurePlate) - springLength(plateStackOffsets(1).pressurePlate)).toBeCloseTo(15 * 0.0006, 9);
  expect(springLength(plateStackOffsets(1).pressurePlate)).toBeGreaterThan(CLUTCH.springSolidLength);
});

test('hub and pressure plate never intersect, engaged or fully released', () => {
  const hub = vertices(clutchHub()), plate = vertices(pressurePlate());
  const posts = Array.from({ length: 5 }, (_, k) => (2 * Math.PI * k) / 5)
    .map((a) => [CLUTCH.springPitchRadius * Math.cos(a), CLUTCH.springPitchRadius * Math.sin(a)]);
  const p = pressurePlate().getAttribute('position');
  // the splined drum: the hub forward of its back wall, outside the posts and washers
  const hubBody = hub.filter((v) => v.x > CLUTCH.hubFace + 1e-6 && v.r > CLUTCH.springPitchRadius + 0.0115);
  const hubRadius = Math.max(...hubBody.map((v) => v.r));
  for (const sep of [0, 1]) {
    const x = plateStackOffsets(sep).pressurePlate;
    // within the hub's radius the plate is only its cover, which must start beyond the hub's end
    const coverStart = Math.min(...plate.filter((v) => v.r <= hubRadius + 1e-9).map((v) => v.x)) + x;
    expect(Math.max(...hubBody.map((v) => v.x)), `separation ${sep}`).toBeLessThan(coverStart);
    // where the plate reaches below the cover, it stays outside the hub's radius
    const ring = plate.filter((v) => v.x + x < hubEnd() + 1e-9);
    expect(Math.min(...ring.map((v) => v.r)), `separation ${sep}`).toBeGreaterThan(hubRadius);
    // the washers are clear of the spring face
    expect(CLUTCH.springSeat, `separation ${sep}`).toBeGreaterThan(x + CLUTCH.springFace + CLUTCH.springSolidLength);
  }
  // the posts pass through the cover's holes without touching it
  for (let i = 0; i < p.count; i++) {
    const d = Math.min(...posts.map(([y, z]) => Math.hypot(p.getY(i) - y, p.getZ(i) - z)));
    expect(d).toBeGreaterThan(DIM.clutchHub.postRadius);
  }
  expect(hubEnd()).toBeCloseTo(plateStackOffsets(0).pressurePlate + DIM.pressurePlate.cover - DIM.clutchHub.endClearance, 12);
});

test('every generator in this file builds a clean closed solid', () => {
  const all: [string, THREE.BufferGeometry][] = [
    ['basket', clutchBasket()], ['friction', frictionPlate()], ['steel', steelPlate()], ['hub', clutchHub()],
    ['pressure plate', pressurePlate()], ['spring', clutchSpring(0.02)],
  ];
  for (const [name, g] of all) expectCleanSolid(g, name);
});

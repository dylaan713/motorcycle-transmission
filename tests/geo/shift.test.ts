import { test, expect } from 'vitest';
import type * as THREE from 'three';
import { SLIDER_TRAVEL } from '../../src/model/geometry';
import { deg } from '../../src/sim/units';
import {
  DETENT_ARM, FORK_PIN_REACH, STAR_SEAT_RADIUS, detentArm, grooveAxialOffset, pedalLever, shiftDrum, shiftFork, shiftPawl, starWheel, starWheelRadiusAt,
} from '../../src/geo/shift';
import { expectCleanSolid } from './helpers';

test('drum grooves sit where the forks are commanded', () => {
  expect(grooveAxialOffset('A', deg(0))).toBeCloseTo(-SLIDER_TRAVEL, 9);
  expect(grooveAxialOffset('A', deg(120))).toBeCloseTo(SLIDER_TRAVEL, 9);
  expect(grooveAxialOffset('B', deg(90))).toBe(0);
  const g = shiftDrum(0.12, { A: -0.03, B: 0.0, C: 0.03 }); const p = g.getAttribute('position'); let grooved = 0;
  for (let i = 0; i < p.count; i++) if (Math.hypot(p.getY(i), p.getZ(i)) < 0.022 - 0.0039) grooved++;
  expect(grooved).toBeGreaterThan(100);
});

test('star wheel has seven notches and neutral is the shallow one', () => {
  expect(starWheelRadiusAt(deg(120))).toBeCloseTo(0.020 - 0.003, 6);
  expect(starWheelRadiusAt(deg(30))).toBeCloseTo(0.020 - 0.0015, 6);
  expect(starWheelRadiusAt(deg(90))).toBeCloseTo(0.020, 6);
});

test('every groove-floor vertex lies in its groove at the commanded offset', () => {
  const centres = { A: -0.03, B: 0.0, C: 0.03 } as const;
  const g = shiftDrum(0.12, centres); const p = g.getAttribute('position');
  let floor = 0;
  for (let i = 0; i < p.count; i++) {
    const r = Math.hypot(p.getY(i), p.getZ(i));
    expect(r).toBeGreaterThan(0.018 - 1e-7);
    if (r > 0.022 - 0.0039) continue;
    floor++;
    expect(r).toBeCloseTo(0.018, 6);
    const a = Math.atan2(p.getZ(i), p.getY(i)), x = p.getX(i);
    const drum = a < deg(-15) ? a + 2 * Math.PI : a; // the surface angle is the drum angle
    const inGroove = (['A', 'B', 'C'] as const).some((s) => {
      const used = Math.min(Math.max(drum, 0), deg(300));
      return Math.abs(x - (centres[s] + grooveAxialOffset(s, used))) < 0.003 + 1e-7;
    });
    expect(inGroove, `vertex at x=${x}, drum angle ${(drum * 180) / Math.PI}°`).toBe(true);
  }
  expect(floor).toBeGreaterThan(1000);
  g.computeBoundingBox();
  expect(g.boundingBox!.max.x - g.boundingBox!.min.x).toBeCloseTo(0.12, 7);
});

test('star wheel notches: a roller seat at every detent, a plateau between, nothing past sixth', () => {
  for (const d of [0, 60, 120, 180, 240, 300]) expect(starWheelRadiusAt(deg(d)), `${d}°`).toBeCloseTo(0.017, 9);
  // a zero-depth plateau between every pair of neighbouring detents, and beyond sixth
  for (const d of [15, 45, 90, 150, 210, 270, 330]) expect(starWheelRadiusAt(deg(d)), `${d}°`).toBeCloseTo(0.020, 9);
  expect(starWheelRadiusAt(deg(3))).toBeGreaterThan(0.017); expect(starWheelRadiusAt(deg(3))).toBeLessThan(0.020);
  expect(starWheelRadiusAt(deg(360))).toBeCloseTo(starWheelRadiusAt(0), 12);
});

test('each notch is a circular seat a little larger than the detent roller', () => {
  expect(STAR_SEAT_RADIUS).toBeGreaterThan(DETENT_ARM.rollerRadius);
  expect(STAR_SEAT_RADIUS - DETENT_ARM.rollerRadius).toBeLessThan(0.0003);
  for (const [d, depth] of [[120, 0.003], [30, 0.0015]] as const) {
    const a = deg(d), c = 0.020 - depth + STAR_SEAT_RADIUS; // seat centre on the detent's ray
    let inSeat = 0;
    for (let k = -149; k <= 149; k++) { // within 15° of the detent: no neighbour's seat
      const t = a + deg(k * 0.1), r = starWheelRadiusAt(t);
      if (r > 0.020 - 1e-12) continue;
      inSeat++;
      expect(Math.hypot(r * Math.cos(t) - c * Math.cos(a), r * Math.sin(t) - c * Math.sin(a)), `${d}° + ${k / 10}°`).toBeCloseTo(STAR_SEAT_RADIUS, 9);
    }
    expect(inSeat, `${d}°: the seat spans many degrees, wide enough for the roller`).toBeGreaterThan(depth > 0.002 ? 200 : 150);
  }
});

test('the fork reaches its collar and its pin points the other way', () => {
  const g = shiftFork({ reach: 0.06, collarRadius: 0.03 }); g.computeBoundingBox();
  expect(g.boundingBox!.max.y).toBeGreaterThan(0.06);            // the claw wraps past the collar centre
  expect(g.boundingBox!.max.z).toBeGreaterThan(0.03 + 0.005);
  expect(g.boundingBox!.min.y).toBeCloseTo(-FORK_PIN_REACH, 8);
  // the claw leaves the collar's path clear: nothing within the collar radius of the claw centre
  const p = g.getAttribute('position'); let inside = 0;
  for (let i = 0; i < p.count; i++) if (Math.hypot(p.getY(i) - 0.06, p.getZ(i)) < 0.03 - 1e-7) inside++;
  expect(inside).toBe(0);
});

test('a groove edge in the first axial cell leaves the drum ends where the caps are', () => {
  // B's groove reaches x = -0.0595 at its -4 mm end, inside the first 1.5 mm cell of a 0.12 m drum
  const g = shiftDrum(0.12, { A: 0.0, B: -0.0525, C: 0.03 }); g.computeBoundingBox();
  expect(g.boundingBox!.min.x).toBeCloseTo(-0.06, 7); expect(g.boundingBox!.max.x).toBeCloseTo(0.06, 7);
  expectCleanSolid(g, 'drum with a groove in the end cell');
});

test('every generator in this file builds a clean closed solid', () => {
  const all: [string, THREE.BufferGeometry][] = [
    ['drum', shiftDrum(0.12, { A: -0.03, B: 0.0, C: 0.03 })], ['fork', shiftFork({ reach: 0.06, collarRadius: 0.03 })],
    ['star wheel', starWheel()], ['detent arm', detentArm()], ['pawl', shiftPawl()], ['pedal', pedalLever()],
  ];
  for (const [name, g] of all) expectCleanSolid(g, name);
});

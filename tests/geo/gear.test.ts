import { test, expect } from 'vitest';
import type * as THREE from 'three';
import { dogRing, gearProfile, meshPhase, spurGear } from '../../src/geo/gear';
import { sprocket, sprocketOutline, sprocketPitchRadius } from '../../src/geo/sprocket';
import { CENTRE_DISTANCE, MODULE } from '../../src/model/geometry';
import { PARAMS } from '../../src/sim/params';
import { expectCleanSolid, meshPenetration, radii } from './helpers';

const angleOf = (p: THREE.Vector2): number => Math.atan2(p.y, p.x);

/** Angular width of tooth 0 where its two flanks cross radius r, interpolating along the outline. */
function toothAngularWidthAtPitch(pts: THREE.Vector2[], r: number): number {
  const half = Math.PI / (pts.length > 0 ? countTips(pts) : 1);
  const crossings: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const ra = a.length(), rb = b.length();
    if (!((ra < r && r <= rb) || (rb < r && r <= ra))) continue; // half-open: a point on r counts once
    const f = (r - ra) / (rb - ra);
    const ang = angleOf(a) + f * (angleOf(b) - angleOf(a));
    if (Math.abs(angleOf(a)) < half && Math.abs(angleOf(b)) < half) crossings.push(ang);
  }
  expect(crossings.length).toBe(2);
  return Math.abs(crossings[1] - crossings[0]);
}

/** Number of separate runs of points at the outline's largest radius. */
function countTips(pts: THREE.Vector2[]): number {
  const rs = pts.map((p) => p.length());
  const tip = Math.max(...rs);
  let tips = 0;
  for (let i = 0; i < rs.length; i++) if (rs[i] > tip - 1e-9 && !(rs[(i + rs.length - 1) % rs.length] > tip - 1e-9)) tips++;
  return tips;
}

test('gear outline has the right tip, root and tooth count', () => {
  const pts = gearProfile(37, 0.0025); const rs = pts.map((p) => p.length());
  expect(Math.max(...rs)).toBeCloseTo(37 * 0.00125 + 0.0025, 6);
  expect(Math.min(...rs)).toBeCloseTo(37 * 0.00125 - 0.003125, 6);
  let tips = 0; const tip = Math.max(...rs);                       // count runs of tip-radius points
  for (let i = 0; i < rs.length; i++) if (rs[i] > tip - 1e-9 && !(rs[(i + rs.length - 1) % rs.length] > tip - 1e-9)) tips++;
  expect(tips).toBe(37);
});

test('tooth thickness at the pitch circle is half the circular pitch', () => {
  // angular width of tooth 0 at r: 2 × (angle where the right flank crosses the pitch radius)
  expect(toothAngularWidthAtPitch(gearProfile(24, 0.0025), 24 * 0.00125)).toBeCloseTo(Math.PI / 24, 3);
});

test('spur gear solid: face width along x, bore respected, no NaN', () => {
  const g = spurGear({ teeth: 13, module: 0.0025, faceWidth: 0.014, boreRadius: 0.011 }); g.computeBoundingBox();
  expect(g.boundingBox!.max.x - g.boundingBox!.min.x).toBeCloseTo(0.014, 9);
  expect(Math.min(...radii(g))).toBeGreaterThanOrEqual(0.011 - 1e-9);
  expect(radii(g).every(Number.isFinite)).toBe(true);
  expect(g.getAttribute('normal')).toBeDefined();
});

test('dog ring: five lugs of 28°, standing 2.5 mm proud of x = 0', () => {
  const g = dogRing({ count: 5, widthDeg: 28, innerRadius: 0.016, outerRadius: 0.023, height: 0.0025 }); g.computeBoundingBox();
  expect(g.boundingBox!.min.x).toBeCloseTo(0, 9); expect(g.boundingBox!.max.x).toBeCloseTo(0.0025, 9);
  const p = g.getAttribute('position'); let outside = 0;
  for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getZ(i), p.getY(i)); const w = ((a % (2 * Math.PI / 5)) + 2 * Math.PI / 5) % (2 * Math.PI / 5);
    if (Math.min(w, 2 * Math.PI / 5 - w) > (14 * Math.PI) / 180 + 1e-6) outside++; }
  expect(outside).toBe(0);
});

test('sprocket pitch radius', () => {
  expect(sprocketPitchRadius(16, 0.015875)).toBeCloseTo(0.04069, 4);
  expect(sprocketPitchRadius(45, 0.015875)).toBeCloseTo(0.11380, 4);
});

// Every tooth count the model uses: gearbox pairs, primary drive and driven.
const TOOTH_COUNTS = [13, 17, 19, 21, 23, 24, 26, 27, 29, 31, 33, 36, 37, 76];

test('every gear outline is star-shaped about the axis, so it cannot self-intersect', () => {
  for (const z of TOOTH_COUNTS) {
    const pts = gearProfile(z, 0.0025);
    let turn = 0, backwards = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = angleOf(pts[i]), b = angleOf(pts[(i + 1) % pts.length]);
      const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
      if (d < -1e-12) backwards++;
      turn += d;
    }
    expect(backwards, `${z} teeth`).toBe(0);
    expect(turn, `${z} teeth`).toBeCloseTo(2 * Math.PI, 9);
    expect(countTips(pts), `${z} teeth`).toBe(z);
    const rs = pts.map((p) => p.length());
    expect(Math.min(...rs), `${z} teeth`).toBeCloseTo((z * 0.0025) / 2 - 1.25 * 0.0025, 9);
  }
});

test('flanks are true involutes of the base circle above it', () => {
  for (const z of [13, 24, 37, 76]) {
    const r = (z * 0.0025) / 2, rb = r * Math.cos((20 * Math.PI) / 180);
    const inv = (rho: number): number => { const a = Math.acos(rb / rho); return Math.tan(a) - a; };
    const pts = gearProfile(z, 0.0025);
    let checked = 0;
    for (const p of pts) {
      const rho = p.length(), a = angleOf(p);
      if (rho < Math.max(rb, r - 1.25 * 0.0025) + 1e-9 || rho > r + 0.0025 - 1e-9 || Math.abs(a) > Math.PI / z) continue;
      // on tooth 0 a flank point sits at ±(half-thickness at the pitch circle + inv(α) - inv(α at rho))
      expect(Math.abs(a), `${z} teeth at r=${rho}`).toBeCloseTo(Math.PI / (2 * z) + inv(r) - inv(rho), 9);
      checked++;
    }
    expect(checked, `${z} teeth`).toBeGreaterThanOrEqual(8);
  }
});

// Line-of-centres directions: B straight along +y, the layout's output shaft 35° below horizontal
// toward -z, and an arbitrary one.
const PSIS = [0, -Math.PI / 2 - (35 * Math.PI) / 180, 1.234];
const PAIRS: [number, number][] = [[13, 37], [17, 33], [19, 31], [21, 29], [23, 27], [24, 26]];
// 0.02 mm: the 13/37 pair has a known ~3 µm overlap at the 13T's radial undercut flank
const MESH_TOLERANCE = 0.00002;

test('every gearbox pair meshes without penetration through a full tooth pitch', () => {
  for (const [zA, zB] of PAIRS) {
    const A = gearProfile(zA, MODULE), B = gearProfile(zB, MODULE);
    for (const psi of PSIS) {
      const depth = meshPenetration(A, zA, B, zB, CENTRE_DISTANCE, psi, meshPhase(zA, zB, psi));
      expect(depth, `${zA}/${zB} at psi ${psi.toFixed(3)}`).toBeLessThan(MESH_TOLERANCE);
    }
  }
}, 30_000); // ~3.5 s alone, more under a parallel full run: an explicit timeout, not Vitest's 5 s

test('the primary pair meshes without penetration', () => {
  const [zA, zB] = [PARAMS.primary.drive, PARAMS.primary.driven];
  const A = gearProfile(zA, MODULE), B = gearProfile(zB, MODULE);
  for (const psi of PSIS) {
    const depth = meshPenetration(A, zA, B, zB, ((zA + zB) * MODULE) / 2, psi, meshPhase(zA, zB, psi));
    expect(depth, `primary at psi ${psi.toFixed(3)}`).toBeLessThan(MESH_TOLERANCE);
  }
});

test('the penetration check catches a pair half a tooth out of phase', () => {
  for (const [zA, zB] of [[13, 37], [24, 26]]) {
    const psi = PSIS[1];
    const depth = meshPenetration(gearProfile(zA, MODULE), zA, gearProfile(zB, MODULE), zB, CENTRE_DISTANCE, psi,
      meshPhase(zA, zB, psi) + Math.PI / zB);
    expect(depth, `${zA}/${zB}`).toBeGreaterThan(0.001);
  }
});

test('mesh phase is wrapped to one tooth pitch of B', () => {
  for (const [zA, zB] of PAIRS) for (const psi of PSIS) {
    const phase = meshPhase(zA, zB, psi);
    expect(phase).toBeGreaterThanOrEqual(0); expect(phase).toBeLessThan((2 * Math.PI) / zB);
  }
});

test('sprocket outline: tooth count, root on the roller seat, tooth 0 centred on angle 0', () => {
  for (const z of [16, 45]) {
    const pts = sprocketOutline(z, 0.015875, 0.005);
    const rs = pts.map((p) => p.length());
    expect(countTips(pts), `${z} teeth`).toBe(z);
    expect(Math.min(...rs), `${z} teeth`).toBeLessThan(sprocketPitchRadius(z, 0.015875) - 0.005);
    expect(Math.max(...rs), `${z} teeth`).toBeGreaterThan(sprocketPitchRadius(z, 0.015875) + 0.002);
    const tipAngles = pts.filter((p) => p.length() > Math.max(...rs) - 1e-9).map(angleOf);
    expect(Math.min(...tipAngles.map(Math.abs)), `${z} teeth`).toBeCloseTo(0, 9);
    let backwards = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = angleOf(pts[i]), b = angleOf(pts[(i + 1) % pts.length]);
      if (Math.atan2(Math.sin(b - a), Math.cos(b - a)) < -1e-12) backwards++;
    }
    expect(backwards, `${z} teeth`).toBe(0);
  }
});

test('every generator in this file builds a clean closed solid', () => {
  for (const z of [13, 37]) expectCleanSolid(spurGear({ teeth: z, module: 0.0025, faceWidth: 0.014, boreRadius: 0.011 }), `gear ${z}`);
  expectCleanSolid(dogRing({ count: 5, widthDeg: 28, innerRadius: 0.016, outerRadius: 0.023, height: 0.0025 }), 'dog ring');
  for (const z of [16, 45]) {
    expectCleanSolid(sprocket({ teeth: z, pitch: 0.015875, rollerRadius: 0.005, thickness: 0.008, boreRadius: 0.0125 }), `sprocket ${z}`);
  }
});

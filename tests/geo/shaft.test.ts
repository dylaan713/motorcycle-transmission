import { test, expect } from 'vitest';
import { plainShaft, splinedShaft } from '../../src/geo/shaft';
import { expectCleanSolid, radii } from './helpers';

test('shafts lie along x with the stated length', () => {
  const s = splinedShaft({ radius: 0.011, length: 0.2, splines: 6, splineDepth: 0.001 }); s.computeBoundingBox();
  // 7 places, not 9: positions are float32 (WebGL has no float64 attributes) and a float32 near
  // 0.1 m is only good to 7.5e-9 m, so a centred 0.2 m shaft cannot measure 0.2 to 5e-10
  expect(s.boundingBox!.max.x - s.boundingBox!.min.x).toBeCloseTo(0.2, 7);
  expect(Math.max(...radii(s))).toBeCloseTo(0.011, 6);
});

test('splines are cut to their depth and the plain shaft is its radius', () => {
  const s = splinedShaft({ radius: 0.011, length: 0.2, splines: 6, splineDepth: 0.001 });
  const rs = radii(s).filter((r) => r > 0.005);
  expect(Math.min(...rs)).toBeCloseTo(0.010, 9);
  const p = plainShaft({ radius: 0.0125, length: 0.15 }); p.computeBoundingBox();
  expect(p.boundingBox!.max.x - p.boundingBox!.min.x).toBeCloseTo(0.15, 7);
  expect(p.boundingBox!.min.x).toBeCloseTo(-0.075, 7);
  expect(Math.max(...radii(p))).toBeCloseTo(0.0125, 8);
});

test('every generator in this file builds a clean closed solid', () => {
  expectCleanSolid(splinedShaft({ radius: 0.011, length: 0.2, splines: 6, splineDepth: 0.001 }), 'splined shaft');
  expectCleanSolid(plainShaft({ radius: 0.0125, length: 0.15 }), 'plain shaft');
});

import { test, expect } from 'vitest';
import { forkGroovedGear } from '../../src/geo/gear';
import { crankshaft, sleeve } from '../../src/geo/shaft';
import { FORK_CLAW_DEPTH, grooveAxialOffset, shiftDrum } from '../../src/geo/shift';
import { MODULE } from '../../src/model/geometry';
import { deg } from '../../src/sim/units';
import { expectCleanSolid, radii } from './helpers';

// Small generators added for the 3D assembly (Task 4): the fork-grooved sliding gear, the
// collar between the third and fourth gears, the crankshaft, and drum grooves cut for followers
// that sit at different angles round the drum.

test('a fork-grooved gear keeps its teeth either side of a groove cut to the groove radius', () => {
  const g = forkGroovedGear({ teeth: 27, module: MODULE, faceWidth: 0.014, boreRadius: 0.0125, grooveWidth: 0.006, grooveRadius: 0.023 });
  const p = g.getAttribute('position');
  const tip = 27 * MODULE / 2 + MODULE;
  let inGroove = 0, toothTip = 0;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), r = Math.hypot(p.getY(i), p.getZ(i));
    if (Math.abs(x) < 0.003 - 1e-7) { inGroove++; expect(r).toBeLessThan(0.023 + 1e-7); }
    if (r > tip - 1e-7) toothTip++;
  }
  expect(inGroove).toBe(0); // the groove's only vertices are on its walls, at |x| = 3 mm
  expect(toothTip).toBeGreaterThan(27);
  g.computeBoundingBox();
  expect(g.boundingBox!.max.x - g.boundingBox!.min.x).toBeCloseTo(0.014, 7);
  expect(Math.min(...radii(g))).toBeCloseTo(0.0125, 6);
  expect(() => forkGroovedGear({ teeth: 27, module: MODULE, faceWidth: 0.014, boreRadius: 0.0125, grooveWidth: 0.006, grooveRadius: 0.031 })).toThrow();
});

test('a sleeve and a crankshaft have their sizes', () => {
  const s = sleeve({ boreRadius: 0.011, radius: 0.014, length: 0.007 }); s.computeBoundingBox();
  expect(s.boundingBox!.max.x - s.boundingBox!.min.x).toBeCloseTo(0.007, 7);
  expect(Math.min(...radii(s))).toBeCloseTo(0.011, 6); expect(Math.max(...radii(s))).toBeCloseTo(0.014, 6);
  const c = crankshaft({ journalRadius: 0.018, x0: -0.1, x1: 0.07, throws: [{ x: -0.03, angle: 0 }, { x: 0.03, angle: Math.PI }],
    throwRadius: 0.0225, pinRadius: 0.016, pinLength: 0.016, webThickness: 0.007, webRadius: 0.034 });
  c.computeBoundingBox();
  expect(c.boundingBox!.min.x).toBeCloseTo(-0.1, 7); expect(c.boundingBox!.max.x).toBeCloseTo(0.07, 7);
  expect(c.boundingBox!.max.y).toBeGreaterThan(0.0225 + 0.016); // the first throw's pin is on +y
  expect(c.boundingBox!.min.y).toBeLessThan(-(0.0225 + 0.016)); // the second's on -y
});

test('drum grooves follow followers set round the drum by their offsets', () => {
  const centres = { A: -0.0315, B: 0.0315, C: 0 } as const;
  const offsets = { A: deg(-32), B: deg(-32), C: 0 };
  const g = shiftDrum(0.1, centres, offsets); const p = g.getAttribute('position');
  let floor = 0;
  for (let i = 0; i < p.count; i++) {
    const r = Math.hypot(p.getY(i), p.getZ(i));
    if (r > 0.022 - 0.0039) continue;
    floor++;
    const a = Math.atan2(p.getZ(i), p.getY(i)), x = p.getX(i);
    const inGroove = (['A', 'B', 'C'] as const).some((s) => {
      let drum = a - offsets[s];
      drum = ((drum % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      if (drum > deg(350)) drum -= 2 * Math.PI; // the 10° run-out before 0°
      const used = Math.min(Math.max(drum, 0), deg(300));
      return Math.abs(x - (centres[s] + grooveAxialOffset(s, used))) < 0.003 + 1e-7;
    });
    expect(inGroove, `vertex at x=${x}, angle ${(a * 180) / Math.PI}°`).toBe(true);
  }
  expect(floor).toBeGreaterThan(1000);
  // the same drum without offsets differs: the offsets really move A's and B's grooves
  const plain = shiftDrum(0.1, centres).getAttribute('position');
  let differs = 0;
  for (let i = 0; i < Math.min(plain.count, p.count); i++) if (Math.abs(plain.getX(i) - p.getX(i)) > 1e-6) differs++;
  expect(differs).toBeGreaterThan(100);
});

test('the claw depth is exported for placing forks', () => {
  expect(FORK_CLAW_DEPTH).toBe(0.006);
});

test('every generator in this file builds a clean closed solid', () => {
  expectCleanSolid(forkGroovedGear({ teeth: 26, module: MODULE, faceWidth: 0.014, boreRadius: 0.0125, grooveWidth: 0.006, grooveRadius: 0.023 }), 'grooved gear');
  expectCleanSolid(sleeve({ boreRadius: 0.011, radius: 0.014, length: 0.007 }), 'sleeve');
  expectCleanSolid(crankshaft({ journalRadius: 0.018, x0: -0.1, x1: 0.07, throws: [{ x: -0.048, angle: 0 }, { x: -0.016, angle: Math.PI }],
    throwRadius: 0.0225, pinRadius: 0.016, pinLength: 0.016, webThickness: 0.007, webRadius: 0.034 }), 'crankshaft');
  expectCleanSolid(shiftDrum(0.1, { A: -0.0315, B: 0.0315, C: 0 }, { A: deg(-32), B: deg(-32) }), 'offset drum');
});

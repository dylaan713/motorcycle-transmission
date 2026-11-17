import { expect, test } from 'vitest';
import { PARTS, type PartId } from '../../src/model/parts';
import { createSimulation } from '../../src/sim/simulation';
import { FLOW_WIDTH, HOT_ALPHA_FLOOR, flowWidth, hotAlpha } from '../../src/view2d/flow';
import { EXTENT, FIT_PAD, fitTransform, pickShape, schematicShapes, toModel } from '../../src/view2d/layout';
import { Painter } from '../../src/view2d/paint';
import { REVEAL_ORDER, revealAlpha } from '../../src/view2d/reveal';

const at = (id: PartId): number => REVEAL_ORDER.indexOf(id);

test('the arrival lists every part once, in the order the torque travels, the shift mechanism last', () => {
  expect(new Set(REVEAL_ORDER).size).toBe(REVEAL_ORDER.length);
  expect([...REVEAL_ORDER].sort()).toEqual(Object.keys(PARTS).sort());
  expect(REVEAL_ORDER[0]).toBe('crank');
  const chain: PartId[] = ['crank', 'primaryDrive', 'clutchBasket', 'frictionPlates', 'clutchHub', 'inputShaft',
    'gear1in', 'gear6in', 'outputShaft', 'gear1out', 'gear6out', 'sprocket', 'chain', 'rearSprocket', 'rearWheel'];
  for (let i = 1; i < chain.length; i++) expect(at(chain[i - 1])).toBeLessThan(at(chain[i]));
  for (const id of ['forkA', 'forkC', 'shiftDrum', 'starWheel', 'detentArm', 'shiftShaft', 'pedal'] as const)
    expect(at(id)).toBeGreaterThan(at('rearWheel'));
});

test('during the arrival an earlier part is never fainter than a later one; nothing at 0, everything at 1', () => {
  for (const p of [0, 0.1, 0.33, 0.5, 0.8, 0.95, 1]) {
    const alphas = REVEAL_ORDER.map((_, i) => revealAlpha(i, p));
    for (let i = 1; i < alphas.length; i++) expect(alphas[i]).toBeLessThanOrEqual(alphas[i - 1]);
    if (p === 0) expect(Math.max(...alphas)).toBe(0);
    if (p === 1) expect(Math.min(...alphas)).toBe(1);
  }
});

test('after a resize the fit centres the drawing and a click maps back to the part under it', () => {
  for (const [w, h] of [[800, 600], [300, 200], [1200, 400]]) {
    const fit = fitTransform(w, h);
    const ew = (EXTENT.x1 - EXTENT.x0) * fit.scale, eh = (EXTENT.y1 - EXTENT.y0) * fit.scale;
    expect(Math.min(w - ew, h - eh)).toBeCloseTo(2 * FIT_PAD, 9); // the tighter side keeps the pad
    expect(fit.ox + ((EXTENT.x0 + EXTENT.x1) / 2) * fit.scale).toBeCloseTo(w / 2, 9);
    expect(fit.oy + ((EXTENT.y0 + EXTENT.y1) / 2) * fit.scale).toBeCloseTo(h / 2, 9);
    const shapes = schematicShapes(createSimulation().getState());
    const band = shapes.find((s) => s.id === 'shiftDrum')!;
    const cx = band.x + 0.002, cy = band.y + 0.002; // a corner of the band, clear of the forks
    const m = toModel(fit, fit.ox + cx * fit.scale, fit.oy + cy * fit.scale)!;
    expect(m.x).toBeCloseTo(cx, 9); expect(m.y).toBeCloseTo(cy, 9);
    expect(pickShape(shapes, m.x, m.y)).toBe('shiftDrum');
  }
  expect(toModel(fitTransform(0, 0), 5, 5)).toBeNull();
});

test('a hairline covers whole device pixels at any pixel ratio', () => {
  const p = new Painter({} as CanvasRenderingContext2D);
  for (const dpr of [1, 1.25, 1.5, 2, 2.5, 3]) {
    p.dpr = dpr;
    for (const v of [0, 10.3, 99.74, 250.5]) {
      const centre = p.line1(v) * dpr, half = (p.hair * dpr) / 2;
      expect(Math.abs(centre - half - Math.round(centre - half))).toBeLessThan(1e-9);
      expect(Math.abs(p.line1(v) - v)).toBeLessThanOrEqual(1 / dpr);
    }
  }
});

test('low torque stays clearly orange; its size is carried by the line width', () => {
  expect(hotAlpha(0.6)).toBeGreaterThanOrEqual(HOT_ALPHA_FLOOR);
  expect(hotAlpha(-1000)).toBe(1);
  expect(flowWidth(0)).toBe(FLOW_WIDTH[0]);
  expect(flowWidth(-150)).toBe(FLOW_WIDTH[1]);
  expect(flowWidth(75)).toBeCloseTo(3.75, 9);
  expect(FLOW_WIDTH).toEqual([2.5, 5]);
  expect(HOT_ALPHA_FLOOR).toBeCloseTo(0.55, 9);
});

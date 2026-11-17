import { test, expect } from 'vitest';
import { SLIDER_TRAVEL } from '../../src/model/geometry';
import type { PartId } from '../../src/model/parts';
import { createSimulation } from '../../src/sim/simulation';
import type { SimState } from '../../src/sim/types';
import { DOG_WIDTHS, dogLugAngles, schematicShapes } from '../../src/view2d/layout';
import { PARAMS } from '../../src/sim/params';
import { clutchCapacityMax } from '../../src/sim/clutch';
import { dogAligned } from '../../src/sim/dogs';
import { deg, wrap } from '../../src/sim/units';

const base = () => createSimulation().getState();
test('every drawable part has a shape and none are degenerate', () => {
  const ids = new Set(schematicShapes(base()).map((s) => s.id));
  for (const id of ['clutchBasket', 'inputShaft', 'outputShaft', 'gear1in', 'gear6out', 'shiftDrum', 'forkA', 'rearWheel'] as const) expect(ids.has(id)).toBe(true);
  for (const s of schematicShapes(base())) { expect(s.w).toBeGreaterThan(0); expect(s.h).toBeGreaterThan(0); }
});
test('meshing gears touch at the pitch line', () => {
  const shapes = schematicShapes(base()); const get = (id: PartId) => shapes.find((s) => s.id === id)!;
  for (const g of [1, 2, 3, 4, 5, 6] as const) {
    const a = get(`gear${g}in`), b = get(`gear${g}out`);
    expect(a.y + a.h).toBeCloseTo(b.y, 9);                       // bottom of the input gear meets the top of the output gear
    expect(a.x).toBeCloseTo(b.x, 9);
  }
});
test('a slider moves with its x and nothing else does', () => {
  const s0 = base(); const s1 = base(); s1.sliders.A.x = -1;
  const x = (st: SimState, id: PartId) => schematicShapes(st).find((s) => s.id === id)!.x;
  expect(x(s1, 'gear5out') - x(s0, 'gear5out')).toBeCloseTo(-SLIDER_TRAVEL, 9);
  expect(x(s1, 'gear1out')).toBe(x(s0, 'gear1out'));
  expect(x(s1, 'gear5in')).toBe(x(s0, 'gear5in'));
});
test('slider C carries both third and fourth on the input shaft', () => {
  const s0 = base(); const s1 = base(); s1.sliders.C.x = 1;
  const x = (st: SimState, id: PartId) => schematicShapes(st).find((s) => s.id === id)!.x;
  expect(x(s1, 'gear3in') - x(s0, 'gear3in')).toBeCloseTo(SLIDER_TRAVEL, 9);
  expect(x(s1, 'gear4in') - x(s0, 'gear4in')).toBeCloseTo(SLIDER_TRAVEL, 9);
});

test('a slider dog is drawn wholly inside a gap between the gear lugs exactly when the simulation aligns it', () => {
  const PITCH = (2 * Math.PI) / PARAMS.dogs.count;
  const clearance = (DOG_WIDTHS.slider + DOG_WIDTHS.gear) / 2;
  let fits = 0, total = 0;
  for (const slider of ['A', 'B', 'C'] as const) {
    for (let i = 0; i < 90; i++) {
      const sim = createSimulation();
      sim.setState({ angles: { input: 0.41 * i - 3, output: -0.29 * i + 0.7, crank: 0 } });
      const phiDeg = (i * 4.1 + 0.5) % 72; // never exactly on the window's edge
      sim.setState({ sliders: { [slider]: { phi: deg(phiDeg), x: i % 2 ? 0.6 : -0.6 } } });
      const st = sim.getState();
      const side = st.sliders[slider].side;
      const a = dogLugAngles(st, slider, side);
      const d = wrap(a.slider - a.gear, PITCH);
      const fit = Math.min(d, PITCH - d) >= clearance - 1e-9;
      expect(fit).toBe(dogAligned(st.sliders[slider].phi));
      total++; if (fit) fits++;
    }
  }
  expect(fits).toBeGreaterThan(0);
  expect(fits).toBeLessThan(total);
});

test('released plates stay on their carriers: friction plates in the basket, steel plates on the hub drum', () => {
  for (const capacity of [clutchCapacityMax, clutchCapacityMax / 2, 0]) {
    const st = base(); st.clutch.capacity = capacity;
    const shapes = schematicShapes(st);
    const span = (id: PartId) => {
      const own = shapes.filter((s) => s.id === id);
      return [Math.min(...own.map((s) => s.x)), Math.max(...own.map((s) => s.x + s.w))];
    };
    const [basket0, basket1] = span('clutchBasket');
    const [hub0, hub1] = span('clutchHub');
    for (const s of shapes.filter((p) => p.id === 'frictionPlates')) {
      expect(s.x).toBeGreaterThanOrEqual(basket0);
      expect(s.x + s.w).toBeLessThanOrEqual(basket1);
    }
    for (const s of shapes.filter((p) => p.id === 'steelPlates')) {
      expect(s.x).toBeGreaterThanOrEqual(hub0);
      expect(s.x + s.w).toBeLessThanOrEqual(hub1);
    }
    // the pressure plate's release rod still reaches into the input shaft
    const [, pp1] = span('pressurePlate');
    const [in0] = span('inputShaft');
    expect(pp1).toBeGreaterThan(in0);
  }
});

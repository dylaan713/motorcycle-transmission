import { test, expect } from 'vitest';
import { SLIDER_TRAVEL, gearAxialPosition } from '../../src/model/geometry';
import type { GearNo, PartId } from '../../src/model/parts';
import { createSimulation } from '../../src/sim/simulation';
import type { SimState } from '../../src/sim/types';
import {
  BASKET_BACK_X, CHAIN_PTS, CRANK_Y, DOG_GEAR_W, DOG_SLIDER_W, DRIVE_R, DRIVEN_R, FORK_W, IN_Y, OUT_SHAFT_X, OUT_Y, PRIMARY_X, SHIFT_SHAFT,
  SPRING, SPROCKET_R, SPROCKET_X, dogLugAngles, pedalTip, pickShape, schematicShapes,
} from '../../src/view2d/layout';
import { createFlow, torqueCarriers } from '../../src/view2d/flow';
import { torquePath } from '../../src/model/torquePath';
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
  const clearance = (DOG_SLIDER_W + DOG_GEAR_W) / 2;
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

const MM = 1e-3;
const pickAt = (st: SimState, x: number, y: number) => pickShape(schematicShapes(st), x, y);

test('every drawn region picks the part it belongs to', () => {
  const st = base();
  const shapes = schematicShapes(st); const get = (id: PartId) => shapes.find((s) => s.id === id)!;
  const g3 = get('gear3in'), g4 = get('gear4in');
  expect(pickAt(st, (g3.x + g3.w + g4.x) / 2, -15 * MM)).toBe('gear3in');           // the web of the 3rd/4th piece
  const sprocketX = (SPROCKET_X[0] + SPROCKET_X[1]) / 2;
  expect(pickAt(st, sprocketX, OUT_Y - SPROCKET_R)).toBe('chain');                  // chain wrapped on the front sprocket
  expect(pickAt(st, sprocketX, OUT_Y + SPROCKET_R)).toBe('chain');
  expect(pickAt(st, SPRING.boltX + 1 * MM, SPRING.r)).toBe('pressurePlate');        // a clutch spring
  expect(pickAt(st, OUT_SHAFT_X[1] - 2 * MM, OUT_Y + 7 * MM)).toBe('outputShaft');  // the output shaft nut
  expect(pickAt(st, (PRIMARY_X[0] + PRIMARY_X[1]) / 2, 0)).toBe('inputShaft');      // the shaft through the driven gear
  expect(pickAt(st, (BASKET_BACK_X[0] + BASKET_BACK_X[1]) / 2, 0)).toBe('inputShaft'); // and through the basket back
  expect(pickAt(st, (PRIMARY_X[0] + PRIMARY_X[1]) / 2, CRANK_Y + DRIVE_R - 1 * MM)).toBe('primaryDrive');
  expect(pickAt(st, (PRIMARY_X[0] + PRIMARY_X[1]) / 2, DRIVEN_R - 1 * MM)).toBe('clutchBasket');
  expect(pickAt(st, SHIFT_SHAFT.x, SHIFT_SHAFT.y)).toBe('shiftShaft');
  const tip = pedalTip(st);
  expect(pickAt(st, tip.x, tip.y)).toBe('pedal');
});

test('the pedal lever rocks with the pedal travel: up lifts its tip', () => {
  const rest = base(), up = base(), down = base();
  up.pedal.travel = 1; down.pedal.travel = -1;
  expect(pedalTip(up).y).toBeLessThan(pedalTip(rest).y);
  expect(pedalTip(down).y).toBeGreaterThan(pedalTip(rest).y);
  const pedal = (st: SimState) => schematicShapes(st).find((s) => s.id === 'pedal')!;
  expect(pedal(up).y).not.toBeCloseTo(pedal(down).y, 6);
});

test('a fork is rigid on its rail: drawn straight at its slider, wherever its pin is in the groove', () => {
  const st = base();
  st.drum.angle = 0; // first: groove A asks for x = -1
  st.sliders.A.x = -0.5; st.sliders.A.blocked = true; // but the slider is held at the contact point
  const fork = schematicShapes(st).find((s) => s.id === 'forkA')!;
  expect(fork.x + fork.w / 2).toBeCloseTo(gearAxialPosition(5) - 0.5 * SLIDER_TRAVEL, 9);
  expect(fork.w).toBeCloseTo(FORK_W, 9);
});

/** A state in gear g carrying `torque` at the dogs, and its torque path. */
function inGearState(g: GearNo, torque: number) {
  const st = base();
  st.lockedGear = g; st.clutch.torque = torque; st.dogTorque = torque; st.clutch.locked = true;
  const id = (['A', 'B', 'C'] as const).find((k) => PARAMS.sliders[k].neg === g || PARAMS.sliders[k].pos === g)!;
  st.sliders[id].x = PARAMS.sliders[id].neg === g ? -1 : 1;
  return { st, path: torquePath(st) };
}

test('the torque line takes the top chain strand under drive and the bottom one under engine braking', () => {
  const flow = createFlow();
  const has = (pts: number[], p: { x: number; y: number }) =>
    pts.some((v, i) => i % 2 === 0 && Math.abs(v - p.x) < 1e-9 && Math.abs(pts[i + 1] - p.y) < 1e-9);
  for (const [torque, carries, slack] of [[60, 'Top', 'Bottom'], [-30, 'Bottom', 'Top']] as const) {
    const { st, path } = inGearState(3, torque);
    flow.build(st, path, schematicShapes(st));
    const pts = flow.points();
    expect(has(pts, CHAIN_PTS[`front${carries}`])).toBe(true);
    expect(has(pts, CHAIN_PTS[`rear${carries}`])).toBe(true);
    expect(has(pts, CHAIN_PTS[`front${slack}`])).toBe(false);
  }
});

test('in every gear the line visits each point once, and the sliding piece that drives once', () => {
  const flow = createFlow();
  for (const g of [1, 2, 3, 4, 5, 6] as const) {
    const { st, path } = inGearState(g, 60);
    flow.build(st, path, schematicShapes(st));
    const pts = flow.points();
    const keys = pts.filter((_, i) => i % 2 === 0).map((x, i) => `${x.toFixed(9)},${pts[2 * i + 1].toFixed(9)}`);
    expect(new Set(keys).size).toBe(keys.length);
    const id = (['A', 'B', 'C'] as const).find((k) => PARAMS.sliders[k].neg === g || PARAMS.sliders[k].pos === g)!;
    const body = (id === 'C' ? 0 : gearAxialPosition(id === 'A' ? 5 : 6)) + st.sliders[id].x * SLIDER_TRAVEL;
    const axis = PARAMS.sliders[id].shaft === 'input' ? IN_Y : OUT_Y;
    expect(keys.filter((k) => k === `${body.toFixed(9)},${axis.toFixed(9)}`)).toHaveLength(1);
  }
});

test('the 3rd/4th sliding piece carries torque as one piece in 5th and 6th', () => {
  for (const g of [5, 6] as const) {
    const { st, path } = inGearState(g, 60);
    for (const listed of [path.parts, path.parts.filter((id) => id !== 'gear4in'), path.parts.filter((id) => id !== 'gear3in')]) {
      const hot = new Set<PartId>();
      torqueCarriers({ ...path, parts: listed }, st, hot);
      expect(hot.has('gear3in') && hot.has('gear4in')).toBe(true);
    }
  }
  const { st, path } = inGearState(3, 60);
  const hot = new Set<PartId>();
  torqueCarriers(path, st, hot);
  expect(hot.has('gear3in')).toBe(true);
  expect(hot.has('gear4in')).toBe(false);
});

test('a plate near the axis picks the plate, not the release rod inside it', () => {
  const st = base();
  const plate = schematicShapes(st).find((s) => s.id === 'steelPlates')!;
  expect(pickAt(st, plate.x + plate.w / 2, 1 * MM)).toBe('steelPlates');
});

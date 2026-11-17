import { test, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { buildAssembly } from '../../src/view3d/assembly';
import type { TorquePath } from '../../src/model/torquePath';
import type { Assembly } from '../../src/view3d/assembly';
import { poseAssembly } from '../../src/view3d/pose';
import { partMaterial, setTorque, withEdges } from '../../src/view3d/materials';
import {
  CLAW_OUTER, CLAW_THICKNESS, CLUTCH_X0, COLLAR_GROOVE_WIDTH, COLLAR_RADIUS, CRANK, CRANK_AXIS, DRUM_AXIS, DRUM_LENGTH,
  FORK_RODS, INPUT_AXIS, OUTPUT_AXIS, OUTPUT_SHAFT_X, REAR_AXIS, SLIDER_AXIS, SPROCKET_X, distanceOf, gearSolids, tipRadius, toothedRange,
} from '../../src/view3d/layout3d';
import type { Axis } from '../../src/view3d/layout3d';
import { CENTRE_DISTANCE, GEAR_ORDER } from '../../src/model/geometry';
import { PARTS } from '../../src/model/parts';
import type { GearNo, PartId } from '../../src/model/parts';
import { createSimulation } from '../../src/sim/simulation';
import type { SliderId } from '../../src/sim/types';
import { grooveCommand } from '../../src/sim/shiftDrum';
import { deg } from '../../src/sim/units';
import { COLORS } from '../../src/ui/tokens';
import { DIM } from '../../src/geo/dimensions';
import { meshesOf, triangles, worldVertices } from './helpers';

const EMPTY: TorquePath = { parts: [], torque: 0, slipping: false, reach: 'none' };

test('every part in the registry has a node with pickable meshes', async () => {
  const a = await buildAssembly(() => {});
  for (const id of Object.keys(PARTS) as PartId[]) {
    let meshes = 0; a.node(id).traverse((o) => { if ((o as THREE.Mesh).isMesh && o.userData.partId === id) meshes++; });
    expect(meshes, id).toBeGreaterThan(0);
  }
});

test('shaft axes are a centre distance apart and gears sit on their shafts', async () => {
  const a = await buildAssembly(() => {}); a.root.updateMatrixWorld(true);
  const w = (id: PartId) => a.node(id).getWorldPosition(new THREE.Vector3());
  const i = w('gear1in'), o = w('gear1out');
  expect(Math.hypot(i.y - o.y, i.z - o.z)).toBeCloseTo(CENTRE_DISTANCE, 9);
  expect(i.x).toBeCloseTo(o.x, 9);
  expect(w('gear5in').x - w('gear1in').x).toBeCloseTo(0.021, 9);
});

// ---- one shared build for the checks below ----
let a: Assembly;
const progress: [number, number, string][] = [];
beforeAll(async () => { a = await buildAssembly((d, t, l) => progress.push([d, t, l])); });

test('build reports progress once per group, in order', () => {
  expect(progress).toEqual([
    [1, 6, 'shafts'], [2, 6, 'input gears'], [3, 6, 'output gears'], [4, 6, 'clutch'], [5, 6, 'shift mechanism'], [6, 6, 'final drive'],
  ]);
});

test('node throws for an unknown part, and every mesh in the tree is pickable', () => {
  expect(() => a.node('nope' as PartId)).toThrow();
  let unnamed = 0;
  a.root.traverse((o) => { if ((o as THREE.Mesh).isMesh && !(o.userData.partId in PARTS)) unnamed++; });
  expect(unnamed).toBe(0);
});

test('layout: the plan placement holds', () => {
  const dir = (from: Axis, to: Axis) => Math.atan2(to.y - from.y, to.z - from.z) * 180 / Math.PI; // from horizontal (+z) toward +y
  expect(distanceOf(INPUT_AXIS, OUTPUT_AXIS)).toBeCloseTo(CENTRE_DISTANCE, 12);
  // the bike's front is +z: the output shaft is behind (-z) the input, the crank ahead (+z) of the clutch
  expect(dir(INPUT_AXIS, OUTPUT_AXIS)).toBeCloseTo(-145, 9);          // 35° below horizontal toward -z
  expect(distanceOf(CRANK_AXIS, INPUT_AXIS)).toBeCloseTo(0.112, 12);    // the primary at module 2
  expect(dir(INPUT_AXIS, CRANK_AXIS)).toBeCloseTo(50, 9);              // 50° above horizontal toward +z
  expect(DRUM_AXIS.y).toBeLessThan(OUTPUT_AXIS.y); expect(DRUM_AXIS.z).toBeGreaterThan(INPUT_AXIS.z); // below and in front
  expect(REAR_AXIS.y).toBe(OUTPUT_AXIS.y); expect(REAR_AXIS.z - OUTPUT_AXIS.z).toBeCloseTo(-0.56, 12); // behind
  a.root.updateMatrixWorld(true);
  const wheel = a.node('rearWheel').getWorldPosition(new THREE.Vector3());
  expect(wheel.y).toBeCloseTo(REAR_AXIS.y, 12); expect(wheel.z).toBeCloseTo(REAR_AXIS.z, 12);
  // the clutch's primary ring clears the output shaft's end
  expect(CLUTCH_X0 + DIM.primary.faceWidth).toBeLessThan(OUTPUT_SHAFT_X[0]);
});

test('anchors and framing: the gearbox and clutch, not the wheel', () => {
  const { centre, radius } = a.framing;
  expect(radius).toBeGreaterThan(0.1); expect(radius).toBeLessThan(0.3);
  for (const [k, p] of Object.entries(a.anchors)) {
    expect(Number.isFinite(p.x + p.y + p.z), k).toBe(true);
    if (k !== 'finalDrive') expect(p.distanceTo(centre), k).toBeLessThan(radius);
  }
  const wheel = new THREE.Vector3(0, REAR_AXIS.y, REAR_AXIS.z);
  expect(wheel.distanceTo(centre)).toBeGreaterThan(radius);
});

test('triangle budget: under 400,000 with each shared geometry counted once', () => {
  const seen = new Set<THREE.BufferGeometry>();
  let unique = 0, drawn = 0;
  a.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const t = triangles(m.geometry);
    drawn += t * ((m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1);
    if (!seen.has(m.geometry)) { seen.add(m.geometry); unique += t; }
  });
  expect(unique).toBeLessThan(400_000);
  expect(drawn).toBeLessThan(400_000);
  expect(drawn).toBeGreaterThan(unique);
});

test('materials: tones from the tokens; torque lights one part only', () => {
  expect('#' + partMaterial('steel4').color.getHexString()).toBe(COLORS.steel4.toLowerCase());
  const g = withEdges(new THREE.BoxGeometry(1, 1, 1), 'steel3');
  expect(g.children.some((c) => (c as THREE.LineSegments).isLineSegments)).toBe(true);
  setTorque(g, 1);
  const m = (g.children[0] as THREE.Mesh).material as THREE.MeshLambertMaterial;
  expect(m.color.getHexString()).toBe(new THREE.Color(COLORS.signal).getHexString());
  expect(m.emissive.r).toBeCloseTo(new THREE.Color(COLORS.signal).r * 0.35, 9);
  expect(g.userData.torque).toBe(1);
  setTorque(g, 0);
  expect('#' + m.color.getHexString()).toBe(COLORS.steel3.toLowerCase());
  expect(m.emissive.getHex()).toBe(0);
  // each part has its own materials
  const mats = new Set<THREE.Material>();
  for (const id of ['gear1in', 'gear2in'] as const) for (const mesh of meshesOf(a.node(id))) mats.add(mesh.material as THREE.Material);
  expect(mats.size).toBe(meshesOf(a.node('gear1in')).length + meshesOf(a.node('gear2in')).length);
});

// ---- clearances: nothing passes through a gear it does not belong to ----

interface Cylinder { id: PartId; axis: Axis; x0: number; x1: number; r: number }
function gearCylinders(): Cylinder[] {
  a.root.updateMatrixWorld(true);
  const out: Cylinder[] = [];
  for (const shaft of ['input', 'output'] as const) for (const g of GEAR_ORDER) {
    const id = `gear${g}${shaft === 'input' ? 'in' : 'out'}` as PartId;
    const p = a.node(id).getWorldPosition(new THREE.Vector3());
    const axis = { y: p.y, z: p.z };
    // the toothed band, and a collared slider's groove hub and flange
    for (const b of gearSolids(shaft, g as GearNo)) out.push({ id, axis, x0: p.x + b.x0, x1: p.x + b.x1, r: b.r });
    // the dog rings this gear actually carries, where they stand
    const dogGeometry = meshesOf(a.rig.freeDogs[0].ring)[0].geometry;
    for (const m of meshesOf(a.node(id)).filter((mesh) => mesh.geometry === dogGeometry)) {
      const box = new THREE.Box3().setFromObject(m);
      out.push({ id, axis, x0: box.min.x, x1: box.max.x, r: DIM.dogOuterRadius });
    }
  }
  return out;
}
type SliderSet = Record<SliderId, number>;
const SLIDER_IDS: SliderId[] = ['A', 'B', 'C'];
/**
 * Every combination of slider positions the simulation can produce, and then some. The drum
 * commands all three at once (grooveCommand), swept through its whole travel a degree at a time,
 * which covers the mixes in the middle of a shift; any slider may lag its command, held back at
 * neutral by dogs meeting face to face; and every mix of the travel ends (-1, 0, +1), a superset.
 */
const SLIDER_SETS: SliderSet[] = (() => {
  const seen = new Map<string, SliderSet>();
  const add = (x: SliderSet): void => { seen.set(SLIDER_IDS.map((k) => x[k].toFixed(4)).join(','), x); };
  for (let d = 0; d <= 300; d++) {
    const c = Object.fromEntries(SLIDER_IDS.map((k) => [k, grooveCommand(k, deg(d))])) as SliderSet;
    for (let lag = 0; lag < 8; lag++) add(Object.fromEntries(SLIDER_IDS.map((k, i) => [k, lag & (1 << i) ? 0 : c[k]])) as SliderSet);
  }
  for (const xa of [-1, 0, 1]) for (const xb of [-1, 0, 1]) for (const xc of [-1, 0, 1]) add({ A: xa, B: xb, C: xc });
  return [...seen.values()];
})();
const label = (x: SliderSet): string => SLIDER_IDS.map((k) => `${k} ${x[k].toFixed(3)}`).join(', ');
const poseSliders = (x: SliderSet): void => {
  const s = createSimulation().getState();
  for (const k of SLIDER_IDS) s.sliders[k].x = x[k];
  poseAssembly(a, s, EMPTY);
};

test('the slider combinations mix positions: partway through a shift, and every mix of the travel ends', () => {
  expect(SLIDER_SETS.length).toBeGreaterThan(27);
  expect(SLIDER_SETS.some((x) => SLIDER_IDS.some((k) => Math.abs(x[k]) > 0.05 && Math.abs(x[k]) < 0.95))).toBe(true);
  expect(SLIDER_SETS.some((x) => x.A === -1 && x.B === 1 && x.C === -1)).toBe(true);
});

test('forks clear every gear solid, their own included, at every slider combination', () => {
  for (const x of SLIDER_SETS) {
    poseSliders(x);
    const cylinders = gearCylinders();
    for (const k of ['A', 'B', 'C'] as SliderId[]) {
      let bad = 0;
      for (const mesh of meshesOf(a.node(`fork${k}` as PartId))) for (const v of worldVertices(mesh)) {
        for (const c of cylinders) {
          if (v.x <= c.x0 + 1e-9 || v.x >= c.x1 - 1e-9) continue;
          if (Math.hypot(v.y - c.axis.y, v.z - c.axis.z) < c.r - 1e-9) bad++;
        }
      }
      expect(bad, `fork ${k} with ${label(x)}`).toBe(0);
    }
  }
});

test('no fork claw volume intersects any gear\'s toothed region, at every slider combination', () => {
  for (const x of SLIDER_SETS) {
    poseSliders(x); a.root.updateMatrixWorld(true);
    for (const k of ['A', 'B', 'C'] as SliderId[]) {
      const fx = a.node(`fork${k}` as PartId).getWorldPosition(new THREE.Vector3()).x;
      const claw = { x0: fx - CLAW_THICKNESS[k] / 2, x1: fx + CLAW_THICKNESS[k] / 2, rIn: COLLAR_RADIUS[k], rOut: CLAW_OUTER(k) };
      for (const shaft of ['input', 'output'] as const) for (const g of GEAR_ORDER) {
        const id = `gear${g}${shaft === 'input' ? 'in' : 'out'}` as PartId;
        const p = a.node(id).getWorldPosition(new THREE.Vector3());
        const [t0, t1] = toothedRange(shaft, g as GearNo);
        const overlap = Math.min(claw.x1, p.x + t1) - Math.max(claw.x0, p.x + t0);
        if (overlap <= 0) continue;
        // an x overlap is allowed only with a gear on the other shaft whose tips the claw stays below
        const sameAxis = Math.hypot(p.y - SLIDER_AXIS[k].y, p.z - SLIDER_AXIS[k].z) < 1e-9;
        expect(sameAxis, `claw ${k} with ${label(x)} is level with the teeth of ${id}`).toBe(false);
        expect(claw.rOut, `claw ${k} reaches the tips of ${id}`).toBeLessThan(CENTRE_DISTANCE - tipRadius(shaft, g as GearNo));
      }
    }
  }
  // the claws of A and B ride in their collar grooves with 0.2 mm clear of each wall
  for (const k of ['A', 'B'] as const) expect(COLLAR_GROOVE_WIDTH - CLAW_THICKNESS[k]).toBeGreaterThanOrEqual(0.0004 - 1e-12);
});

test('every meshing pair keeps at least 70% of its narrower toothed width in mesh, at every slider combination', () => {
  for (const x of SLIDER_SETS) {
    poseSliders(x); a.root.updateMatrixWorld(true);
    for (const g of GEAR_ORDER) {
      const span = (shaft: 'input' | 'output') => {
        const c = a.node(`gear${g}${shaft === 'input' ? 'in' : 'out'}` as PartId).getWorldPosition(new THREE.Vector3()).x;
        const [t0, t1] = toothedRange(shaft, g as GearNo);
        return [c + t0, c + t1];
      };
      const [i0, i1] = span('input'), [o0, o1] = span('output');
      const overlap = Math.min(i1, o1) - Math.max(i0, o0);
      expect(overlap / Math.min(i1 - i0, o1 - o0), `pair ${g} with ${label(x)}`).toBeGreaterThanOrEqual(0.7);
    }
  }
});

test('the forks claws stay below the tips of the gears meshing beside them', () => {
  // A and B: the input gear meshing with the slider gear reaches CENTRE_DISTANCE - tip from the output axis
  for (const [s, g] of [['A', 5], ['B', 6]] as const) expect(CLAW_OUTER(s), s).toBeLessThan(CENTRE_DISTANCE - tipRadius('input', g));
  // C: below the roots of third and fourth, and below the reach of the output gears beside its gap
  expect(CLAW_OUTER('C')).toBeLessThan(19 * 0.00125 - 0.003125);
  for (const g of [3, 4] as const) expect(CLAW_OUTER('C')).toBeLessThan(CENTRE_DISTANCE - tipRadius('output', g));
});

test('drum, fork rods and crank clear every gear', () => {
  const allGears = GEAR_ORDER.flatMap((g) => [tipRadius('input', g), tipRadius('output', g)]);
  const maxIn = Math.max(...GEAR_ORDER.map((g) => tipRadius('input', g))), maxOut = Math.max(...GEAR_ORDER.map((g) => tipRadius('output', g)));
  expect(allGears.length).toBe(12);
  const clear = (axis: Axis, r: number) => Math.min(distanceOf(axis, INPUT_AXIS) - maxIn, distanceOf(axis, OUTPUT_AXIS) - maxOut) - r;
  expect(clear(DRUM_AXIS, DIM.drum.radius)).toBeGreaterThan(0.01);
  expect(clear(FORK_RODS.AB, DIM.fork.rodRadius)).toBeGreaterThan(0.005);
  expect(clear(FORK_RODS.C, DIM.fork.rodRadius)).toBeGreaterThan(0.005);
  expect(distanceOf(FORK_RODS.AB, FORK_RODS.C)).toBeGreaterThan(2 * DIM.fork.rodRadius + 0.005);
  expect(clear(CRANK_AXIS, CRANK.throwRadius + CRANK.pinRadius + 0.004)).toBeGreaterThan(0.03);
  // the drum ends well short of the clutch basket and of the sprocket's plane
  expect(DRUM_LENGTH / 2).toBeLessThan(SPROCKET_X);
});

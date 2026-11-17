import { test, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { buildAssembly } from '../../src/view3d/assembly';
import type { TorquePath } from '../../src/model/torquePath';
import type { Assembly } from '../../src/view3d/assembly';
import { poseAssembly } from '../../src/view3d/pose';
import { partMaterial, setTorque, withEdges } from '../../src/view3d/materials';
import {
  CLAW_OUTER, CLUTCH_X0, COLLAR_CLEARANCE, COLLAR_RADIUS, CRANK, CRANK_AXIS, DRUM_AXIS, DRUM_LENGTH, FORK_GROOVE_WIDTH,
  FORK_RODS, INPUT_AXIS, OUTPUT_AXIS, OUTPUT_SHAFT_X, REAR_AXIS, SPROCKET_X, distanceOf, tipRadius,
} from '../../src/view3d/layout3d';
import type { Axis } from '../../src/view3d/layout3d';
import { CENTRE_DISTANCE, FACE_WIDTH, GEAR_ORDER, sliderOfGear } from '../../src/model/geometry';
import { PARTS } from '../../src/model/parts';
import type { GearNo, PartId } from '../../src/model/parts';
import { createSimulation } from '../../src/sim/simulation';
import type { SliderId } from '../../src/sim/types';
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
  expect(dir(INPUT_AXIS, OUTPUT_AXIS)).toBeCloseTo(-145, 9);          // 35° below horizontal toward -z
  expect(distanceOf(CRANK_AXIS, INPUT_AXIS)).toBeCloseTo((36 + 76) * 0.0025 / 2, 12);
  expect(dir(INPUT_AXIS, CRANK_AXIS)).toBeCloseTo(50, 9);              // 50° above horizontal toward +z
  expect(DRUM_AXIS.y).toBeLessThan(OUTPUT_AXIS.y); expect(DRUM_AXIS.z).toBeGreaterThan(INPUT_AXIS.z); // below and in front
  expect(REAR_AXIS.y).toBe(OUTPUT_AXIS.y); expect(OUTPUT_AXIS.z - REAR_AXIS.z).toBeCloseTo(0.56, 12);
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
    out.push({ id, axis, x0: p.x - FACE_WIDTH / 2, x1: p.x + FACE_WIDTH / 2, r: tipRadius(shaft, g as GearNo) });
    // dog lugs stand off both faces at most
    out.push({ id, axis, x0: p.x - FACE_WIDTH / 2 - DIM.dogHeight, x1: p.x + FACE_WIDTH / 2 + DIM.dogHeight, r: DIM.dogOuterRadius });
  }
  return out;
}

test('forks clear every gear but their own groove, at both ends of their travel', () => {
  for (const x of [-1, 0, 1]) {
    const s = createSimulation().getState();
    for (const k of ['A', 'B', 'C'] as SliderId[]) s.sliders[k].x = x;
    poseAssembly(a, s, EMPTY);
    const cylinders = gearCylinders();
    for (const k of ['A', 'B', 'C'] as SliderId[]) {
      const fork = a.node(`fork${k}` as PartId);
      const own = cylinders.filter((c) => sliderOfGear(c.id.endsWith('in') ? 'input' : 'output', Number(c.id[4]) as GearNo) === k);
      const groove = fork.getWorldPosition(new THREE.Vector3()).x;
      let bad = 0;
      for (const mesh of meshesOf(fork)) for (const v of worldVertices(mesh)) {
        for (const c of cylinders) {
          if (v.x <= c.x0 + 1e-9 || v.x >= c.x1 - 1e-9) continue;
          const r = Math.hypot(v.y - c.axis.y, v.z - c.axis.z);
          if (r >= c.r) continue;
          // allowed: inside its own slider gear's groove, above the groove floor
          const inGroove = own.includes(c) && Math.abs(v.x - groove) <= FORK_GROOVE_WIDTH / 2 + 1e-9
            && r >= COLLAR_RADIUS[k] - COLLAR_CLEARANCE;
          if (!inGroove) bad++;
        }
      }
      expect(bad, `fork ${k} at x ${x}`).toBe(0);
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

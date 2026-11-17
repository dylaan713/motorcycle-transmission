import { beforeAll, expect, test } from 'vitest';
import * as THREE from 'three';
import { buildAssembly } from '../../src/view3d/assembly';
import type { Assembly } from '../../src/view3d/assembly';
import { poseAssembly } from '../../src/view3d/pose';
import { GHOST_EDGE_OPACITY, GHOST_FACE_OPACITY, setGhost } from '../../src/view3d/materials';
import { HOME, NARROW, cameraPose } from '../../src/view3d/camera';
import { torquePath } from '../../src/model/torquePath';
import type { PartId } from '../../src/model/parts';
import { COLORS } from '../../src/ui/tokens';
import { inGear, inp, run } from '../sim/helpers';
import { meshesOf } from './helpers';

let a: Assembly;
beforeAll(async () => { a = await buildAssembly(() => {}); });

const linesOf = (node: THREE.Object3D): THREE.LineBasicMaterial[] => {
  const out: THREE.LineBasicMaterial[] = [];
  node.traverse((o) => { if ((o as THREE.LineSegments).isLineSegments) out.push((o as THREE.LineSegments).material as THREE.LineBasicMaterial); });
  return out;
};
const lambert = (m: THREE.Mesh) => m.material as THREE.MeshLambertMaterial;
const hex = (c: THREE.Color) => '#' + c.getHexString();
const SIGNAL = COLORS.signal.toLowerCase(), THIRD = COLORS.third.toLowerCase();

test('the rear wheel and the crank are context parts; the chain, sprockets and primary gear are not', () => {
  for (const id of ['rearWheel', 'crank'] as const) {
    expect(a.contextParts, id).toContain(id);
    expect(a.node(id).userData.context, id).toBe(true);
  }
  for (const id of ['chain', 'rearSprocket', 'sprocket', 'primaryDrive'] as const) expect(a.contextParts, id).not.toContain(id);
});

test('ghosts: the wheel is edges and a faint fill that writes no depth; the crank is a solid stub with a ghost web', () => {
  for (const m of meshesOf(a.node('rearWheel'))) {
    expect(lambert(m).transparent).toBe(true);
    expect(lambert(m).opacity).toBe(GHOST_FACE_OPACITY);
    expect(lambert(m).depthWrite).toBe(false);
  }
  for (const l of linesOf(a.node('rearWheel'))) expect(l.opacity).toBe(GHOST_EDGE_OPACITY);
  const crank = meshesOf(a.node('crank'));
  expect(crank.some((m) => lambert(m).depthWrite && lambert(m).opacity === 1)).toBe(true); // the stub
  expect(crank.some((m) => !lambert(m).depthWrite)).toBe(true); // the web
  // setGhost round-trips
  const g = new THREE.Group(); const m = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshLambertMaterial()); g.add(m);
  setGhost(g, true); expect(lambert(m).opacity).toBe(GHOST_FACE_OPACITY); expect(g.userData.ghost).toBe(true);
  setGhost(g, false); expect(lambert(m).opacity).toBe(1); expect(lambert(m).depthWrite).toBe(true);
});

test('context parts never light their faces; on the path their edges carry the signal instead', () => {
  const s = run(inGear(3, 6000), inp({ throttle: 0.6 }), 0.2);
  const p = torquePath(s);
  expect(p.parts).toContain('rearWheel'); expect(p.parts).toContain('crank');
  poseAssembly(a, s, p);
  for (const id of a.contextParts) {
    expect(a.node(id).userData.torque, id).toBeGreaterThan(0);
    expect(a.node(id).userData.faceTorque, id).toBe(0);
    for (const m of meshesOf(a.node(id))) expect(hex(lambert(m).color), id).toBe(COLORS[lambert(m).userData.tone as 'steel1'].toLowerCase());
    for (const l of linesOf(a.node(id))) expect(hex(l.color), id).toBe(SIGNAL);
  }
  // still pickable
  for (const id of a.contextParts) expect(meshesOf(a.node(id)).every((m) => m.userData.partId === id)).toBe(true);
});

test('the path: lit faces with a floor, full-signal edges; parts off the path keep --third', () => {
  const s = run(inGear(3, 2500), inp({ throttle: 0.05 }), 0.2); // light torque
  const p = torquePath(s);
  expect(Math.abs(p.torque)).toBeLessThan(40);
  poseAssembly(a, s, p);
  for (const id of ['gear3in', 'gear3out', 'inputShaft', 'chain', 'rearSprocket'] as PartId[]) {
    expect(a.node(id).userData.faceTorque, id).toBeGreaterThanOrEqual(0.55);
    for (const l of linesOf(a.node(id))) expect(hex(l.color), id).toBe(SIGNAL);
  }
  for (const id of ['gear2in', 'shiftDrum', 'forkA'] as PartId[]) {
    expect(a.node(id).userData.torque, id).toBe(0);
    for (const l of linesOf(a.node(id))) expect(hex(l.color), id).toBe(THIRD);
  }
});

/** The part a ray from the camera to `target` meets first (with a hair of slack at the target itself). */
function firstHit(eye: THREE.Vector3, target: THREE.Vector3): PartId | null {
  a.root.updateMatrixWorld(true);
  const dir = target.clone().sub(eye);
  const ray = new THREE.Raycaster(eye, dir.clone().normalize(), 0, dir.length() + 0.002);
  const meshes: THREE.Object3D[] = [];
  a.root.traverse((o) => { if ((o as THREE.Mesh).isMesh && !a.contextParts.includes(o.userData.partId)) meshes.push(o); });
  const hits = ray.intersectObjects(meshes, false);
  return hits.length ? (hits[0].object.userData.partId as PartId) : null;
}

const GROUPS: Record<keyof Assembly['anchors'], PartId[]> = {
  clutch: ['clutchBasket', 'frictionPlates', 'steelPlates', 'clutchHub', 'pressurePlate'],
  inputShaft: ['inputShaft'],
  outputShaft: ['outputShaft'],
  forks: ['forkA', 'forkB', 'forkC'],
  shiftDrum: ['shiftDrum'],
  finalDrive: ['sprocket', 'chain'],
};

test('from the default camera every callout anchor sits on a visible surface of its own group', () => {
  poseAssembly(a, run(inGear(3, 6000), inp({ throttle: 0.4 }), 0.2), { parts: [], torque: 0, slipping: false, reach: 'none' });
  const eye = cameraPose(a.subject, HOME, 1.6).position;
  for (const [k, p] of Object.entries(a.anchors) as [keyof Assembly['anchors'], THREE.Vector3][]) {
    expect(GROUPS[k], `${k} hit ${firstHit(eye, p)}`).toContain(firstHit(eye, p));
  }
});

test('the default camera looks from the sprocket end, in front and above; the narrow one more head-on', () => {
  const pos = cameraPose(a.subject, HOME, 1.6).position.clone().sub(a.subject.centre);
  expect(pos.x).toBeGreaterThan(0); // the sprocket end
  expect(pos.z).toBeGreaterThan(0); // in front (+z)
  expect(pos.y).toBeGreaterThan(0); // above
  const narrow = cameraPose(a.subject, NARROW, 0.9).position.clone().sub(a.subject.centre);
  expect(Math.abs(narrow.x) / Math.abs(narrow.z)).toBeLessThan(Math.abs(pos.x) / Math.abs(pos.z));
});

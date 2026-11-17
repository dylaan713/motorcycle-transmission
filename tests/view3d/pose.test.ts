import { test, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { buildAssembly } from '../../src/view3d/assembly';
import type { TorquePath } from '../../src/model/torquePath';
import type { Assembly } from '../../src/view3d/assembly';
import { poseAssembly } from '../../src/view3d/pose';
import {
  DRUM_AXIS, FOLLOWER_OFFSETS, FORK_X, FRONT_PITCH_RADIUS, GEARBOX_PSI, PEDAL_SWING, PRIMARY_PSI, REAR_PITCH_RADIUS, SLIDER_AXIS,
  clutchX, forkReach,
} from '../../src/view3d/layout3d';
import { CENTRE_DISTANCE, MODULE, SLIDER_TRAVEL, gearAngle } from '../../src/model/geometry';
import type { GearNo, PartId } from '../../src/model/parts';
import { torquePath } from '../../src/model/torquePath';
import { PARAMS } from '../../src/sim/params';
import { createSimulation } from '../../src/sim/simulation';
import { clutchCapacityMax } from '../../src/sim/clutch';
import type { SimState, SliderId } from '../../src/sim/types';
import { deg } from '../../src/sim/units';
import { DIM } from '../../src/geo/dimensions';
import { gearProfile } from '../../src/geo/gear';
import { rotated } from '../../src/geo/outline';
import { CLUTCH, plateStackOffsets, springLength } from '../../src/geo/clutch';
import { DETENT_ARM, FORK_PIN_REACH, grooveAxialOffset, starWheelRadiusAt } from '../../src/geo/shift';
import { grooveCommand } from '../../src/sim/shiftDrum';
import { inGear, inp, run } from '../sim/helpers';
import { meshPenetration } from '../geo/helpers';
import { meshesOf, relAngle, toWorld, torqueAmount, worldAngle, wrapPi } from './helpers';

const EMPTY: TorquePath = { parts: [], torque: 0, slipping: false, reach: 'none' };

test('pose: rotations follow the simulation and meshing gears counter-rotate', async () => {
  const a = await buildAssembly(() => {}); const sim = inGear(3, 6000); const s = run(sim, inp({ throttle: 0.3 }), 0.2);
  poseAssembly(a, s, torquePath(s));
  expect(relAngle(a.node('gear1in'))).toBeCloseTo(wrapPi(gearAngle('input', 1, s.angles)), 6);
  expect(relAngle(a.node('gear1out'))).toBeCloseTo(wrapPi(gearAngle('output', 1, s.angles)), 6);
});

test('pose: sliders, forks and drum move; nothing else shifts axially', async () => {
  const a = await buildAssembly(() => {}); const s0 = createSimulation().getState();
  poseAssembly(a, s0, torquePath(s0)); a.root.updateMatrixWorld(true);
  const x0 = a.node('gear5out').getWorldPosition(new THREE.Vector3()).x, f0 = a.node('forkA').getWorldPosition(new THREE.Vector3()).x;
  const fixed0 = a.node('gear1out').getWorldPosition(new THREE.Vector3()).x;
  const s1 = createSimulation().getState(); s1.sliders.A.x = -1; s1.drum.angle = 0;
  poseAssembly(a, s1, torquePath(s1)); a.root.updateMatrixWorld(true);
  expect(a.node('gear5out').getWorldPosition(new THREE.Vector3()).x - x0).toBeCloseTo(-SLIDER_TRAVEL, 9);
  expect(a.node('forkA').getWorldPosition(new THREE.Vector3()).x - f0).toBeCloseTo(-SLIDER_TRAVEL, 9);
  expect(a.node('gear1out').getWorldPosition(new THREE.Vector3()).x).toBeCloseTo(fixed0, 12);
});

test('pose: the torque path lights exactly its parts', async () => {
  const a = await buildAssembly(() => {}); const s = run(inGear(4, 7000), inp({ throttle: 0.8 }), 0.2); const p = torquePath(s);
  poseAssembly(a, s, p);
  expect(torqueAmount(a.node('gear4in'))).toBeGreaterThan(0.3);
  expect(torqueAmount(a.node('gear3in'))).toBe(0);
});

// ---- one shared build for the checks below ----
let a: Assembly;
beforeAll(async () => { a = await buildAssembly(() => {}); });
const pose = (s: SimState): void => { poseAssembly(a, s, EMPTY); a.root.updateMatrixWorld(true); };
/** The first mesh under a node: a gear's teeth, a sprocket, a part's main body. */
const body = (id: PartId): THREE.Mesh => meshesOf(a.node(id))[0];

const STATES: [string, () => SimState][] = [
  ['rest', () => createSimulation().getState()],
  ['third under power', () => run(inGear(3, 6000), inp({ throttle: 0.3 }), 0.2)],
  ['sixth at speed', () => run(inGear(6, 9000), inp({ throttle: 1 }), 0.15)],
  ['first, clutch slipping', () => run(inGear(1, 3000), inp({ throttle: 0.6, clutchLever: 0.5 }), 0.25)],
];

test('posed gear pairs mesh without interpenetrating', () => {
  for (const [name, make] of STATES) {
    pose(make());
    for (const g of [1, 6, 3] as GearNo[]) {
      const [zA, zB] = PARAMS.gears[g];
      const A = body(`gear${g}in` as PartId), B = body(`gear${g}out` as PartId);
      const pa = A.getWorldPosition(new THREE.Vector3()), pb = B.getWorldPosition(new THREE.Vector3());
      expect(Math.hypot(pb.y - pa.y, pb.z - pa.z)).toBeCloseTo(CENTRE_DISTANCE, 12);
      const depth = meshPenetration(rotated(gearProfile(zA, MODULE), worldAngle(A)), zA, gearProfile(zB, MODULE), zB,
        CENTRE_DISTANCE, GEARBOX_PSI, worldAngle(B), 1);
      expect(depth, `pair ${g}, ${name}`).toBeLessThan(0.00005);
    }
    // primary: the crank's 36T and the basket's 76T ring (which is drawn in the turned clutch frame)
    const A = body('primaryDrive'), B = body('clutchBasket');
    const depth = meshPenetration(rotated(gearProfile(36, MODULE), worldAngle(A)), 36, gearProfile(76, MODULE), 76,
      (36 + 76) * MODULE / 2, PRIMARY_PSI, worldAngle(B), 1);
    expect(depth, `primary, ${name}`).toBeLessThan(0.00005);
  }
  // control: half a tooth off, the same check does find interference
  pose(createSimulation().getState());
  const A = body('gear1in'), B = body('gear1out');
  expect(meshPenetration(gearProfile(13, MODULE), 13, gearProfile(37, MODULE), 37, CENTRE_DISTANCE, GEARBOX_PSI,
    worldAngle(B) + Math.PI / 37, 1)).toBeGreaterThan(0.001);
  expect(worldAngle(A)).toBeCloseTo(0, 12);
});

/** Smallest angle between any slider dog and any gear lug centre, for one slider side. */
function lugSeparation(slider: SliderId, side: 'neg' | 'pos'): number {
  const d = a.rig.freeDogs.find((f) => f.slider === slider && f.side === side)!;
  const ring = meshesOf(d.ring)[0];
  const sliderGear = a.node(`gear${d.sliderGear}${d.shaft === 'input' ? 'in' : 'out'}` as PartId);
  const sign = side === 'neg' ? -1 : 1; // the slider's dogs are on its face toward that gear
  const sliderRing = meshesOf(sliderGear).find((m) => m.geometry === ring.geometry && m.getWorldPosition(new THREE.Vector3()).x * sign > sliderGear.getWorldPosition(new THREE.Vector3()).x * sign)!;
  const pitch = (2 * Math.PI) / PARAMS.dogs.count;
  const rel = worldAngle(sliderRing) - worldAngle(ring);
  return Math.min(...[-2, -1, 0, 1, 2].map((k) => Math.abs(wrapPi(rel - k * pitch))));
}

test('dogs: a locked slider sits in the gaps; a blocked one faces the lugs', () => {
  const lugs = deg(DIM.dogWidthDeg); // centre to centre when a dog and a lug just touch
  for (const g of [1, 2, 3, 4, 5, 6] as const) {
    const s = run(inGear(g, 5000), inp({ throttle: 0.4 }), 0.1);
    expect(s.lockedGear).toBe(g);
    pose(s);
    const id = (['A', 'B', 'C'] as SliderId[]).find((k) => PARAMS.sliders[k].neg === g || PARAMS.sliders[k].pos === g)!;
    const side = PARAMS.sliders[id].neg === g ? 'neg' : 'pos';
    expect(lugSeparation(id, side), `gear ${g}`).toBeGreaterThanOrEqual(lugs - 1e-9);
  }
  for (const [id, phi] of [['A', 40], ['B', 30], ['C', 50]] as const) {
    const sim = createSimulation();
    sim.setState({ sliders: { [id]: { x: -PARAMS.dogs.contactX, phi: deg(phi), blocked: true } } });
    const s = sim.getState();
    expect(s.sliders[id].blocked).toBe(true);
    pose(s);
    expect(lugSeparation(id, 'neg'), `blocked ${id}`).toBeLessThan(lugs);
  }
  // a patched dog phase moves the ring at the next pose
  const sim = createSimulation(); sim.setState({ sliders: { A: { x: -0.3, phi: deg(5) } } }); pose(sim.getState());
  const before = lugSeparation('A', 'neg');
  sim.setState({ sliders: { A: { phi: deg(30) } } }); pose(sim.getState());
  expect(Math.abs(lugSeparation('A', 'neg') - before)).toBeGreaterThan(deg(10));
});

test('forks: claw on the slider axis at its groove, guide pin in its drum groove', () => {
  for (const d of [0, 30, 45, 60, 90, 120, 150, 180, 210, 240, 270, 300]) {
    const s = createSimulation().getState();
    s.drum.angle = deg(d);
    for (const k of ['A', 'B', 'C'] as SliderId[]) s.sliders[k].x = grooveCommand(k, s.drum.angle);
    pose(s);
    const drum = body('shiftDrum');
    const toDrum = new THREE.Matrix4().copy(drum.matrixWorld).invert();
    for (const k of ['A', 'B', 'C'] as SliderId[]) {
      const fork = body(`fork${k}` as PartId);
      const claw = toWorld(fork, 0, forkReach(k), 0);
      expect(claw.y, `${k} claw`).toBeCloseTo(SLIDER_AXIS[k].y, 9); expect(claw.z).toBeCloseTo(SLIDER_AXIS[k].z, 9);
      expect(claw.x).toBeCloseTo(FORK_X[k] + s.sliders[k].x * SLIDER_TRAVEL, 9);
      const tip = toWorld(fork, 0, -FORK_PIN_REACH, 0);
      const r = Math.hypot(tip.y - DRUM_AXIS.y, tip.z - DRUM_AXIS.z);
      expect(r, `${k} pin depth at ${d}°`).toBeGreaterThan(DIM.drum.radius - DIM.drum.grooveDepth);
      expect(r).toBeLessThan(DIM.drum.radius - 0.002);
      // in the drum's own frame, the pin is on its groove's centre line at the drum's surface angle
      const local = tip.clone().applyMatrix4(toDrum);
      const surface = Math.atan2(local.z, local.y) - FOLLOWER_OFFSETS[k];
      const drumAngle = Math.min(Math.max(wrapPi(surface - deg(150)) + deg(150), 0), deg(300));
      expect(drumAngle, `${k} follower reads the drum angle`).toBeCloseTo(s.drum.angle, 9);
      expect(local.x, `${k} pin on groove centre at ${d}°`).toBeCloseTo(FORK_X[k] + grooveAxialOffset(k, drumAngle), 9);
    }
  }
});

test('detent roller rides the star wheel profile, dropping into the notches', () => {
  const rr = DETENT_ARM.rollerRadius;
  const radial: number[] = [];
  for (let d = 0; d <= 300; d += 2.5) {
    const s = createSimulation().getState(); s.drum.angle = deg(d); pose(s);
    const roller = toWorld(body('detentArm'), 0, DETENT_ARM.length, 0);
    const star = a.node('starWheel').rotation.x;
    let nearest = Infinity;
    for (let i = 0; i < 7200; i++) {
      const psi = (2 * Math.PI * i) / 7200, r = starWheelRadiusAt(psi);
      nearest = Math.min(nearest, Math.hypot(DRUM_AXIS.y + r * Math.cos(psi + star) - roller.y, DRUM_AXIS.z + r * Math.sin(psi + star) - roller.z));
    }
    expect(nearest, `drum at ${d}°`).toBeGreaterThan(rr - 0.00002);   // never sinks into the wheel
    expect(nearest, `drum at ${d}°`).toBeLessThan(rr + 0.00005);      // always touching it
    radial.push(Math.hypot(roller.y - DRUM_AXIS.y, roller.z - DRUM_AXIS.z));
  }
  // The 12° notches are narrower than the 10 mm roller, so it settles only about half a millimetre
  // into each (see the report); it is lowest at every detent and on the full radius between them.
  const at = (d: number) => radial[Math.round(d / 2.5)];
  const full = DIM.starWheel.radius + rr;
  for (const d of [0, 60, 120, 180, 240, 300]) expect(at(d), `seated at ${d}°`).toBeLessThan(full - 0.0004);
  expect(at(30)).toBeLessThan(full - 0.0001);    // the shallower neutral notch
  expect(at(30)).toBeGreaterThan(at(60));
  for (const d of [15, 45, 90, 150, 210, 270]) expect(at(d), `between at ${d}°`).toBeCloseTo(full, 9);
});

test('clutch plates part as capacity falls; springs end on the hub seats', () => {
  for (const capacity of [clutchCapacityMax, clutchCapacityMax / 2, 0]) {
    const s = createSimulation().getState(); s.clutch.capacity = capacity; pose(s);
    const stack = plateStackOffsets(1 - capacity / clutchCapacityMax);
    meshesOf(a.node('frictionPlates')).forEach((m, i) => {
      expect(m.getWorldPosition(new THREE.Vector3()).x).toBeCloseTo(clutchX(stack.friction[i]), 12);
    });
    expect(meshesOf(a.node('steelPlates')).length).toBe(stack.steel.length);
    expect(a.node('pressurePlate').getWorldPosition(new THREE.Vector3()).x).toBeCloseTo(clutchX(stack.pressurePlate), 12);
    const springs = meshesOf(a.node('pressurePlate')).slice(1);
    expect(springs.length).toBe(DIM.clutch.springCount);
    for (const m of springs) {
      m.geometry.computeBoundingBox();
      const bb = m.geometry.boundingBox!;
      const x0 = toWorld(m, bb.min.x, 0, 0).x, x1 = toWorld(m, bb.max.x, 0, 0).x;
      // to 10 µm: the wire's round end stands a micrometre or so off the spring's nominal ends
      expect(x0).toBeCloseTo(clutchX(stack.pressurePlate + CLUTCH.springFace), 5);
      expect(x1).toBeCloseTo(clutchX(CLUTCH.springSeat), 5);
      expect(x0 - x1).toBeCloseTo(springLength(stack.pressurePlate), 5);
    }
  }
  // released: the stack has opened
  const s = createSimulation().getState(); s.clutch.capacity = 0; pose(s);
  const open = a.node('pressurePlate').getWorldPosition(new THREE.Vector3()).x;
  s.clutch.capacity = clutchCapacityMax; pose(s);
  expect(a.node('pressurePlate').getWorldPosition(new THREE.Vector3()).x - open).toBeCloseTo(15 * DIM.clutch.gapOpen, 9);
});

test('pedal and shift shaft rock ±12° with pedal travel; a state without travel rests', () => {
  const s = createSimulation().getState();
  (s.pedal as { travel?: number }).travel = 1; pose(s);
  expect(relAngle(a.node('pedal'))).toBeCloseTo(-PEDAL_SWING, 12);
  expect(relAngle(a.node('shiftShaft'))).toBeCloseTo(-PEDAL_SWING, 12);
  (s.pedal as { travel?: number }).travel = -0.5; pose(s);
  expect(relAngle(a.node('pedal'))).toBeCloseTo(0.5 * PEDAL_SWING, 12);
  delete (s.pedal as { travel?: number }).travel; pose(s);
  expect(relAngle(a.node('pedal'))).toBeCloseTo(0, 12);
  expect(PEDAL_SWING).toBeCloseTo(deg(12), 12);
});

test('chain: links close the loop and rollers sit in sprocket seats as it runs', () => {
  const { count, spacing } = a.rig.chain;
  expect(count % 2).toBe(0);
  const m = new THREE.Matrix4();
  let worstFront = 0, worstRear = 0, worstJoin = 0;
  for (const t of [0, 0.37, 2.1, 25.3, 500.9]) {
    const s = createSimulation().getState(); s.angles.output = t; pose(s);
    const chain = a.node('chain');
    const rollers: THREE.Vector3[] = [], ends: THREE.Vector3[] = [];
    for (let i = 0; i < count; i++) {
      (i % 2 === 0 ? a.chain.inner : a.chain.outer).getMatrixAt(i >> 1, m);
      rollers.push(new THREE.Vector3().applyMatrix4(m).applyMatrix4(chain.matrixWorld));
      ends.push(new THREE.Vector3(0, DIM.chain.pitch, 0).applyMatrix4(m).applyMatrix4(chain.matrixWorld));
    }
    for (let i = 0; i < count; i++) worstJoin = Math.max(worstJoin, ends[i].distanceTo(rollers[(i + 1) % count]));
    for (const [id, teeth, radius] of [['sprocket', PARAMS.final.front, FRONT_PITCH_RADIUS], ['rearSprocket', PARAMS.final.rear, REAR_PITCH_RADIUS]] as const) {
      const sp = body(id); const c = sp.getWorldPosition(new THREE.Vector3()); const turn = worldAngle(sp);
      for (const r of rollers) {
        if (Math.abs(Math.hypot(r.y - c.y, r.z - c.z) - radius) > 1e-6) continue; // on this sprocket's wrap
        const off = wrapPi(Math.atan2(r.z - c.z, r.y - c.y) - turn - Math.PI / teeth);
        const k = Math.round(off / ((2 * Math.PI) / teeth));
        const err = Math.abs(off - (k * 2 * Math.PI) / teeth) * radius;
        if (id === 'sprocket') worstFront = Math.max(worstFront, err); else worstRear = Math.max(worstRear, err);
      }
    }
  }
  expect(spacing * count).toBeCloseTo(a.rig.chain.path.length, 12);
  expect(worstJoin, 'a link ends on the next roller').toBeLessThan(0.0003);
  expect(worstFront, 'front rollers off their seats, m').toBeLessThan(0.001); // measured 0.58 mm
  expect(worstRear, 'rear rollers off their seats, m').toBeLessThan(0.001);   // measured 0.70 mm
});

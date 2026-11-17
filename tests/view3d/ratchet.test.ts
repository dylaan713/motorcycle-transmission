import { beforeAll, expect, test } from 'vitest';
import * as THREE from 'three';
import {
  CONTACT, PAWLS, PAWL_LENGTH, PEDAL_SWING, pawlClearance, PIN_COUNT, PIN_PITCH, REST_GAP, engagedPin, nosePosition, pinAngle, ratchetPose,
} from '../../src/view3d/ratchet';
import type { PawlId } from '../../src/view3d/ratchet';
import { DRUM_AXIS, PEDAL_LIFT, PEDAL_REST, SHIFT_SHAFT_AXIS } from '../../src/view3d/layout3d';
import { buildAssembly } from '../../src/view3d/assembly';
import type { Assembly } from '../../src/view3d/assembly';
import { poseAssembly } from '../../src/view3d/pose';
import { DIM } from '../../src/geo/dimensions';
import { PARAMS } from '../../src/sim/params';
import { createSimulation } from '../../src/sim/simulation';
import type { SimState } from '../../src/sim/types';
import { deg } from '../../src/sim/units';
import { inGear } from '../sim/helpers';
import { keyframes, runSource } from '../../src/sim/inputScript';
import { meshesOf, relAngle, toWorld } from './helpers';

const R = DIM.shiftPins.pitchRadius;
const DETENTS = Object.values(PARAMS.drum.detents).map(deg);
const GEARS = [1, 2, 3, 4, 5, 6].map((g) => deg(PARAMS.drum.detents[g as 1]));
const STROKE = deg(PARAMS.drum.strokeDeg);
const pin = (j: number, drum: number) => {
  const a = pinAngle(j, drum);
  return { y: DRUM_AXIS.y + R * Math.cos(a), z: DRUM_AXIS.z + R * Math.sin(a) };
};
const state = (drum: number, start: number, travel: number): SimState => {
  const s = createSimulation().getState();
  s.drum.angle = drum; s.pedal.strokeStartAngle = start; s.pedal.travel = travel;
  return s;
};
/**
 * Nearest any pin centre comes to each nose, with `skip` (the pin being pushed) left out; and every
 * pawl's whole body checked against every other pin: none may enter it.
 */
function nearest(s: SimState, skip: Partial<Record<PawlId, number>> = {}): Record<PawlId, number> {
  const r = ratchetPose(s, { turn: 0, up: 0, down: 0 });
  const out = { up: Infinity, down: Infinity };
  for (const id of ['up', 'down'] as const) {
    const n = nosePosition(id, r.turn, r[id]);
    for (let j = 0; j < PIN_COUNT; j++) {
      if (j === skip[id]) continue;
      const c = pin(j, s.drum.angle);
      out[id] = Math.min(out[id], Math.hypot(n.y - c.y, n.z - c.z));
      expect(pawlClearance(id, r.turn, r[id], c), `${id} body on pin ${j}`).toBeGreaterThan(-1e-9);
    }
  }
  return out;
}

test('six pins a detent step apart; the pedal trails rearward and travel +1 lifts its toe; a full stroke is a believable rock', () => {
  expect(PIN_COUNT).toBe(6);
  expect(PIN_PITCH).toBeCloseTo(deg(60), 12);
  expect(Math.sin(PEDAL_REST)).toBeLessThan(0); // the toe points rearward (-z)
  expect(PEDAL_LIFT).toBe(1);
  expect(PEDAL_SWING).toBeGreaterThan(deg(10)); expect(PEDAL_SWING).toBeLessThan(deg(20));
});

test('at rest, in every gear and in neutral, each pawl sits untilted and clear of every pin', () => {
  for (const d of DETENTS) {
    const r = ratchetPose(state(d, d, 0), { turn: 0, up: 0, down: 0 });
    expect(r.turn).toBe(0); expect(r.up, `up tilt at ${d}`).toBe(0); expect(r.down, `down tilt at ${d}`).toBe(0);
    const n = nearest(state(d, d, 0));
    for (const id of ['up', 'down'] as const) expect(n[id], `${id} at ${(d * 180) / Math.PI}°`).toBeGreaterThan(CONTACT + 0.0004);
  }
  // in gear, each nose waits REST_GAP behind the pin it will push
  for (const g of GEARS) for (const id of ['up', 'down'] as const) {
    const c = pin(engagedPin(id, g), g), n = PAWLS[id].nose;
    expect(Math.hypot(n.y - c.y, n.z - c.z)).toBeCloseTo(CONTACT + REST_GAP, 9);
  }
});

test('full travel has pushed the engaged pin round one detent step (plus the simulation\'s 2° overshoot), nose on pin', () => {
  for (const id of ['up', 'down'] as const) {
    const dir = PAWLS[id].dir;
    for (const start of DETENTS) {
      const end = start + dir * (Math.abs(start - deg(30)) < 1e-9 ? deg(PARAMS.drum.strokeFromNeutralDeg) : STROKE);
      if (end < -1e-9 || end > deg(300) + 1e-9) continue; // past first or sixth: the drum stops, and so does the pedal
      const j = engagedPin(id, start);
      const r = ratchetPose(state(end, start, dir), { turn: 0, up: 0, down: 0 });
      expect(r.turn, `${id} from ${(start * 180) / Math.PI}°`).toBeCloseTo(dir * PEDAL_SWING, 9); // reached full travel, not stopped early
      expect(r[id]).toBe(0);
      const n = nosePosition(id, r.turn, r[id]), c = pin(j, end);
      expect(Math.hypot(n.y - c.y, n.z - c.z), 'the nose is on the pin').toBeCloseTo(CONTACT, 9);
      // the engaged pin went round from where the stroke found it, by one step and the overshoot
      const moved = dir * (pinAngle(j, end) - pinAngle(j, start));
      if (Math.abs(start - deg(30)) > 1e-9) expect(Math.abs(moved - PIN_PITCH)).toBeLessThan(deg(2.5));
    }
  }
});

test('the shaft stops where the nose meets a pin the drum will not let go: the pedal is blocked, not pushed through', () => {
  // first gear, pedal pressed down: the drum cannot turn below first
  const r = ratchetPose(state(0, 0, -1), { turn: 0, up: 0, down: 0 });
  expect(-r.turn).toBeGreaterThan(0); expect(-r.turn).toBeLessThan(deg(2));
  const n = nosePosition('down', r.turn, r.down), c = pin(engagedPin('down', 0), 0);
  expect(Math.hypot(n.y - c.y, n.z - c.z)).toBeCloseTo(CONTACT, 9);
  // a loaded gearbox holding the drum part way: the pedal stops at the pin
  const half = ratchetPose(state(deg(120 + 20), deg(120), 1), { turn: 0, up: 0, down: 0 });
  expect(half.turn).toBeLessThan(PEDAL_SWING * 0.6);
});

test('a real stroke: from third, clutch in, pedal up held; the pawl rides its pin; on release it rides back over the next and re-arms', () => {
  const sim = inGear(3, 6000);
  const s1 = runSource(sim, keyframes({ clutchLever: [[0, 1]], pedal: [[0.2, 0], [0.26, 1]] }), 0.6);
  expect(s1.drum.angle).toBeGreaterThan(deg(180));
  const r = ratchetPose(s1, { turn: 0, up: 0, down: 0 });
  expect(r.turn).toBeGreaterThan(0.95 * PEDAL_SWING);
  const j = engagedPin('up', s1.pedal.strokeStartAngle);
  const n = nosePosition('up', r.turn, r.up), c = pin(j, s1.drum.angle);
  expect(Math.abs(Math.hypot(n.y - c.y, n.z - c.z) - CONTACT), 'nose on its pin, m').toBeLessThan(0.0002);
  // the return: travel falls back to 0 over the settled drum; no nose ever enters a pin
  let tilted = 0;
  for (let t = 1; t >= 0; t -= 0.02) {
    const s = { ...s1, pedal: { ...s1.pedal, travel: Math.max(0, t) }, drum: { ...s1.drum, angle: deg(180) } };
    for (const [id, d] of Object.entries(nearest(s, { up: t > 0 ? j : undefined }))) expect(d, `${id} at travel ${t.toFixed(2)}`).toBeGreaterThan(CONTACT - 1e-9);
    const p = ratchetPose(s, { turn: 0, up: 0, down: 0 });
    if (Math.abs(p.up) > deg(5)) tilted++;
  }
  expect(tilted, 'the up pawl rides over the next pin on the way back').toBeGreaterThan(0);
  const back = ratchetPose(state(deg(180), deg(180), 0), { turn: 0, up: 0, down: 0 });
  expect(back).toEqual({ turn: 0, up: 0, down: 0 });
});

test('no nose ever enters a pin, across strokes from every detent and every drum angle a stroke can reach', () => {
  for (const start of DETENTS) for (const travel of [-1, -0.7, -0.3, 0.3, 0.7, 1]) {
    const dir = Math.sign(travel);
    for (let k = 0; k <= 32; k++) {
      const drum = Math.min(deg(300), Math.max(0, start + (dir * STROKE * k) / 32));
      const s = state(drum, start, travel);
      const pawl: PawlId = dir > 0 ? 'up' : 'down';
      const n = nearest(s, { [pawl]: engagedPin(pawl, start) });
      for (const [id, d] of Object.entries(n)) expect(d, `${id}, start ${start}, travel ${travel}, drum ${drum}`).toBeGreaterThan(CONTACT - 1e-9);
      const r = ratchetPose(s, { turn: 0, up: 0, down: 0 });
      const own = nosePosition(pawl, r.turn, r[pawl]), c = pin(engagedPin(pawl, start), drum);
      expect(Math.hypot(own.y - c.y, own.z - c.z)).toBeGreaterThan(CONTACT - 1e-9); // and never through the one it pushes
    }
  }
  // the drum resting between detents (a false neutral): the pawls sit on the pins, not in them
  for (let d = 0; d <= 300; d += 2.5) {
    for (const v of Object.values(nearest(state(deg(d), deg(d), 0)))) expect(v, `${d}°`).toBeGreaterThan(CONTACT - 1e-9);
  }
});

// ---- the assembly draws what the kinematics say ----
let a: Assembly;
beforeAll(async () => { a = await buildAssembly(() => {}); });

test('the drawn pins, pawl noses and shaft follow the ratchet', () => {
  for (const s of [state(deg(60), deg(60), 0), state(deg(120), deg(60), 1), state(deg(150), deg(60), 0.4)]) {
    poseAssembly(a, s, { parts: [], torque: 0, slipping: false, reach: 'none' }); a.root.updateMatrixWorld(true);
    const r = ratchetPose(s, { turn: 0, up: 0, down: 0 });
    expect(relAngle(a.node('shiftShaft'))).toBeCloseTo(r.turn, 12);
    expect(relAngle(a.node('pedal'))).toBeCloseTo(r.turn, 12);
    for (const id of ['up', 'down'] as const) {
      const holder = a.rig.pawls[id].holder, body = meshesOf(holder)[0];
      const n = toWorld(body, 0, PAWL_LENGTH, 0), want = nosePosition(id, r.turn, r[id]);
      expect(n.y).toBeCloseTo(want.y, 9); expect(n.z).toBeCloseTo(want.z, 9);
    }
    // each pin's centre line, found from the drum's pin mesh
    const pins = meshesOf(a.node('shiftDrum')).find((m) => {
      m.geometry.computeBoundingBox(); return m.geometry.boundingBox!.min.x > 0.05;
    })!;
    const p = pins.geometry.getAttribute('position');
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i += 7) {
      v.fromBufferAttribute(p, i).applyMatrix4(pins.matrixWorld);
      const best = Math.min(...Array.from({ length: PIN_COUNT }, (_, j) => { const c = pin(j, s.drum.angle); return Math.hypot(v.y - c.y, v.z - c.z); }));
      expect(best).toBeLessThan(DIM.shiftPins.radius + 1e-7);
    }
  }
});

test('no part of a pawl passes through a pin or the drum axle, in strokes and at rest', () => {
  const pins = meshesOf(a.node('shiftDrum')).find((m) => { m.geometry.computeBoundingBox(); return m.geometry.boundingBox!.min.x > 0.05; })!;
  pins.geometry.computeBoundingBox();
  const px1 = pins.geometry.boundingBox!.max.x;
  for (const s of [state(0, 0, 0), state(deg(30), deg(30), 0), state(deg(90), deg(90), 0), state(deg(122), deg(60), 1),
    state(deg(120), deg(60), 0.5), state(deg(120), deg(60), 0.1), state(deg(60), deg(120), -1), state(deg(120), deg(180), -0.5)]) {
    poseAssembly(a, s, { parts: [], torque: 0, slipping: false, reach: 'none' }); a.root.updateMatrixWorld(true);
    for (const id of ['up', 'down'] as const) {
      const body = meshesOf(a.rig.pawls[id].holder)[0], p = body.geometry.getAttribute('position'), v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(body.matrixWorld);
        expect(v.x).toBeLessThan(px1); // the pawls overlap the pins axially...
        for (let j = 0; j < PIN_COUNT; j++) {
          const c = pin(j, s.drum.angle);
          expect(Math.hypot(v.y - c.y, v.z - c.z), `${id} vertex in pin ${j}, drum ${s.drum.angle.toFixed(3)} start ${s.pedal.strokeStartAngle.toFixed(3)} travel ${s.pedal.travel}, vertex ${i}`).toBeGreaterThan(DIM.shiftPins.radius - 1e-6); // ...but never enter one
        }
        expect(Math.hypot(v.y - DRUM_AXIS.y, v.z - DRUM_AXIS.z)).toBeGreaterThan(DIM.starWheelMount.boreRadius);
      }
    }
  }
});

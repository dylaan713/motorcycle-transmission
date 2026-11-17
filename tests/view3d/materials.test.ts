import { expect, test } from 'vitest';
import * as THREE from 'three';
import { setTorque, torqueColor, withEdges } from '../../src/view3d/materials';
import { COLORS } from '../../src/ui/tokens';

const hsl = (c: THREE.Color) => c.getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace);
const signalHue = hsl(new THREE.Color(COLORS.signal)).h;
const hueGap = (h: number) => Math.min(Math.abs(h - signalHue), 1 - Math.abs(h - signalHue)) * 360;

test('torque colour: the tone at 0, the signal at 1, clearly orange from the 0.55 floor up', () => {
  const c = new THREE.Color();
  expect('#' + torqueColor(c, 'steel3', 0).getHexString()).toBe(COLORS.steel3.toLowerCase());
  expect('#' + torqueColor(c, 'steel3', 1).getHexString()).toBe(COLORS.signal.toLowerCase());
  for (const tone of ['steel2', 'steel3', 'steel4', 'steel5'] as const) for (const a of [0.55, 0.75, 1]) {
    const { h, s } = hsl(torqueColor(c, tone, a));
    expect(hueGap(h), `${tone} at ${a}`).toBeLessThan(12); // still the signal's hue, not pink or brown
    expect(s, `${tone} at ${a}`).toBeGreaterThan(0.45);
  }
  // any amount above 0 is on the path: the signal's hue, at the tone's brightness
  expect(hueGap(hsl(torqueColor(c, 'steel4', 0.01)).h)).toBeLessThan(12);
  // brightness climbs with the amount
  const lum = (a: number) => hsl(torqueColor(c, 'steel3', a)).l;
  expect(lum(0.55)).toBeLessThan(lum(0.75)); expect(lum(0.75)).toBeLessThan(lum(1));
});

test('setTorque and the highlight share torqueColor; edges go full signal on the path', () => {
  const g = withEdges(new THREE.BoxGeometry(), 'steel4');
  setTorque(g, 0.55);
  const m = (g.children[0] as THREE.Mesh).material as THREE.MeshLambertMaterial;
  expect(m.color.equals(torqueColor(new THREE.Color(), 'steel4', 0.55))).toBe(true);
  const line = (g.children[1] as THREE.LineSegments).material as THREE.LineBasicMaterial;
  expect('#' + line.color.getHexString()).toBe(COLORS.signal.toLowerCase());
  setTorque(g, 0);
  expect('#' + line.color.getHexString()).toBe(COLORS.third.toLowerCase());
});

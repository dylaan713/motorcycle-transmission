import type { BufferGeometry } from 'three';
import { Vector2 } from 'three';
import { arc, circle, polar, segmentsFor } from './outline';
import { prism, toGeometry } from './mesh';

/**
 * Roller chain sprockets, centred on the origin with the axis along +x, tooth 0 centred on angle 0.
 * Tooth form after ISO 606: each roller seat is an arc a little larger than the roller, centred on
 * the pitch circle, and each flank is an arc tangent to the seat at the end of the seating angle.
 */

const BORE_CHORD = 0.002;

/** Radius of the circle through the roller centres. */
export const sprocketPitchRadius = (teeth: number, pitch: number): number => pitch / (2 * Math.sin(Math.PI / teeth));

const dir = (a: number): Vector2 => new Vector2(Math.cos(a), Math.sin(a));

/** Closed outline, counter-clockwise, first point not repeated. */
export function sprocketOutline(teeth: number, pitch: number, rollerRadius: number): Vector2[] {
  const z = teeth, d1 = 2 * rollerRadius;
  const rp = sprocketPitchRadius(z, pitch);
  const a = Math.PI / z;
  const rs = 0.505 * d1 + 0.00005;                                   // seating radius
  const re = (0.12 * d1 * (z + 2) + 0.008 * d1 * (z * z + 180)) / 2; // flank radius, mid ISO range
  const halfSeat = ((140 - 90 / z) / 2) * (Math.PI / 180);           // half the seating angle
  const ra = rp + (pitch * (2.25 - 1.6 / z)) / 4 - rollerRadius;     // tip radius, mid ISO range
  // right half of tooth 0: seat centred at -a, from its bottom to the tooth's tip centre
  const seat = polar(rp, -a);
  const inward = Math.PI - a;          // direction from the seat centre to the sprocket centre
  const e = inward - halfSeat;         // end of the seating arc, turning toward tooth 0
  const out = arc(rs, inward, e, (8 * Math.PI) / 180, seat);
  const f = seat.clone().addScaledVector(dir(e), rs + re); // flank centre, tangent to the seat at e
  // flank point at phi: f + re dir(e + π + phi); solve |point| = ra for the first phi > 0
  const k = (ra * ra - f.lengthSq() - re * re) / (2 * re);
  const eps = Math.atan2(f.y, f.x);
  const twoPi = 2 * Math.PI;
  const wrap = (x: number): number => ((x % twoPi) + twoPi) % twoPi;
  const phiTip = Math.min(...[1, -1].map((s) => wrap(eps + s * Math.acos(k / f.length()) - e - Math.PI)));
  const flank = (phi: number): Vector2 => f.clone().addScaledVector(dir(e + Math.PI + phi), re);
  const tip = flank(phiTip);
  if (!(tip.y < 0)) throw new Error(`sprocket of ${teeth} teeth has pointed teeth`);
  for (let i = 1; i < 4; i++) out.push(flank((phiTip * i) / 4));
  const tipAngle = Math.atan2(tip.y, tip.x);
  out.push(...arc(ra, tipAngle, 0));
  const mirror = out.slice(1, -1).map((p) => new Vector2(p.x, -p.y)).reverse();
  const tooth = [...out, ...mirror];
  const all: Vector2[] = [];
  for (let n = 0; n < z; n++) for (const p of tooth) all.push(p.clone().rotateAround(new Vector2(), 2 * a * n));
  return all;
}

export function sprocket(o: { teeth: number; pitch: number; rollerRadius: number; thickness: number; boreRadius: number }): BufferGeometry {
  const bore = circle(o.boreRadius, segmentsFor(o.boreRadius, BORE_CHORD, 24));
  const outline = sprocketOutline(o.teeth, o.pitch, o.rollerRadius);
  return toGeometry([prism(outline, [bore], -o.thickness / 2, o.thickness / 2)]);
}

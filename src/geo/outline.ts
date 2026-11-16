import { Vector2 } from 'three';

/**
 * 2D outlines in a part's cross-section plane. A Vector2 (x, y) here is the world point (y, z), so
 * the polar angle of a Vector2 is the angle about the part's x axis, measured from +y toward +z.
 */

/** Largest angle between neighbouring points on a sampled arc, rad. */
export const ARC_STEP = (4 * Math.PI) / 180;

export const polar = (r: number, a: number): Vector2 => new Vector2(r * Math.cos(a), r * Math.sin(a));

/** Points on a circle of radius r about `centre` from angle a0 to a1, both ends included. */
export function arc(r: number, a0: number, a1: number, step = ARC_STEP, centre = new Vector2()): Vector2[] {
  const n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / step));
  const out: Vector2[] = [];
  for (let i = 0; i <= n; i++) out.push(polar(r, a0 + ((a1 - a0) * i) / n).add(centre));
  return out;
}

/** A full circle of n points, counter-clockwise, the first at angle a0. */
export function circle(r: number, n: number, a0 = 0, centre = new Vector2()): Vector2[] {
  const out: Vector2[] = [];
  for (let i = 0; i < n; i++) out.push(polar(r, a0 + (2 * Math.PI * i) / n).add(centre));
  return out;
}

/** Segments for a circle of radius r so that no chord is longer than about `chord` metres. */
export const segmentsFor = (r: number, chord: number, min = 12): number =>
  Math.max(min, Math.ceil((2 * Math.PI * r) / chord));

/**
 * A ring that alternates between two radii with radial flanks: `count` high lands of angular width
 * highFrac × pitch centred on angles k × pitch + a0, low lands between them. Splines, plate tabs
 * and plate teeth are all this shape.
 */
export function castellated(rLow: number, rHigh: number, count: number, highFrac: number, a0 = 0): Vector2[] {
  const pitch = (2 * Math.PI) / count;
  const half = (highFrac * pitch) / 2;
  const out: Vector2[] = [];
  for (let k = 0; k < count; k++) {
    const c = a0 + k * pitch;
    out.push(...arc(rHigh, c - half, c + half));
    out.push(...arc(rLow, c + half, c + pitch - half));
  }
  return out;
}

/**
 * Outline around two circles, radius r1 at the origin and r2 at (length, 0), joined by their outer
 * tangents (a lever or link plate), counter-clockwise.
 */
export function capsule(r1: number, r2: number, length: number, step = ARC_STEP): Vector2[] {
  const b = Math.asin((r1 - r2) / length);
  const far = new Vector2(length, 0);
  const right = arc(r2, -(Math.PI / 2 - b), Math.PI / 2 - b, step, far);
  const left = arc(r1, Math.PI / 2 - b, (3 * Math.PI) / 2 + b, step);
  return [...right, ...left];
}

/** Rotate every point by angle a about the origin. */
export const rotated = (pts: Vector2[], a: number): Vector2[] =>
  pts.map((p) => p.clone().rotateAround(new Vector2(), a));

import type { BufferGeometry } from 'three';
import { castellated } from './outline';
import { lathe, prism, toGeometry } from './mesh';

/** Shafts centred on the origin, axis along +x. */

/** Round segments for a plain shaft. */
const SEGMENTS = 48;
/** End chamfer of a plain shaft, as a fraction of its radius. */
const CHAMFER = 0.08;

/** A shaft with `splines` straight-sided splines (spline 0 on +y), each half the spline pitch wide. */
export function splinedShaft(o: { radius: number; length: number; splines: number; splineDepth: number }): BufferGeometry {
  const outline = castellated(o.radius - o.splineDepth, o.radius, o.splines, 0.5);
  return toGeometry([prism(outline, [], -o.length / 2, o.length / 2)]);
}

/** A round shaft with chamfered ends. */
export function plainShaft(o: { radius: number; length: number }): BufferGeometry {
  const h = o.length / 2, c = CHAMFER * o.radius;
  return toGeometry([lathe([[-h, 0], [-h, o.radius - c], [-h + c, o.radius], [h - c, o.radius], [h, o.radius - c], [h, 0]], SEGMENTS)]);
}

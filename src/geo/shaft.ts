import type { BufferGeometry } from 'three';
import { capsule, castellated, rotated } from './outline';
import { lathe, prism, toGeometry, translate } from './mesh';
import type { Solid } from './mesh';

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

/** A plain sleeve (a collar or spacer) centred on the origin along x. */
export function sleeve(o: { boreRadius: number; radius: number; length: number }): BufferGeometry {
  const h = o.length / 2;
  return toGeometry([lathe([[-h, o.boreRadius], [-h, o.radius], [h, o.radius], [h, o.boreRadius]], SEGMENTS)]);
}

/**
 * A crankshaft along x from x0 to x1: main journals between the throws, and at each throw a crank
 * pin `throwRadius` off the axis at `angle` (from +y toward +z) between two webs.
 */
export function crankshaft(o: {
  journalRadius: number; x0: number; x1: number; throws: readonly { x: number; angle: number }[];
  throwRadius: number; pinRadius: number; pinLength: number; webThickness: number; webRadius: number;
}): BufferGeometry {
  const half = o.pinLength / 2 + o.webThickness;
  const throws = [...o.throws].sort((a, b) => a.x - b.x);
  const solids: Solid[] = [];
  let from = o.x0;
  for (const t of [...throws, null]) {
    const to = t === null ? o.x1 : t.x - half;
    if (to <= from) throw new Error('crank throws overlap each other or the ends');
    solids.push(lathe([[from, 0], [from, o.journalRadius], [to, o.journalRadius], [to, 0]], SEGMENTS));
    if (t === null) break;
    const web = rotated(capsule(o.webRadius, o.pinRadius + 0.004, o.throwRadius), t.angle);
    const p = o.pinLength / 2;
    solids.push(prism(web, [], t.x - half, t.x - p), prism(web, [], t.x + p, t.x + half));
    const pin = lathe([[t.x - p, 0], [t.x - p, o.pinRadius], [t.x + p, o.pinRadius], [t.x + p, 0]], SEGMENTS);
    solids.push(translate(pin, 0, o.throwRadius * Math.cos(t.angle), o.throwRadius * Math.sin(t.angle)));
    from = t.x + half;
  }
  return toGeometry(solids);
}

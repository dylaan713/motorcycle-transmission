import { BufferGeometry, Float32BufferAttribute, Vector2 } from 'three';
import { DIM } from './dimensions';
import { arc } from './outline';
import { lathe, prism, rotateX, toGeometry } from './mesh';
import type { Solid } from './mesh';

/**
 * Chain path, chain links and rear wheel.
 *
 * The chain loop lies in the y-z plane (sprocket axes along x): front sprocket centred on the
 * origin, rear sprocket at z = -centreDistance. s = 0 is where the top run meets the front
 * sprocket; s grows the way the chain moves when the bike goes forward: forward along the top
 * (tight) run, round the front sprocket, back along the bottom run and round the rear sprocket.
 * `tangent` is the direction of travel as an angle about x: (y, z) ∝ (cos, sin).
 */

const TWO_PI = 2 * Math.PI;
const wrapPi = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

type Piece =
  | { kind: 'arc'; length: number; cy: number; cz: number; r: number; a0: number }
  | { kind: 'line'; length: number; y0: number; z0: number; dy: number; dz: number };

export function chainPath(o: { frontRadius: number; rearRadius: number; centreDistance: number }): {
  length: number; pointAt(s: number): { z: number; y: number; tangent: number };
} {
  const { frontRadius: rf, rearRadius: rr, centreDistance: d } = o;
  if (d <= Math.abs(rr - rf)) throw new Error('sprockets overlap');
  // the straight runs touch each sprocket at angle ±β from its top or bottom, tilted toward the front
  const b = Math.asin((rr - rf) / d);
  const at = (cz: number, r: number, a: number): [number, number] => [r * Math.cos(a), cz + r * Math.sin(a)];
  const line = (from: [number, number], to: [number, number]): Piece => {
    const dy = to[0] - from[0], dz = to[1] - from[1], length = Math.hypot(dy, dz);
    return { kind: 'line', length, y0: from[0], z0: from[1], dy: dy / length, dz: dz / length };
  };
  const pieces: Piece[] = [
    { kind: 'arc', length: rf * (Math.PI - 2 * b), cy: 0, cz: 0, r: rf, a0: b },
    line(at(0, rf, Math.PI - b), at(-d, rr, Math.PI - b)),
    { kind: 'arc', length: rr * (Math.PI + 2 * b), cy: 0, cz: -d, r: rr, a0: Math.PI - b },
    line(at(-d, rr, b), at(0, rf, b)),
  ];
  const length = pieces.reduce((sum, p) => sum + p.length, 0);
  return {
    length,
    pointAt(s: number) {
      let u = ((s % length) + length) % length;
      for (const p of pieces) {
        if (u > p.length && p !== pieces[pieces.length - 1]) { u -= p.length; continue; }
        if (p.kind === 'arc') {
          const a = p.a0 + u / p.r;
          return { y: p.cy + p.r * Math.cos(a), z: p.cz + p.r * Math.sin(a), tangent: wrapPi(a + Math.PI / 2) };
        }
        return { y: p.y0 + u * p.dy, z: p.z0 + u * p.dz, tangent: Math.atan2(p.dz, p.dy) };
      }
      throw new Error('unreachable');
    },
  };
}

/** Links in a chain of about `pathLength`: the nearest even number, since links alternate inner and outer. */
export const chainLinkCount = (pathLength: number, pitch: number): number => 2 * Math.round(pathLength / (2 * pitch));

const CH = DIM.chain;
const PLATE_T = 0.0015;
const OUTER_FACE = CH.width / 2 - 0.0005;   // pins stand 0.5 mm proud of the outer plates
const INNER_FACE = OUTER_FACE - PLATE_T;     // inner plates sit just inside the outer ones
const PIN_RADIUS = 0.0025;
/** Pins have 8 sides to keep a link under 300 triangles; a wider crease still shades them round. */
const LINK_CREASE = (50 * Math.PI) / 180;

/** Side plate outline from roller 0 at the origin to roller 1 at (pitch, 0), waisted between them. */
function linkPlate(): Vector2[] {
  const h = CH.plateHeight / 2, waist = 0.82 * h, p = CH.pitch;
  const step = Math.PI / 8;
  return [
    ...arc(h, -Math.PI / 2, Math.PI / 2, step, new Vector2(p, 0)),
    new Vector2(0.65 * p, waist), new Vector2(0.35 * p, waist),
    ...arc(h, Math.PI / 2, (3 * Math.PI) / 2, step),
    new Vector2(0.35 * p, -waist), new Vector2(0.65 * p, -waist),
  ];
}

/**
 * One chain link along +y: two side plates spanning one pitch and its roller at the origin. Inner
 * links have the inner plates; outer links the outer plates and the two pins. Pose a link at
 * pointAt(s) by rotating it about x by `tangent`.
 */
export function chainLink(inner: boolean): BufferGeometry {
  const plate = linkPlate();
  const [x0, x1] = inner ? [INNER_FACE - PLATE_T, INNER_FACE] : [OUTER_FACE - PLATE_T, OUTER_FACE];
  const solids: Solid[] = [prism(plate, [], x0, x1), prism(plate, [], -x1, -x0)];
  const rollerHalf = INNER_FACE - PLATE_T;
  solids.push(lathe([[-rollerHalf, 0], [-rollerHalf, CH.rollerRadius], [rollerHalf, CH.rollerRadius], [rollerHalf, 0]], 12));
  if (!inner) {
    for (const y of [0, CH.pitch]) {
      const pin = lathe([[-CH.width / 2, 0], [-CH.width / 2, PIN_RADIUS], [CH.width / 2, PIN_RADIUS], [CH.width / 2, 0]], 8);
      solids.push(pin.map((v, i) => (i % 3 === 1 ? v + y : v)));
    }
  }
  return toGeometry(solids, LINK_CREASE);
}

const W = DIM.wheel;
const WHEEL_SEGMENTS = 96;
const WP = DIM.wheelParts;

/** The rear wheel centred on its axle along x: [tyre, rim with cast spokes, hub]. */
export function rearWheel(): BufferGeometry[] {
  // tyre section: a superellipse, full width at mid height, crown at the wheel radius
  const a = W.width / 2, bR = W.tyreSection / 2, rc = W.radius - bR, n = 3;
  const sgnPow = (v: number): number => Math.sign(v) * Math.abs(v) ** (2 / n);
  const section: [number, number][] = Array.from({ length: 28 }, (_, i) => {
    const t = (TWO_PI * i) / 28;
    return [a * sgnPow(Math.cos(t)), rc + bR * sgnPow(Math.sin(t))];
  });
  const tyre = toGeometry([lathe(section, WHEEL_SEGMENTS)]);

  const rimIn = W.rimRadius - WP.rimDepth, well = W.rimRadius - 0.003, flange = W.rimRadius + WP.flangeHeight;
  const fx = a - WP.flangeInset, lip = 0.006;
  const rim = lathe([[-fx, rimIn], [-fx, flange], [-fx + lip, flange], [-fx + lip, well],
    [fx - lip, well], [fx - lip, flange], [fx, flange], [fx, rimIn]], WHEEL_SEGMENTS);
  const spoke = prism([new Vector2(W.hubRadius - 0.004, -0.014), new Vector2(rimIn + 0.004, -0.008),
    new Vector2(rimIn + 0.004, 0.008), new Vector2(W.hubRadius - 0.004, 0.014)], [], -WP.spokeHalfThickness, WP.spokeHalfThickness);
  const spokes = Array.from({ length: WP.spokes }, (_, k) => rotateX(spoke, (TWO_PI * k) / WP.spokes));
  const rimAndSpokes = toGeometry([rim, ...spokes]);

  const hx = WP.hubHalfWidth, axle = WP.axleRadius;
  const hub = toGeometry([lathe([[-hx, axle], [-hx, W.hubRadius - 0.008], [-hx + 0.008, W.hubRadius],
    [hx - 0.008, W.hubRadius], [hx, W.hubRadius - 0.008], [hx, axle]], 48)]);
  return [tyre, rimAndSpokes, hub];
}

/**
 * Two circles where the tyre is widest, one each side (x = ±width/2 at the section's mid height),
 * as line segments: drawn as edges, they keep the ghosted wheel's outline readable from afar,
 * where a smooth tyre has no creases to draw.
 */
export function tyreShoulders(): BufferGeometry {
  const rc = W.radius - W.tyreSection / 2, pts: number[] = [];
  for (const x of [-W.width / 2, W.width / 2]) {
    for (let i = 0; i < WHEEL_SEGMENTS; i++) {
      const a0 = (TWO_PI * i) / WHEEL_SEGMENTS, a1 = (TWO_PI * (i + 1)) / WHEEL_SEGMENTS;
      pts.push(x, rc * Math.cos(a0), rc * Math.sin(a0), x, rc * Math.cos(a1), rc * Math.sin(a1));
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pts, 3));
  return g;
}

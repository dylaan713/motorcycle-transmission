import type { BufferGeometry } from 'three';
import { Vector2 } from 'three';
import { DIM } from './dimensions';
import { arc, circle, polar, segmentsFor } from './outline';
import { prism, toGeometry } from './mesh';

/**
 * Involute spur gears and dog rings. Every geometry is centred on the origin with its axis along
 * +x; tooth 0 and lug 0 are centred on angle 0 (+y).
 */

const ALPHA = (DIM.pressureAngleDeg * Math.PI) / 180;
const inv = (a: number): number => Math.tan(a) - a;
/** Points on each flank's involute, base (or root) to tip. */
const FLANK_POINTS = 6;
/** Segments in the root fillet arc. */
const FILLET_SEGMENTS = 4;
/** Root fillet radius when the tooth space allows it, in modules. */
const FILLET = 0.38;
/** Bore polygon chord, m. */
const BORE_CHORD = 0.0015;

/**
 * Static rotation of gear B, about its own axis and in the shared angle convention, that makes it
 * mesh with gear A when A is at rotation 0 (tooth 0 on angle 0) and B's centre lies at angle psi
 * from A's centre. Wrapped to [0, 2π / zB). When A then turns by a, B turns to phase - a × zA / zB.
 *
 * Derivation. Rolling contact pairs material points across the line of centres: once A has turned
 * by a and B by -a zA / zB, A's material at angle psi - a and B's at psi + π + a zA / zB both sit on
 * the line, so A's point at psi - ε meets B's point at psi + π + ε zA / zB. A's tooth k (centre
 * 2πk / zA) has ε = psi - 2πk / zA, and must meet the centre of a tooth space of B, which before
 * the phase is at π / zB + 2πj / zB. So phase = psi + π + (psi - 2πk / zA) zA / zB - π / zB - 2πj / zB,
 * and the k and j terms are whole tooth pitches of B: phase ≡ psi (1 + zA / zB) + π - π / zB.
 * For psi = 0 that is no rotation when zB is odd and half a tooth when it is even.
 */
export function meshPhase(zA: number, zB: number, psi: number): number {
  const pitch = (2 * Math.PI) / zB;
  const phase = psi * (1 + zA / zB) + Math.PI - Math.PI / zB;
  const w = ((phase % pitch) + pitch) % pitch;
  return w >= pitch ? 0 : w;
}

/**
 * Right half of tooth 0 (negative angles), from the middle of the tooth space at -π/teeth to the
 * middle of the tip land at angle 0.
 */
function halfTooth(teeth: number, module: number): Vector2[] {
  const r = (teeth * module) / 2;
  const rb = r * Math.cos(ALPHA);
  const ra = r + DIM.addendum * module;
  const rf = r - DIM.dedendum * module;
  const halfPitch = Math.PI / teeth;
  // half the tooth's angular thickness at radius rho >= rb; half the circular pitch at r
  const psi = (rho: number): number => Math.PI / (2 * teeth) + inv(ALPHA) - inv(Math.acos(rb / rho));
  const psiTip = psi(ra);
  if (psiTip <= 0) throw new Error(`gear of ${teeth} teeth has pointed teeth`);
  const out: Vector2[] = [];
  let flankStart: number; // radius where the involute begins
  if (rf >= rb) {
    // large gears: the root circle is above the base circle; the involute starts at the root
    flankStart = rf;
    out.push(...arc(rf, -halfPitch, -psi(rf)).slice(0, -1)); // its end is the involute's first point
  } else {
    // the involute cannot go below the base circle: a radial flank joins it to the root, through
    // a fillet arc tangent to both the radial line and the root circle where there is room
    flankStart = rb;
    const psiB = psi(rb);
    const spaceHalf = halfPitch - psiB;
    if (spaceHalf <= 0) throw new Error(`gear of ${teeth} teeth has no tooth space at the root`);
    const sinMax = Math.sin(0.8 * spaceHalf);
    const rho = Math.min(FILLET * module, (0.9 * (rb * rb - rf * rf)) / (2 * rf), (rf * sinMax) / (1 - sinMax));
    if (rho < 0.02 * module) {
      out.push(...arc(rf, -halfPitch, -psiB));
    } else {
      const R = rf + rho;
      const delta = Math.asin(rho / R);
      out.push(...arc(rf, -halfPitch, -(psiB + delta)));
      const centre = polar(R, -(psiB + delta));
      const a2 = Math.PI - psiB - delta, a1 = Math.PI / 2 - psiB; // fillet normals at root and flank
      for (let k = 1; k < FILLET_SEGMENTS; k++) out.push(polar(rho, a2 + ((a1 - a2) * k) / FILLET_SEGMENTS).add(centre));
      out.push(polar(R * Math.cos(delta), -psiB));
    }
  }
  // the involute: at roll parameter t the point is at radius rb √(1 + t²), angle inv(atan t) from
  // the involute's own start, so its angle on the tooth is -(psi(rb) - (t - atan t))
  // Samples are evenly spaced in t below and above the pitch circle, which is itself a sample, so
  // the tooth thickness the profile is defined by is exact on the outline.
  const t0 = Math.sqrt(Math.max(0, (flankStart / rb) ** 2 - 1));
  const tp = Math.tan(ALPHA);
  const ta = Math.sqrt((ra / rb) ** 2 - 1);
  const below = Math.round(((FLANK_POINTS - 1) * (tp - t0)) / (ta - t0)); // segments below the pitch circle
  const pitchAt = Math.min(FLANK_POINTS - 2, Math.max(1, below));
  for (let i = 0; i < FLANK_POINTS; i++) {
    const t = i <= pitchAt
      ? t0 + ((tp - t0) * i) / pitchAt
      : tp + ((ta - tp) * (i - pitchAt)) / (FLANK_POINTS - 1 - pitchAt);
    const rho = i === FLANK_POINTS - 1 ? ra : rb * Math.sqrt(1 + t * t);
    out.push(polar(rho, -(Math.PI / (2 * teeth) + inv(ALPHA) - (t - Math.atan(t)))));
  }
  out.push(...arc(ra, -psiTip, 0).slice(1));
  return out;
}

/**
 * Closed involute outline of a whole gear, counter-clockwise, first point not repeated. Pitch radius
 * teeth × module / 2, tip one addendum above it, root one dedendum below; tooth thickness at the
 * pitch circle is half the circular pitch.
 */
export function gearProfile(teeth: number, module: number): Vector2[] {
  const half = halfTooth(teeth, module);
  const mirror = half.slice(1, -1).map((p) => new Vector2(p.x, -p.y)).reverse();
  const tooth = [...half, ...mirror];
  const out: Vector2[] = [];
  const origin = new Vector2();
  for (let k = 0; k < teeth; k++) {
    const a = (2 * Math.PI * k) / teeth;
    for (const p of tooth) out.push(p.clone().rotateAround(origin, a));
  }
  return out;
}

/** A spur gear of `faceWidth` along x with a round bore. */
export function spurGear(o: { teeth: number; module: number; faceWidth: number; boreRadius: number }): BufferGeometry {
  const rootRadius = (o.teeth * o.module) / 2 - DIM.dedendum * o.module;
  if (o.boreRadius >= rootRadius) throw new Error('bore is larger than the root circle');
  const bore = circle(o.boreRadius, segmentsFor(o.boreRadius, BORE_CHORD, 24));
  return toGeometry([prism(gearProfile(o.teeth, o.module), [bore], -o.faceWidth / 2, o.faceWidth / 2)]);
}

/** Dog lugs standing on the plane x = 0 and pointing +x, with flat radial driving faces. */
export function dogRing(o: { count: number; widthDeg: number; innerRadius: number; outerRadius: number; height: number }): BufferGeometry {
  const half = ((o.widthDeg / 2) * Math.PI) / 180;
  const lugs = Array.from({ length: o.count }, (_, k) => {
    const c = (2 * Math.PI * k) / o.count;
    const outline = [...arc(o.outerRadius, c - half, c + half), ...arc(o.innerRadius, c + half, c - half)];
    return prism(outline, [], 0, o.height);
  });
  return toGeometry(lugs);
}

/**
 * A sliding gear with a shift-fork groove: over the middle `grooveWidth` of the face the teeth are
 * cut away down to `grooveRadius`, leaving two tooth bands joined by the hub. A fork claw riding in
 * the groove stays below the reach of the meshing gear's tips.
 */
export function forkGroovedGear(o: {
  teeth: number; module: number; faceWidth: number; boreRadius: number; grooveWidth: number; grooveRadius: number;
}): BufferGeometry {
  const rootRadius = (o.teeth * o.module) / 2 - DIM.dedendum * o.module;
  if (!(o.grooveRadius > o.boreRadius && o.grooveRadius < rootRadius)) throw new Error('groove radius must lie between the bore and the root');
  if (!(o.grooveWidth > 0 && o.grooveWidth < o.faceWidth)) throw new Error('groove must be narrower than the face');
  const bore = circle(o.boreRadius, segmentsFor(o.boreRadius, BORE_CHORD, 24));
  const profile = gearProfile(o.teeth, o.module);
  const h = o.faceWidth / 2, g = o.grooveWidth / 2;
  const hub = prism(circle(o.grooveRadius, segmentsFor(o.grooveRadius, BORE_CHORD, 24)), [bore], -g, g);
  return toGeometry([prism(profile, [bore], -h, -g), hub, prism(profile, [bore], g, h)]);
}

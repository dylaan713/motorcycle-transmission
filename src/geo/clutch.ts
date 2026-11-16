import type { BufferGeometry } from 'three';
import { Vector3 } from 'three';
import { MODULE } from '../model/geometry';
import { DIM } from './dimensions';
import { gearProfile } from './gear';
import { arc, castellated, circle, polar, segmentsFor } from './outline';
import { lathe, prism, toGeometry, translate, tube } from './mesh';
import type { Solid } from './mesh';

/**
 * Wet multi-plate clutch. Every part's axis is +x. The basket and hub are built in the clutch
 * frame: x = 0 is the outer face of the basket's back, the 76-tooth primary ring sits behind it
 * (x < 0) and the basket opens toward +x. Plates are centred on their own origin and placed at
 * `plateStackOffsets`; the pressure plate's origin is its clamping face; a spring runs from its
 * origin along +x.
 */

const C = DIM.clutch;
const B = DIM.basket;
const H = DIM.clutchHub;
const PP = DIM.pressurePlate;
const S = DIM.spring;
const PRIMARY_DRIVEN_TEETH = 76;
const ROUND = 0.0015;            // polygon chord for round edges, m
const FINGER_INNER = C.basketOuterRadius - B.wall;
const HUB_ROOT = C.hubRadius - H.splineDepth;
const STEEL_TOOTH_TIP = HUB_ROOT + DIM.steelPlate.toothClearance;
const HUB_BORE = DIM.inputShaftRadius;

export const CLUTCH = {
  /** Inner face of the basket's back, where the fingers start, clutch frame x. */
  fingerBase: B.floor,
  /** The hub's back wall, which the first friction plate is clamped against, clutch frame x. */
  hubFace: H.face,
  /** Where each spring's far end seats under its post's washer, clutch frame x. */
  springSeat: H.springSeat,
  /** Pressure plate face the springs push on, in the pressure plate's own x. */
  springFace: PP.springFace,
  /** Spring and post axes sit on this radius, spring k at angle k × 2π / springCount. */
  springPitchRadius: H.postPitchRadius,
  /** Length of a spring with every coil closed, m. */
  springSolidLength: (S.turns + 1) * 2 * S.wire,
} as const;

/**
 * x positions in the clutch frame: each plate's centre, and the pressure plate's clamping face.
 * Plates alternate friction, steel, ..., friction from the hub's back wall. Separation 0 clamps
 * them solid; 1 opens `gapOpen` between every neighbouring pair (pressure plate included).
 */
export function plateStackOffsets(separation: number): { friction: number[]; steel: number[]; pressurePlate: number } {
  const s = Math.min(1, Math.max(0, separation));
  const friction: number[] = [], steel: number[] = [];
  let x = CLUTCH.hubFace;
  for (let k = 0; k < 2 * C.plates - 1; k++) {
    const isFriction = k % 2 === 0;
    const t = isFriction ? C.frictionThickness : C.steelThickness;
    (isFriction ? friction : steel).push(x + t / 2 + k * C.gapOpen * s);
    x += t;
  }
  return { friction, steel, pressurePlate: x + (2 * C.plates - 1) * C.gapOpen * s };
}

/** Length of every spring when the pressure plate's clamping face is at clutch frame x. */
export const springLength = (pressurePlateX: number): number => CLUTCH.springSeat - (pressurePlateX + CLUTCH.springFace);

const ring = (r: number): ReturnType<typeof circle> => circle(r, segmentsFor(r, ROUND, 24));
const annulus = (rIn: number, rOut: number, x0: number, x1: number): Solid => prism(ring(rOut), [ring(rIn)], x0, x1);
const springAngles = Array.from({ length: C.springCount }, (_, k) => (2 * Math.PI * k) / C.springCount);

export function clutchBasket(): BufferGeometry {
  const ringGear = prism(gearProfile(PRIMARY_DRIVEN_TEETH, MODULE), [ring(B.boreRadius)], -DIM.primary.faceWidth, 0);
  const back = annulus(B.boreRadius, C.basketOuterRadius, 0, CLUTCH.fingerBase);
  const pitch = (2 * Math.PI) / B.tabs;
  const slotHalf = (B.tabHalfWidth + B.slotClearance) / ((C.plateOuterRadius + B.tabOuterRadius) / 2);
  const fingers = Array.from({ length: B.tabs }, (_, k) => {
    const a0 = k * pitch + slotHalf, a1 = (k + 1) * pitch - slotHalf;
    const outline = [...arc(C.basketOuterRadius, a0, a1), ...arc(FINGER_INNER, a1, a0)];
    return prism(outline, [], CLUTCH.fingerBase, CLUTCH.fingerBase + C.basketDepth);
  });
  return toGeometry([ringGear, back, ...fingers]);
}

export function frictionPlate(): BufferGeometry {
  const tabFrac = (B.tabHalfWidth / ((C.plateOuterRadius + B.tabOuterRadius) / 2)) * (B.tabs / Math.PI);
  const outline = castellated(C.plateOuterRadius, B.tabOuterRadius, B.tabs, tabFrac);
  return toGeometry([prism(outline, [ring(C.plateInnerRadius)], -C.frictionThickness / 2, C.frictionThickness / 2)]);
}

export function steelPlate(): BufferGeometry {
  // inner teeth (the low lands) centred between the hub's splines, 0.4 of a spline pitch wide
  const hole = castellated(STEEL_TOOTH_TIP, C.plateInnerRadius, H.splines, 0.6);
  return toGeometry([prism(ring(DIM.steelPlate.outerRadius), [hole], -C.steelThickness / 2, C.steelThickness / 2)]);
}

/** End of the hub's splines, clutch frame x: just short of the pressure plate's cover when engaged. */
export const hubEnd = (): number => plateStackOffsets(0).pressurePlate + PP.cover - H.endClearance;

/**
 * The inner hub: one turned body (back wall, web and boss) with the splined drum standing on its
 * back wall, five spring posts and their washers. Solids touch only face to opposite face.
 */
export function clutchHub(): BufferGeometry {
  const body = lathe([[H.back, HUB_BORE], [H.back, H.wallRadius], [H.face, H.wallRadius], [H.face, H.bodyRadius],
    [H.webTop, H.bodyRadius], [H.webTop, H.bossRadius], [H.bossEnd, H.bossRadius], [H.bossEnd, HUB_BORE]],
  segmentsFor(H.wallRadius, 2 * ROUND)); // 2.5° steps: smooth under the crease angle, half the triangles
  const splines = prism(castellated(HUB_ROOT, C.hubRadius, H.splines, 0.5), [ring(H.bodyRadius)], H.face, hubEnd());
  const postSegments = segmentsFor(H.postRadius, ROUND, 16);
  const seatEnd = H.springSeat + H.washerThickness;
  const posts = springAngles.flatMap((a) => {
    const p = polar(H.postPitchRadius, a);
    const post = lathe([[H.postStart, 0], [H.postStart, H.postRadius], [H.springSeat, H.postRadius], [H.springSeat, 0]], postSegments);
    const washer = lathe([[H.springSeat, 0], [H.springSeat, H.washerRadius], [seatEnd, H.washerRadius], [seatEnd, 0]], 24);
    return [translate(post, 0, p.x, p.y), translate(washer, 0, p.x, p.y)];
  });
  return toGeometry([body, splines, ...posts]);
}

/** A dished pressure plate: clamping ring, a wall clearing the hub's end, and the spring cover. */
export function pressurePlate(): BufferGeometry {
  const rOut = C.plateOuterRadius - 0.001, rIn = C.hubRadius + PP.ringInnerClearance;
  const dish = lathe([[0, rIn], [0, rOut], [PP.ringThickness, rOut], [PP.ringThickness, PP.wallRadius],
    [PP.cover, PP.wallRadius], [PP.cover, rIn]], segmentsFor(rOut, ROUND));
  const holes = [ring(PP.liftHoleRadius),
    ...springAngles.map((a) => circle(H.postRadius + PP.postHoleClearance, 16, 0, polar(H.postPitchRadius, a)))];
  return toGeometry([dish, prism(ring(PP.wallRadius), holes, PP.cover, PP.springFace)]);
}

/**
 * A coil spring from x = 0 to x = length on its own axis, coil radius `springRadius`, with closed
 * dead turns at each end.
 */
export function clutchSpring(length: number): BufferGeometry {
  const steps = 16 * S.turns;
  const closed = 2 * S.wire;
  const active = S.turns - 2 * S.deadTurns;
  const pitch = Math.max(closed, (length - 2 * S.wire - 2 * S.deadTurns * closed) / active);
  const xAt = (u: number): number => S.wire + closed * Math.min(u, S.deadTurns)
    + pitch * Math.min(Math.max(u - S.deadTurns, 0), active)
    + closed * Math.max(u - S.deadTurns - active, 0);
  const path = Array.from({ length: steps + 1 }, (_, i) => {
    const u = (S.turns * i) / steps;
    const a = 2 * Math.PI * u;
    return new Vector3(xAt(u), C.springRadius * Math.cos(a), C.springRadius * Math.sin(a));
  });
  return toGeometry([tube(path, S.wire, 10)]); // 36° facets, inside the crease angle: shades round
}

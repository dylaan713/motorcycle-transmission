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
const PRIMARY_DRIVEN_TEETH = 76;
const ROUND = 0.0015;            // polygon chord for round edges, m
const BASKET_BORE = 0.020;       // through the back and the ring gear, m
const BASKET_WALL = 0.0065;      // finger thickness, m
const FINGER_INNER = C.basketOuterRadius - BASKET_WALL;
const TAB_OUTER = 0.0765;        // friction plate tabs, inside the basket's outer radius
const TAB_HALF_WIDTH = 0.0045;   // m, at the tab's mid radius
const SLOT_CLEARANCE = 0.0008;   // each side of a tab in its slot, m
const TABS = 12;
const STEEL_OUTER = 0.0695;
const HUB_SPLINES = 18;
const HUB_ROOT = C.hubRadius - 0.003;
const STEEL_TOOTH_TIP = HUB_ROOT + 0.0005;
const HUB_BORE = DIM.inputShaftRadius;
const POST_RADIUS = 0.0035;
const SPRING_WIRE = 0.0011;
const SPRING_TURNS = 5;
const SPRING_DEAD_TURNS = 0.75;  // closed turns at each end

export const CLUTCH = {
  /** Inner face of the basket's back, where the fingers start, clutch frame x. */
  fingerBase: 0.006,
  /** The hub's back wall, which the first friction plate is clamped against, clutch frame x. */
  hubFace: 0.009,
  /** Where each spring's far end seats under its post's washer, clutch frame x. */
  springSeat: 0.080,
  /** Pressure plate face the springs push on, in the pressure plate's own x. */
  springFace: 0.0115,
  /** Spring and post axes sit on this radius, spring k at angle k × 2π / springCount. */
  springPitchRadius: 0.024,
  /** Length of a spring with every coil closed, m. */
  springSolidLength: (SPRING_TURNS + 1) * 2 * SPRING_WIRE,
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
  const ringGear = prism(gearProfile(PRIMARY_DRIVEN_TEETH, MODULE), [ring(BASKET_BORE)], -DIM.primary.faceWidth, 0);
  const back = annulus(BASKET_BORE, C.basketOuterRadius, 0, CLUTCH.fingerBase);
  const pitch = (2 * Math.PI) / TABS;
  const slotHalf = (TAB_HALF_WIDTH + SLOT_CLEARANCE) / ((C.plateOuterRadius + TAB_OUTER) / 2);
  const fingers = Array.from({ length: TABS }, (_, k) => {
    const a0 = k * pitch + slotHalf, a1 = (k + 1) * pitch - slotHalf;
    const outline = [...arc(C.basketOuterRadius, a0, a1), ...arc(FINGER_INNER, a1, a0)];
    return prism(outline, [], CLUTCH.fingerBase, CLUTCH.fingerBase + C.basketDepth);
  });
  return toGeometry([ringGear, back, ...fingers]);
}

export function frictionPlate(): BufferGeometry {
  const tabFrac = (TAB_HALF_WIDTH / ((C.plateOuterRadius + TAB_OUTER) / 2)) * (TABS / Math.PI);
  const outline = castellated(C.plateOuterRadius, TAB_OUTER, TABS, tabFrac);
  return toGeometry([prism(outline, [ring(C.plateInnerRadius)], -C.frictionThickness / 2, C.frictionThickness / 2)]);
}

export function steelPlate(): BufferGeometry {
  // inner teeth (the low lands) centred between the hub's splines, 0.4 of a spline pitch wide
  const hole = castellated(STEEL_TOOTH_TIP, C.plateInnerRadius, HUB_SPLINES, 0.6);
  return toGeometry([prism(ring(STEEL_OUTER), [hole], -C.steelThickness / 2, C.steelThickness / 2)]);
}

export function clutchHub(): BufferGeometry {
  const back = 0.0065, end = 0.051;
  const splines = prism(castellated(HUB_ROOT, C.hubRadius, HUB_SPLINES, 0.5), [ring(0.036)], back, end);
  const wall = annulus(0.040, C.plateOuterRadius - 0.002, back, CLUTCH.hubFace);
  const web = annulus(HUB_BORE, 0.037, back, 0.016);
  const boss = annulus(HUB_BORE, 0.017, 0.016, 0.030);
  const postSegments = segmentsFor(POST_RADIUS, ROUND, 16);
  const posts = springAngles.flatMap((a) => {
    const p = polar(CLUTCH.springPitchRadius, a);
    const post = lathe([[0.015, 0], [0.015, POST_RADIUS], [CLUTCH.springSeat, POST_RADIUS], [CLUTCH.springSeat, 0]], postSegments);
    const washer = lathe([[CLUTCH.springSeat, 0], [CLUTCH.springSeat, 0.0095], [CLUTCH.springSeat + 0.0025, 0.0095],
      [CLUTCH.springSeat + 0.0025, 0]], 24);
    return [translate(post, 0, p.x, p.y), translate(washer, 0, p.x, p.y)];
  });
  return toGeometry([splines, wall, web, boss, ...posts]);
}

/** A dished pressure plate: clamping ring, a wall clearing the hub's end, and the spring cover. */
export function pressurePlate(): BufferGeometry {
  const rOut = C.plateOuterRadius - 0.001, rIn = C.hubRadius + 0.0015, wall = 0.0505, cover = 0.0075;
  const dish = lathe([[0, rIn], [0, rOut], [0.0045, rOut], [0.0045, wall], [cover, wall], [cover, rIn]], segmentsFor(rOut, ROUND));
  const holes = [ring(0.009), ...springAngles.map((a) => circle(POST_RADIUS + 0.001, 16, 0, polar(CLUTCH.springPitchRadius, a)))];
  return toGeometry([dish, prism(ring(wall), holes, cover, CLUTCH.springFace)]);
}

/**
 * A coil spring from x = 0 to x = length on its own axis, coil radius `springRadius`, with closed
 * dead turns at each end.
 */
export function clutchSpring(length: number): BufferGeometry {
  const steps = 16 * SPRING_TURNS;
  const closed = 2 * SPRING_WIRE;
  const active = SPRING_TURNS - 2 * SPRING_DEAD_TURNS;
  const pitch = Math.max(closed, (length - 2 * SPRING_WIRE - 2 * SPRING_DEAD_TURNS * closed) / active);
  const xAt = (u: number): number => SPRING_WIRE + closed * Math.min(u, SPRING_DEAD_TURNS)
    + pitch * Math.min(Math.max(u - SPRING_DEAD_TURNS, 0), active)
    + closed * Math.max(u - SPRING_DEAD_TURNS - active, 0);
  const path = Array.from({ length: steps + 1 }, (_, i) => {
    const u = (SPRING_TURNS * i) / steps;
    const a = 2 * Math.PI * u;
    return new Vector3(xAt(u), C.springRadius * Math.cos(a), C.springRadius * Math.sin(a));
  });
  return toGeometry([tube(path, SPRING_WIRE, 10)]); // 36° facets, inside the crease angle: shades round
}

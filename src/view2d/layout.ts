/**
 * The schematic's geometry, pure and free of the DOM: every constant of the drawing, the shape
 * table and where each part sits for a given state. Painting lives in paint.ts and draw/.
 */
import {
  CENTRE_DISTANCE, FACE_WIDTH, GEAR_ORDER, GEAR_PITCH, SLIDER_TRAVEL, drawnDogPhase, gearAngle,
  gearAxialPosition, pitchRadius, sliderOfGear,
} from '../model/geometry';
import type { GearNo, PartId } from '../model/parts';
import { clutchCapacityMax } from '../sim/clutch';
import { PARAMS } from '../sim/params';
import type { DetentName, SimState, SliderId } from '../sim/types';
import { clamp, deg } from '../sim/units';

/** Where a part is drawn: an axis-aligned box in model metres on the schematic plane, y down. */
export interface PartShape { id: PartId; x: number; y: number; w: number; h: number }

// ---------------------------------------------------------------------------------------------
// Geometry of the drawing, metres. Gears, shafts and dogs come from the model; the clutch, crank,
// case and final drive are drawn at representative sizes on the same scale. x is axial (left to
// right in GEAR_ORDER), y is down, the input shaft axis is y = 0 and the output shaft's is below it.

export const MM = 1e-3;
export const IN_Y = 0;
export const OUT_Y = CENTRE_DISTANCE;
export type Shaft = 'input' | 'output';
export const SHAFT_R: Record<Shaft, number> = { input: 11 * MM, output: 12.5 * MM };
export const AXIS_Y: Record<Shaft, number> = { input: IN_Y, output: OUT_Y };
export const IN_SHAFT_X = [-131 * MM, 66 * MM] as const;
export const OUT_SHAFT_X = [-66 * MM, 84 * MM] as const;
export const WALLS = [[-66 * MM, -62 * MM], [62 * MM, 66 * MM]] as const; // gearbox case, either side of the gears
export const WALL_Y = [-40 * MM, 112 * MM] as const;
export const BEARING = 6 * MM; // radial depth of a bearing in the case wall

// Primary drive: the driven gear sits on the back of the clutch basket, the drive gear on the crank.
export const PRIMARY_MODULE = 1.75 * MM;
export const DRIVE_R = (PARAMS.primary.drive * PRIMARY_MODULE) / 2;
export const DRIVEN_R = (PARAMS.primary.driven * PRIMARY_MODULE) / 2;
export const CRANK_Y = IN_Y - (DRIVE_R + DRIVEN_R);
export const PRIMARY_X = [-82 * MM, -70 * MM] as const;

// Clutch, built leftward (outboard) from the hub's inner pressure face.
export const BASKET_R = 74 * MM;
export const BASKET_RIM = 2.5 * MM;
// The basket and its driven gear run free on the input shaft on a needle bearing in this bore.
export const BASKET_BORE = SHAFT_R.input + 3 * MM;
export const BEARING_GAP = 0.8 * MM; // clearance drawn between shaft and bearing, so they read as separate
export const BASKET_BACK_X = [-87 * MM, PRIMARY_X[0]] as const;
// Long enough that the outermost friction plate stays in the basket at full release (16 gaps open).
export const BASKET_MOUTH_X = -144 * MM;
export const HUB_X = [-93 * MM, -88 * MM] as const;
export const HUB_R = 66 * MM;
export const FRICTION = { t: 3 * MM, r: 70 * MM };
export const STEEL = { t: 2 * MM, r: 66 * MM };
export const PRESSURE = { t: 6 * MM, r: 64 * MM };
export const STEEL_INNER_R = 44 * MM; // the steel plates' inner teeth ride the hub drum at this radius
export const FRICTION_COUNT = PARAMS.clutch.surfaces / 2; // each friction plate has two faces
export const PLATE_COUNT = 2 * FRICTION_COUNT - 1; // friction, steel, ..., friction
export const GAP_MAX = 0.6 * MM; // per interface, fully released
// The hub drum carries the steel plates; long enough for the outermost one at full release.
export const HUB_DRUM_LEN = 47 * MM;
// Clutch springs: each on a post from the hub drum, between a bolt head fixed to the post and the
// pressure plate, so they shorten as the lever pulls the plate outboard.
export const SPRING = { r: 32 * MM, h: 5 * MM, post: 1.5 * MM, boltX: -153 * MM, head: 2 * MM };
// Release rod: through the hollow input shaft to the lifter at the pressure plate's centre.
export const RELEASE_ROD = { r: 3.5 * MM, endX: -118 * MM, lifter: 4 * MM }; // lifter: how far it stands out of the plate

// Crank stub beside the primary drive gear: journal, two webs with the crankpin between, journal.
export const CRANK = {
  journal: { x: [PRIMARY_X[1], -56 * MM], r: 15 * MM },
  web1: { x: [-56 * MM, -46 * MM], r: 38 * MM },
  pin: { x: [-46 * MM, -36 * MM], r: 13 * MM, throw: 24 * MM },
  web2: { x: [-36 * MM, -26 * MM], r: 38 * MM },
  stub: { x: [-26 * MM, -16 * MM], r: 15 * MM },
} as const;

// Dogs: five lugs on each facing face, the slider's narrower than the gear's, so the window in
// which a slider lug fits a gap is the simulation's windowDeg (26 + 30 + 16 = 72 degrees).
export const DOGS = PARAMS.dogs.count;
export const DOG_PITCH = (2 * Math.PI) / DOGS;
export const DOG_SLIDER_W = deg(26);
export const DOG_GEAR_W = DOG_PITCH - DOG_SLIDER_W - deg(PARAMS.dogs.windowDeg);
export const DOG_GAP = DOG_PITCH - DOG_GEAR_W; // the gap between two gear lugs
// Two lugs of this length leave (pitch - face - 2 * LUG_LEN) between their tips at rest, which a
// slider closes at x = contactX: the tips meet exactly where the simulation tests alignment.
export const LUG_LEN = (GEAR_PITCH - FACE_WIDTH - PARAMS.dogs.contactX * SLIDER_TRAVEL) / 2;
export const DOG_R_FRACTION = 0.6; // lug outer radius as a fraction of the smaller facing gear
export const C_HUB_R = 20 * MM; // the web joining third and fourth into one sliding piece

// Final drive.
export const CHAIN_PITCH = 15.875 * MM;
export const SPROCKET_R = CHAIN_PITCH / (2 * Math.sin(Math.PI / PARAMS.final.front));
export const SPROCKET_X = [72 * MM, 80 * MM] as const;
export const CHAIN_WRAP = { half: 6 * MM, h: 4 * MM };
export const NUT = { w: 4 * MM, r: 9 * MM }; // on the output shaft's end, holding the sprocket
// End-view inset, not to scale: sprocket radii keep the tooth ratio, the wheel does not.
export const INSET = {
  front: { x: 104 * MM, y: 100 * MM, r: 6 * MM },
  rear: { x: 148 * MM, y: 100 * MM, r: (6 * MM * PARAMS.final.rear) / PARAMS.final.front },
  wheel: { r: 30 * MM, rim: 25 * MM },
  right: 182 * MM,
};

// Shift drum, unrolled: axial position across, drum angle down, scrolling under a fixed cursor.
export const BAND = { x0: -62 * MM, x1: 62 * MM, y0: 116 * MM, y1: 192 * MM };
export const CURSOR_Y = (BAND.y0 + BAND.y1) / 2;
export const DRUM_R = 24 * MM; // a representative drum radius, developed true: arc length = DRUM_R * angle
export const GROOVE_W = 4.6 * MM;
export const PIN_R = 2.2 * MM;
export const FORK_W = 3 * MM;
export const TRACK_RANGE = [deg(-20), deg(320)] as const; // groove drawn beyond the end detents by this much
export const STAR = { x: 79 * MM, y: CURSOR_Y, r: 14 * MM, hw: deg(13), depth: 3.2 * MM, depthN: 1.6 * MM };
export const ROLLER_R = 3 * MM;
export const ARM_PIVOT = { x: STAR.x + STAR.r + ROLLER_R, y: CURSOR_Y - 20 * MM }; // above the roller
// Shift shaft, end on beside the star wheel: its pawl arm reaches the drum end's pins and the
// pedal lever on its outer end rocks with the pedal travel.
export const SHIFT_SHAFT = { x: 104 * MM, y: CURSOR_Y + 28 * MM, r: 4 * MM };
export const PAWL = { len: 23 * MM, rest: Math.atan2(-18, -15), swing: deg(12), w: 2.4 * MM };
export const PEDAL = { len: 26 * MM, rest: deg(10), swing: deg(20), w: 3 * MM };
/** Angle of the pedal lever (canvas frame, y down): pedal up lifts the tip. */
export const pedalAngle = (state: SimState): number => PEDAL.rest - state.pedal.travel * PEDAL.swing;
/** Angle of the pawl arm, turning with the shift shaft. */
export const pawlAngle = (state: SimState): number => PAWL.rest - state.pedal.travel * PAWL.swing;
export const pedalTip = (state: SimState): { x: number; y: number } => {
  const a = pedalAngle(state);
  return { x: SHIFT_SHAFT.x + PEDAL.len * Math.cos(a), y: SHIFT_SHAFT.y + PEDAL.len * Math.sin(a) };
};

export const SIGNS = [-1, 1] as const;
// the case wall between and either side of the bearings
export const WALL_PIECES = [
  [WALL_Y[0], IN_Y - SHAFT_R.input - BEARING],
  [IN_Y + SHAFT_R.input + BEARING, OUT_Y - SHAFT_R.output - BEARING],
  [OUT_Y + SHAFT_R.output + BEARING, WALL_Y[1]],
] as const;

export const DETENT_NAMES: readonly DetentName[] = [1, 'N', 2, 3, 4, 5, 6];
export const DETENT_ANGLES: readonly number[] = DETENT_NAMES.map((n) => deg(PARAMS.drum.detents[n]));
export const DETENT_LABELS: readonly string[] = DETENT_NAMES.map(String);

export const GEAR_LABEL_Y = -36 * MM;
/** The whole drawing including labels, metres. */
export const EXTENT = { x0: -164 * MM, x1: 182 * MM, y0: -140 * MM, y1: 204 * MM };
/** CSS px kept clear round the drawing. */
export const FIT_PAD = 8;

/** Model metres to CSS px: x_css = ox + x * scale. */
export interface Fit { scale: number; ox: number; oy: number }

/** The transform that fits EXTENT, centred, inside a w × h CSS px view with FIT_PAD all round. */
export function fitTransform(w: number, h: number): Fit {
  const ew = EXTENT.x1 - EXTENT.x0, eh = EXTENT.y1 - EXTENT.y0;
  const scale = Math.max(0, Math.min((w - 2 * FIT_PAD) / ew, (h - 2 * FIT_PAD) / eh));
  return { scale, ox: (w - ew * scale) / 2 - EXTENT.x0 * scale, oy: (h - eh * scale) / 2 - EXTENT.y0 * scale };
}

/** A CSS px point in the view to model metres, under `fit`; null when the view has no size. */
export function toModel(fit: Fit, x: number, y: number): { x: number; y: number } | null {
  return fit.scale > 0 ? { x: (x - fit.ox) / fit.scale, y: (y - fit.oy) / fit.scale } : null;
}

// ---------------------------------------------------------------------------------------------
// Sliders and their dogs.

export interface DogSide { free: GearNo; face: GearNo; dir: -1 | 1; r: number }
export interface SliderDraw { id: SliderId; shaft: Shaft; sense: 1 | -1; gears: GearNo[]; restX: number; neg: DogSide; pos: DogSide }

export const SLIDERS: readonly SliderDraw[] = (['A', 'B', 'C'] as const).map((id) => {
  const p = PARAMS.sliders[id];
  const shaft = p.shaft as Shaft;
  const gears = GEAR_ORDER.filter((g) => sliderOfGear(shaft, g) === id);
  const side = (free: GearNo, face: GearNo, dir: -1 | 1): DogSide => ({
    free, face, dir, r: DOG_R_FRACTION * Math.min(pitchRadius(shaft, face), pitchRadius(shaft, free)),
  });
  return {
    id, shaft, sense: shaft === 'input' ? 1 : -1, gears,
    restX: (gearAxialPosition(gears[0]) + gearAxialPosition(gears[gears.length - 1])) / 2,
    neg: side(p.neg, gears[0], -1),
    pos: side(p.pos, gears[gears.length - 1], 1),
  };
});
export const SLIDER_OF: Record<SliderId, SliderDraw> = { A: SLIDERS[0], B: SLIDERS[1], C: SLIDERS[2] };

/**
 * Drawn-frame angles of the centre of the first of five dogs on a slider's face and of the first
 * lug on the gear facing it (the others follow at 2π/5). Slider dog k spans [D, D + sense·w] from
 * the slider's drawn angle D; the gap between the gear's lugs begins drawnDogPhase behind D and
 * runs sense·(pitch − lug width). So exactly inside the simulation's alignment window a slider dog
 * fits wholly within a gap.
 */
export function dogLugAngles(state: SimState, slider: SliderId, side: 'neg' | 'pos'): { slider: number; gear: number } {
  const s = SLIDER_OF[slider];
  const D = gearAngle(s.shaft, s[side].face, state.angles);
  const psi = drawnDogPhase(slider, side, state);
  return {
    slider: D + (s.sense * DOG_SLIDER_W) / 2,
    gear: D - psi + s.sense * (DOG_GAP + DOG_GEAR_W / 2),
  };
}

// ---------------------------------------------------------------------------------------------
// The shape list: fixed order, which is draw order (first is bottom-most) and reverse pick order.

export const IDS: PartId[] = [];
export const slot = (id: PartId): number => IDS.push(id) - 1;
export const I_DRUM = slot('shiftDrum');
export const I_FORK_C_ROD = slot('forkC'); // passes behind the output shaft and its gears
export const I_OUT = slot('outputShaft');
export const I_IN = slot('inputShaft');
export const I_CRANK = slot('crank');
export const I_PRIMARY = slot('primaryDrive');
export const I_BASKET_RIM = [slot('clutchBasket'), slot('clutchBasket')] as const; // top, bottom
export const I_BASKET_BACK = [slot('clutchBasket'), slot('clutchBasket')] as const; // above, below the bore
export const I_DRIVEN = [slot('clutchBasket'), slot('clutchBasket')] as const;
export const I_HUB = slot('clutchHub');
export const I_HUB_DRUM = slot('clutchHub');
export const I_ROD = slot('pressurePlate'); // drawn under the plates: only its lifter shows
export const I_PLATE0 = IDS.length;
for (let i = 0; i < PLATE_COUNT; i++) slot(i % 2 === 0 ? 'frictionPlates' : 'steelPlates');
export const I_PRESSURE = slot('pressurePlate');
export const I_SPRING = [slot('pressurePlate'), slot('pressurePlate')] as const; // bolt head to plate
export const I_GEAR: Record<string, number> = {};
for (const g of GEAR_ORDER) for (const end of ['in', 'out'] as const) I_GEAR[`${g}${end}`] = slot(`gear${g}${end}`);
export const I_WEB = slot('gear3in'); // the web joining third and fourth into one sliding piece
export const I_FORK: Record<SliderId, number> = { A: slot('forkA'), B: slot('forkB'), C: slot('forkC') }; // C: the yoke
export const I_SPROCKET = slot('sprocket');
export const I_CHAIN_WRAP = [slot('chain'), slot('chain')] as const; // on the edge-on sprocket, top and bottom
export const I_NUT = slot('outputShaft');
export const I_WHEEL = slot('rearWheel');
export const I_REAR = slot('rearSprocket');
export const I_SPROCKET_END = slot('sprocket'); // the front sprocket again, in the end view
export const I_CHAIN_TOP = slot('chain');
export const I_CHAIN_BOTTOM = slot('chain');
export const I_STAR = slot('starWheel');
export const I_ARM = slot('detentArm');
export const I_PEDAL = slot('pedal'); // behind the shaft end it is clamped to
export const I_SHIFT_SHAFT = slot('shiftShaft');

export const GEAR_OF: Partial<Record<PartId, { g: GearNo; shaft: Shaft }>> = {};
for (const g of GEAR_ORDER) { GEAR_OF[`gear${g}in`] = { g, shaft: 'input' }; GEAR_OF[`gear${g}out`] = { g, shaft: 'output' }; }
export const gearIndex = (shaft: Shaft, g: GearNo): number => I_GEAR[`${g}${shaft === 'input' ? 'in' : 'out'}`];

function setBox(out: PartShape[], i: number, x0: number, y0: number, x1: number, y1: number): void {
  const s = out[i];
  s.x = Math.min(x0, x1); s.y = Math.min(y0, y1);
  s.w = Math.abs(x1 - x0); s.h = Math.abs(y1 - y0);
}

/** Axial offset of a slider from rest, m. */
export const sliderShift = (state: SimState, id: SliderId): number => state.sliders[id].x * SLIDER_TRAVEL;
/** Axial centre of a gear as drawn, m. */
export function gearX(state: SimState, shaft: Shaft, g: GearNo): number {
  const id = sliderOfGear(shaft, g);
  return gearAxialPosition(g) + (id === null ? 0 : sliderShift(state, id));
}
/** Clutch plate separation, 0 clamped .. 1 fully released. */
export const separation = (state: SimState): number => 1 - clamp(state.clutch.capacity / clutchCapacityMax, 0, 1);

// Chain tangents in the end view, fixed: unit normal shared by both tangent points of each strand.
export const CHAIN_SIN = (INSET.rear.r - INSET.front.r) / (INSET.rear.x - INSET.front.x);
export const CHAIN_COS = Math.sqrt(1 - CHAIN_SIN * CHAIN_SIN);
export const tangent = (c: { x: number; y: number; r: number }, top: boolean) => ({
  x: c.x - c.r * CHAIN_SIN, y: c.y + (top ? -1 : 1) * c.r * CHAIN_COS,
});
export const CHAIN_PTS = {
  frontTop: tangent(INSET.front, true), rearTop: tangent(INSET.rear, true),
  frontBottom: tangent(INSET.front, false), rearBottom: tangent(INSET.rear, false),
};

/** Writes where every part is drawn for this state into `out` (made by newShapes). */
export function layout(state: SimState, out: PartShape[]): void {
  setBox(out, I_DRUM, BAND.x0, BAND.y0, BAND.x1, BAND.y1);
  setBox(out, I_OUT, OUT_SHAFT_X[0], OUT_Y - SHAFT_R.output, OUT_SHAFT_X[1], OUT_Y + SHAFT_R.output);
  setBox(out, I_IN, IN_SHAFT_X[0], IN_Y - SHAFT_R.input, IN_SHAFT_X[1], IN_Y + SHAFT_R.input);
  setBox(out, I_CRANK, CRANK.journal.x[0], CRANK_Y - CRANK.web1.r, CRANK.stub.x[1], CRANK_Y + CRANK.web1.r);
  setBox(out, I_PRIMARY, PRIMARY_X[0], CRANK_Y - DRIVE_R, PRIMARY_X[1], CRANK_Y + DRIVE_R);
  for (const [k, sign] of [[0, -1], [1, 1]] as const) {
    setBox(out, I_BASKET_RIM[k], BASKET_MOUTH_X, sign * BASKET_R, BASKET_BACK_X[0], sign * (BASKET_R - BASKET_RIM));
    setBox(out, I_BASKET_BACK[k], BASKET_BACK_X[0], sign * BASKET_R, BASKET_BACK_X[1], sign * BASKET_BORE);
    setBox(out, I_DRIVEN[k], PRIMARY_X[0], sign * DRIVEN_R, PRIMARY_X[1], sign * BASKET_BORE);
  }
  setBox(out, I_HUB, HUB_X[0], -HUB_R, HUB_X[1], HUB_R);
  setBox(out, I_HUB_DRUM, HUB_X[0] - HUB_DRUM_LEN, -STEEL_INNER_R, HUB_X[0], STEEL_INNER_R);

  const gap = separation(state) * GAP_MAX;
  let x = HUB_X[0];
  for (let i = 0; i < PLATE_COUNT; i++) {
    const p = i % 2 === 0 ? FRICTION : STEEL;
    x -= gap;
    setBox(out, I_PLATE0 + i, x - p.t, -p.r, x, p.r);
    x -= p.t;
  }
  x -= gap;
  setBox(out, I_PRESSURE, x - PRESSURE.t, -PRESSURE.r, x, PRESSURE.r);
  setBox(out, I_ROD, x - PRESSURE.t - RELEASE_ROD.lifter, -RELEASE_ROD.r, RELEASE_ROD.endX, RELEASE_ROD.r);
  for (const [k, sign] of [[0, -1], [1, 1]] as const) {
    setBox(out, I_SPRING[k], SPRING.boltX - SPRING.head, sign * SPRING.r - SPRING.h * 0.8, x - PRESSURE.t, sign * SPRING.r + SPRING.h * 0.8);
  }

  for (const g of GEAR_ORDER) {
    for (const shaft of ['input', 'output'] as const) {
      const cx = gearX(state, shaft, g), r = pitchRadius(shaft, g), y = AXIS_Y[shaft];
      setBox(out, gearIndex(shaft, g), cx - FACE_WIDTH / 2, y - r, cx + FACE_WIDTH / 2, y + r);
    }
  }

  // a fork is rigid on its rail: straight at its slider; its pin sits wherever that puts it in the groove
  for (const s of SLIDERS) {
    const body = s.restX + sliderShift(state, s.id);
    const x0 = body - FORK_W / 2, x1 = body + FORK_W / 2;
    if (s.shaft === 'output') {
      setBox(out, I_FORK[s.id], x0, OUT_Y + SHAFT_R.output + 1.5 * MM, x1, CURSOR_Y + PIN_R);
    } else {
      setBox(out, I_FORK_C_ROD, x0, IN_Y + C_HUB_R, x1, CURSOR_Y + PIN_R);
      setBox(out, I_FORK[s.id], body - FORK_W / 2, IN_Y + SHAFT_R.input + 1 * MM, body + FORK_W / 2, IN_Y + C_HUB_R);
    }
  }

  const g3 = out[gearIndex('input', 3)], g4 = out[gearIndex('input', 4)];
  setBox(out, I_WEB, g3.x + g3.w, -C_HUB_R, g4.x, C_HUB_R);
  setBox(out, I_SPROCKET, SPROCKET_X[0], OUT_Y - SPROCKET_R, SPROCKET_X[1], OUT_Y + SPROCKET_R);
  const scx = (SPROCKET_X[0] + SPROCKET_X[1]) / 2;
  for (const [k, sign] of [[0, -1], [1, 1]] as const) {
    const y = OUT_Y + sign * SPROCKET_R;
    setBox(out, I_CHAIN_WRAP[k], scx - CHAIN_WRAP.half, y - CHAIN_WRAP.h / 2, scx + CHAIN_WRAP.half, y + CHAIN_WRAP.h / 2);
  }
  setBox(out, I_NUT, OUT_SHAFT_X[1] - NUT.w, OUT_Y - NUT.r, OUT_SHAFT_X[1], OUT_Y + NUT.r);
  const { front, rear, wheel } = INSET;
  setBox(out, I_WHEEL, rear.x - wheel.r, rear.y - wheel.r, rear.x + wheel.r, rear.y + wheel.r);
  setBox(out, I_REAR, rear.x - rear.r, rear.y - rear.r, rear.x + rear.r, rear.y + rear.r);
  setBox(out, I_SPROCKET_END, front.x - front.r, front.y - front.r, front.x + front.r, front.y + front.r);
  const c = CHAIN_PTS, pad = 1.5 * MM;
  setBox(out, I_CHAIN_TOP, c.frontTop.x, c.frontTop.y - pad, c.rearTop.x, c.rearTop.y + pad);
  setBox(out, I_CHAIN_BOTTOM, c.frontBottom.x, c.frontBottom.y + pad, c.rearBottom.x, c.rearBottom.y - pad);
  setBox(out, I_STAR, STAR.x - STAR.r, STAR.y - STAR.r, STAR.x + STAR.r, STAR.y + STAR.r);
  setBox(out, I_ARM, ARM_PIVOT.x - ROLLER_R, ARM_PIVOT.y - 2 * MM, ARM_PIVOT.x + ROLLER_R, STAR.y + ROLLER_R);
  const ss = SHIFT_SHAFT, pa = pawlAngle(state);
  const pawlX = ss.x + PAWL.len * Math.cos(pa), pawlY = ss.y + PAWL.len * Math.sin(pa);
  setBox(out, I_SHIFT_SHAFT, Math.min(ss.x - ss.r, pawlX), Math.min(ss.y - ss.r, pawlY), Math.max(ss.x + ss.r, pawlX), Math.max(ss.y + ss.r, pawlY));
  const tip = pedalTip(state), half = PEDAL.w / 2;
  setBox(out, I_PEDAL, Math.min(ss.x, tip.x) - half, Math.min(ss.y, tip.y) - half, Math.max(ss.x, tip.x) + half, Math.max(ss.y, tip.y) + half);
}

export const newShapes = (): PartShape[] => IDS.map((id) => ({ id, x: 0, y: 0, w: 0, h: 0 }));

/**
 * The top-most shape containing (x, y), model metres, grown by `tol` on every side: the shape list
 * is in draw order, so it is searched from the end.
 */
export function pickShape(shapes: readonly PartShape[], x: number, y: number, tol = 0): PartId | null {
  for (let i = shapes.length - 1; i >= 0; i--) {
    const s = shapes[i];
    if (x >= s.x - tol && x <= s.x + s.w + tol && y >= s.y - tol && y <= s.y + s.h + tol) return s.id;
  }
  return null;
}

/** Pure: where every part is drawn for this state, in model metres on the schematic plane. */
export function schematicShapes(state: SimState): PartShape[] {
  const out = newShapes();
  layout(state, out);
  return out;
}

export const TWO_PI = 2 * Math.PI;
/** Angle into (-π, π]. */
export const norm = (a: number): number => a - TWO_PI * Math.round(a / TWO_PI);
/** Radius of the star wheel's profile at drum angle a: notched at every detent, shallow at neutral. */
export function starRadius(a: number): number {
  let r = STAR.r;
  for (let i = 0; i < DETENT_ANGLES.length; i++) {
    const d = Math.abs(norm(a - DETENT_ANGLES[i]));
    if (d >= STAR.hw) continue;
    const depth = DETENT_NAMES[i] === 'N' ? STAR.depthN : STAR.depth;
    r = Math.min(r, STAR.r - depth * (0.5 + 0.5 * Math.cos((Math.PI * d) / STAR.hw)));
  }
  return r;
}

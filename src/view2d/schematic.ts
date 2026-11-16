import type { View } from '../app/view';
import {
  CENTRE_DISTANCE, FACE_WIDTH, GEAR_ORDER, GEAR_PITCH, SLIDER_TRAVEL, drawnAngles, drawnDogPhase, gearAngle,
  gearAxialPosition, gearKind, pitchRadius, sliderOfGear,
} from '../model/geometry';
import type { GearNo, PartId } from '../model/parts';
import type { TorquePath } from '../model/torquePath';
import { clutchCapacityMax } from '../sim/clutch';
import { PARAMS } from '../sim/params';
import { grooveCommand } from '../sim/shiftDrum';
import type { DetentName, SimState, SliderId } from '../sim/types';
import { clamp, deg, toDeg } from '../sim/units';
import { COLORS } from '../ui/tokens';

/** Where a part is drawn: an axis-aligned box in model metres on the schematic plane, y down. */
export interface PartShape { id: PartId; x: number; y: number; w: number; h: number }

// ---------------------------------------------------------------------------------------------
// Geometry of the drawing, metres. Gears, shafts and dogs come from the model; the clutch, crank,
// case and final drive are drawn at representative sizes on the same scale. x is axial (left to
// right in GEAR_ORDER), y is down, the input shaft axis is y = 0 and the output shaft's is below it.

const MM = 1e-3;
const IN_Y = 0;
const OUT_Y = CENTRE_DISTANCE;
type Shaft = 'input' | 'output';
const SHAFT_R: Record<Shaft, number> = { input: 11 * MM, output: 12.5 * MM };
const AXIS_Y: Record<Shaft, number> = { input: IN_Y, output: OUT_Y };
const IN_SHAFT_X = [-128 * MM, 66 * MM] as const;
const OUT_SHAFT_X = [-66 * MM, 84 * MM] as const;
const WALLS = [[-66 * MM, -62 * MM], [62 * MM, 66 * MM]] as const; // gearbox case, either side of the gears
const WALL_Y = [-40 * MM, 112 * MM] as const;
const BEARING = 6 * MM; // radial depth of a bearing in the case wall

// Primary drive: the driven gear sits on the back of the clutch basket, the drive gear on the crank.
const PRIMARY_MODULE = 1.75 * MM;
const DRIVE_R = (PARAMS.primary.drive * PRIMARY_MODULE) / 2;
const DRIVEN_R = (PARAMS.primary.driven * PRIMARY_MODULE) / 2;
const CRANK_Y = IN_Y - (DRIVE_R + DRIVEN_R);
const PRIMARY_X = [-82 * MM, -70 * MM] as const;

// Clutch, built leftward (outboard) from the hub's inner pressure face.
const BASKET_R = 74 * MM;
const BASKET_RIM = 2.5 * MM;
const BASKET_BACK_X = [-87 * MM, PRIMARY_X[0]] as const;
const BASKET_MOUTH_X = -134 * MM;
const HUB_X = [-93 * MM, -88 * MM] as const;
const HUB_R = 66 * MM;
const FRICTION = { t: 3 * MM, r: 70 * MM };
const STEEL = { t: 2 * MM, r: 66 * MM };
const PRESSURE = { t: 6 * MM, r: 64 * MM };
const STEEL_INNER_R = 44 * MM; // the steel plates' inner teeth ride the hub drum at this radius
const FRICTION_COUNT = PARAMS.clutch.surfaces / 2; // each friction plate has two faces
const PLATE_COUNT = 2 * FRICTION_COUNT - 1; // friction, steel, ..., friction
const GAP_MAX = 0.6 * MM; // per interface, fully released
const HUB_DRUM_LEN = 40 * MM;
const SPRING = { r: 32 * MM, h: 5 * MM, len: 7 * MM };

// Crank stub beside the primary drive gear: journal, two webs with the crankpin between, journal.
const CRANK = {
  journal: { x: [PRIMARY_X[1], -56 * MM], r: 15 * MM },
  web1: { x: [-56 * MM, -46 * MM], r: 38 * MM },
  pin: { x: [-46 * MM, -36 * MM], r: 13 * MM, throw: 24 * MM },
  web2: { x: [-36 * MM, -26 * MM], r: 38 * MM },
  stub: { x: [-26 * MM, -16 * MM], r: 15 * MM },
} as const;

// Dogs: five lugs on each facing face, the slider's narrower than the gear's, so the window in
// which a slider lug fits a gap is the simulation's windowDeg (26 + 30 + 16 = 72 degrees).
const DOGS = PARAMS.dogs.count;
const DOG_PITCH = (2 * Math.PI) / DOGS;
const DOG_SLIDER_W = deg(26);
const DOG_GEAR_W = DOG_PITCH - DOG_SLIDER_W - deg(PARAMS.dogs.windowDeg);
const DOG_GAP = DOG_PITCH - DOG_GEAR_W; // the gap between two gear lugs
// Two lugs of this length leave (pitch - face - 2 * LUG_LEN) between their tips at rest, which a
// slider closes at x = contactX: the tips meet exactly where the simulation tests alignment.
const LUG_LEN = (GEAR_PITCH - FACE_WIDTH - PARAMS.dogs.contactX * SLIDER_TRAVEL) / 2;
const DOG_R_FRACTION = 0.6; // lug outer radius as a fraction of the smaller facing gear
const C_HUB_R = 20 * MM; // the web joining third and fourth into one sliding piece

// Final drive.
const CHAIN_PITCH = 15.875 * MM;
const SPROCKET_R = CHAIN_PITCH / (2 * Math.sin(Math.PI / PARAMS.final.front));
const SPROCKET_X = [72 * MM, 80 * MM] as const;
const CHAIN_WRAP = { half: 6 * MM, h: 4 * MM };
// End-view inset, not to scale: sprocket radii keep the tooth ratio, the wheel does not.
const INSET = {
  front: { x: 104 * MM, y: 100 * MM, r: 6 * MM },
  rear: { x: 148 * MM, y: 100 * MM, r: (6 * MM * PARAMS.final.rear) / PARAMS.final.front },
  wheel: { r: 30 * MM, rim: 25 * MM },
  right: 182 * MM,
};

// Shift drum, unrolled: axial position across, drum angle down, scrolling under a fixed cursor.
const BAND = { x0: -62 * MM, x1: 62 * MM, y0: 116 * MM, y1: 192 * MM };
const CURSOR_Y = (BAND.y0 + BAND.y1) / 2;
const DRUM_R = 24 * MM; // a representative drum radius, developed true: arc length = DRUM_R * angle
const GROOVE_W = 4.6 * MM;
const PIN_R = 2.2 * MM;
const FORK_W = 3 * MM;
const TRACK_RANGE = [deg(-20), deg(320)] as const; // groove drawn beyond the end detents by this much
const STAR = { x: 79 * MM, y: CURSOR_Y, r: 14 * MM, hw: deg(13), depth: 3.2 * MM, depthN: 1.6 * MM };
const ROLLER_R = 3 * MM;
const ARM_PIVOT = { x: 86 * MM, y: CURSOR_Y + 22 * MM };

const SIGNS = [-1, 1] as const;
// the case wall between and either side of the bearings
const WALL_PIECES = [
  [WALL_Y[0], IN_Y - SHAFT_R.input - BEARING],
  [IN_Y + SHAFT_R.input + BEARING, OUT_Y - SHAFT_R.output - BEARING],
  [OUT_Y + SHAFT_R.output + BEARING, WALL_Y[1]],
] as const;

const DETENT_NAMES: readonly DetentName[] = [1, 'N', 2, 3, 4, 5, 6];
const DETENT_ANGLES: readonly number[] = DETENT_NAMES.map((n) => deg(PARAMS.drum.detents[n]));
const DETENT_LABELS: readonly string[] = DETENT_NAMES.map(String);

const GEAR_LABEL_Y = -36 * MM;
/** The whole drawing including labels, metres. */
const EXTENT = { x0: -158 * MM, x1: 182 * MM, y0: -140 * MM, y1: 204 * MM };

// ---------------------------------------------------------------------------------------------
// Sliders and their dogs.

interface DogSide { free: GearNo; face: GearNo; dir: -1 | 1; r: number }
interface SliderDraw { id: SliderId; shaft: Shaft; sense: 1 | -1; gears: GearNo[]; restX: number; neg: DogSide; pos: DogSide }

const SLIDERS: readonly SliderDraw[] = (['A', 'B', 'C'] as const).map((id) => {
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
const SLIDER_OF: Record<SliderId, SliderDraw> = { A: SLIDERS[0], B: SLIDERS[1], C: SLIDERS[2] };

/** Angular width of a slider's dog and of a gear's lug, drawn frame, rad. */
export const DOG_WIDTHS = { slider: DOG_SLIDER_W, gear: DOG_GEAR_W } as const;

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

const IDS: PartId[] = [];
const slot = (id: PartId): number => IDS.push(id) - 1;
const I_DRUM = slot('shiftDrum');
const I_FORK_C_ROD = slot('forkC'); // passes behind the output shaft and its gears
const I_OUT = slot('outputShaft');
const I_IN = slot('inputShaft');
const I_CRANK = slot('crank');
const I_PRIMARY = slot('primaryDrive');
const I_BASKET = slot('clutchBasket');
const I_HUB = slot('clutchHub');
const I_PLATE0 = IDS.length;
for (let i = 0; i < PLATE_COUNT; i++) slot(i % 2 === 0 ? 'frictionPlates' : 'steelPlates');
const I_PRESSURE = slot('pressurePlate');
const I_GEAR: Record<string, number> = {};
for (const g of GEAR_ORDER) for (const end of ['in', 'out'] as const) I_GEAR[`${g}${end}`] = slot(`gear${g}${end}`);
const I_FORK: Record<SliderId, number> = { A: slot('forkA'), B: slot('forkB'), C: slot('forkC') }; // C: the yoke
const I_SPROCKET = slot('sprocket');
const I_WHEEL = slot('rearWheel');
const I_REAR = slot('rearSprocket');
const I_SPROCKET_END = slot('sprocket'); // the front sprocket again, in the end view
const I_CHAIN_TOP = slot('chain');
const I_CHAIN_BOTTOM = slot('chain');
const I_STAR = slot('starWheel');
const I_ARM = slot('detentArm');

const GEAR_OF: Partial<Record<PartId, { g: GearNo; shaft: Shaft }>> = {};
for (const g of GEAR_ORDER) { GEAR_OF[`gear${g}in`] = { g, shaft: 'input' }; GEAR_OF[`gear${g}out`] = { g, shaft: 'output' }; }
const gearIndex = (shaft: Shaft, g: GearNo): number => I_GEAR[`${g}${shaft === 'input' ? 'in' : 'out'}`];

function setBox(out: PartShape[], i: number, x0: number, y0: number, x1: number, y1: number): void {
  const s = out[i];
  s.x = Math.min(x0, x1); s.y = Math.min(y0, y1);
  s.w = Math.abs(x1 - x0); s.h = Math.abs(y1 - y0);
}

/** Axial offset of a slider from rest, m. */
const sliderShift = (state: SimState, id: SliderId): number => state.sliders[id].x * SLIDER_TRAVEL;
/** Axial centre of a gear as drawn, m. */
function gearX(state: SimState, shaft: Shaft, g: GearNo): number {
  const id = sliderOfGear(shaft, g);
  return gearAxialPosition(g) + (id === null ? 0 : sliderShift(state, id));
}
/** Axial position of a fork's pin: where its groove is at the current drum angle, m. */
const pinX = (state: SimState, s: SliderDraw): number =>
  s.restX + grooveCommand(s.id, state.drum.angle) * SLIDER_TRAVEL;
/** Clutch plate separation, 0 clamped .. 1 fully released. */
const separation = (state: SimState): number => 1 - clamp(state.clutch.capacity / clutchCapacityMax, 0, 1);

// Chain tangents in the end view, fixed: unit normal shared by both tangent points of each strand.
const CHAIN_SIN = (INSET.rear.r - INSET.front.r) / (INSET.rear.x - INSET.front.x);
const CHAIN_COS = Math.sqrt(1 - CHAIN_SIN * CHAIN_SIN);
const tangent = (c: { x: number; y: number; r: number }, top: boolean) => ({
  x: c.x - c.r * CHAIN_SIN, y: c.y + (top ? -1 : 1) * c.r * CHAIN_COS,
});
const CHAIN_PTS = {
  frontTop: tangent(INSET.front, true), rearTop: tangent(INSET.rear, true),
  frontBottom: tangent(INSET.front, false), rearBottom: tangent(INSET.rear, false),
};

/** Writes where every part is drawn for this state into `out` (made by newShapes). */
function layout(state: SimState, out: PartShape[]): void {
  setBox(out, I_DRUM, BAND.x0, BAND.y0, BAND.x1, BAND.y1);
  setBox(out, I_OUT, OUT_SHAFT_X[0], OUT_Y - SHAFT_R.output, OUT_SHAFT_X[1], OUT_Y + SHAFT_R.output);
  setBox(out, I_IN, IN_SHAFT_X[0], IN_Y - SHAFT_R.input, IN_SHAFT_X[1], IN_Y + SHAFT_R.input);
  setBox(out, I_CRANK, CRANK.journal.x[0], CRANK_Y - CRANK.web1.r, CRANK.stub.x[1], CRANK_Y + CRANK.web1.r);
  setBox(out, I_PRIMARY, PRIMARY_X[0], CRANK_Y - DRIVE_R, PRIMARY_X[1], CRANK_Y + DRIVE_R);
  setBox(out, I_BASKET, BASKET_MOUTH_X, -BASKET_R, PRIMARY_X[1], BASKET_R);
  setBox(out, I_HUB, HUB_X[0], -HUB_R, HUB_X[1], HUB_R);

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

  for (const g of GEAR_ORDER) {
    for (const shaft of ['input', 'output'] as const) {
      const cx = gearX(state, shaft, g), r = pitchRadius(shaft, g), y = AXIS_Y[shaft];
      setBox(out, gearIndex(shaft, g), cx - FACE_WIDTH / 2, y - r, cx + FACE_WIDTH / 2, y + r);
    }
  }

  for (const s of SLIDERS) {
    const body = s.restX + sliderShift(state, s.id), pin = pinX(state, s);
    const x0 = Math.min(body, pin) - FORK_W / 2, x1 = Math.max(body, pin) + FORK_W / 2;
    if (s.shaft === 'output') {
      setBox(out, I_FORK[s.id], x0, OUT_Y + SHAFT_R.output + 1.5 * MM, x1, CURSOR_Y + PIN_R);
    } else {
      setBox(out, I_FORK_C_ROD, x0, IN_Y + C_HUB_R, x1, CURSOR_Y + PIN_R);
      setBox(out, I_FORK[s.id], body - FORK_W / 2, IN_Y + SHAFT_R.input + 1 * MM, body + FORK_W / 2, IN_Y + C_HUB_R);
    }
  }

  setBox(out, I_SPROCKET, SPROCKET_X[0], OUT_Y - SPROCKET_R, SPROCKET_X[1], OUT_Y + SPROCKET_R);
  const { front, rear, wheel } = INSET;
  setBox(out, I_WHEEL, rear.x - wheel.r, rear.y - wheel.r, rear.x + wheel.r, rear.y + wheel.r);
  setBox(out, I_REAR, rear.x - rear.r, rear.y - rear.r, rear.x + rear.r, rear.y + rear.r);
  setBox(out, I_SPROCKET_END, front.x - front.r, front.y - front.r, front.x + front.r, front.y + front.r);
  const c = CHAIN_PTS, pad = 1.5 * MM;
  setBox(out, I_CHAIN_TOP, c.frontTop.x, c.frontTop.y - pad, c.rearTop.x, c.rearTop.y + pad);
  setBox(out, I_CHAIN_BOTTOM, c.frontBottom.x, c.frontBottom.y + pad, c.rearBottom.x, c.rearBottom.y - pad);
  setBox(out, I_STAR, STAR.x - STAR.r, STAR.y - STAR.r, STAR.x + STAR.r, STAR.y + STAR.r);
  setBox(out, I_ARM, ARM_PIVOT.x - 2 * MM, STAR.y - ROLLER_R, STAR.x + STAR.r + 2 * ROLLER_R, ARM_PIVOT.y + 2 * MM);
}

const newShapes = (): PartShape[] => IDS.map((id) => ({ id, x: 0, y: 0, w: 0, h: 0 }));

/** Pure: where every part is drawn for this state, in model metres on the schematic plane. */
export function schematicShapes(state: SimState): PartShape[] {
  const out = newShapes();
  layout(state, out);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Drawing.

const TWO_PI = 2 * Math.PI;
/** Angle into (-π, π]. */
const norm = (a: number): number => a - TWO_PI * Math.round(a / TWO_PI);
const LABEL_PX = 11;
const LINE_PX = 14;
const TORQUE_FULL = 150; // N·m at which a part carrying torque is filled at full opacity
const DASH: number[] = [7, 5];
const NO_DASH: number[] = [];
const MAX_FLOW = 48;

/** Radius of the star wheel's profile at drum angle a: notched at every detent, shallow at neutral. */
function starRadius(a: number): number {
  let r = STAR.r;
  for (let i = 0; i < DETENT_ANGLES.length; i++) {
    const d = Math.abs(norm(a - DETENT_ANGLES[i]));
    if (d >= STAR.hw) continue;
    const depth = DETENT_NAMES[i] === 'N' ? STAR.depthN : STAR.depth;
    r = Math.min(r, STAR.r - depth * (0.5 + 0.5 * Math.cos((Math.PI * d) / STAR.hw)));
  }
  return r;
}

export function createSchematic(canvas: HTMLCanvasElement): View {
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('2D canvas is not available');
  const mono = getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim()
    || 'ui-monospace, monospace';
  const font = `${LABEL_PX}px ${mono}`;

  const shapes = newShapes();
  let laidOut = false;
  let cssW = 0, cssH = 0, dpr = 1, scale = 0, ox = 0, oy = 0;
  let highlight: PartId | null = null;
  let hatch: CanvasPattern | null = null;
  const hot = new Set<PartId>();
  let hotAlpha = 1;
  const flow = new Float64Array(MAX_FLOW * 2);
  let flowN = 0;
  let drumText = '';
  let drumTextDeg = NaN;

  const X = (x: number): number => ox + x * scale;
  const Y = (y: number): number => oy + y * scale;
  const L = (d: number): number => d * scale;
  const snap = (v: number): number => Math.round(v * dpr) / dpr;
  /** Centre of a 1 CSS px line, on device pixels. */
  const line1 = (v: number): number => {
    const o = (dpr % 2) / 2;
    return (Math.round(v * dpr - o) + o) / dpr;
  };

  function makeHatch(): void {
    const size = Math.max(1, Math.round(6 * dpr));
    const tile = document.createElement('canvas');
    tile.width = size; tile.height = size;
    const t = tile.getContext('2d');
    if (!t) { hatch = null; return; }
    t.strokeStyle = COLORS.signal;
    t.lineWidth = Math.max(1, dpr * 1.25);
    t.beginPath();
    t.moveTo(-1, size + 1); t.lineTo(size + 1, -1);
    t.moveTo(-1, 1); t.lineTo(1, -1);
    t.moveTo(size - 1, size + 1); t.lineTo(size + 1, size - 1);
    t.stroke();
    hatch = ctx!.createPattern(tile, 'repeat');
    if (hatch && typeof DOMMatrix !== 'undefined') hatch.setTransform(new DOMMatrix([1 / dpr, 0, 0, 1 / dpr, 0, 0]));
  }

  /** A filled box in model coordinates, snapped to device pixels, with an optional 1px inner outline. */
  function box(x0: number, y0: number, x1: number, y1: number, fill: string | null, outline: string | null): void {
    const a = snap(X(x0)), b = snap(Y(y0));
    const w = Math.max(1 / dpr, snap(X(x1)) - a), h = Math.max(1 / dpr, snap(Y(y1)) - b);
    if (fill) { ctx!.fillStyle = fill; ctx!.fillRect(a, b, w, h); }
    if (outline && w > 3 && h > 3) {
      ctx!.strokeStyle = outline; ctx!.lineWidth = 1;
      ctx!.strokeRect(a + 0.5, b + 0.5, w - 1, h - 1);
    }
  }
  /** Torque overlay on a box: signal at the path opacity, hatched instead when `hatched`. */
  function hotBox(x0: number, y0: number, x1: number, y1: number, hatched = false): void {
    const a = snap(X(x0)), b = snap(Y(y0));
    const w = Math.max(1 / dpr, snap(X(x1)) - a), h = Math.max(1 / dpr, snap(Y(y1)) - b);
    ctx!.globalAlpha = hotAlpha;
    ctx!.fillStyle = hatched && hatch ? hatch : COLORS.signal;
    ctx!.fillRect(a, b, w, h);
    ctx!.globalAlpha = 1;
  }
  /** A part's box: base fill, torque overlay when it carries torque, outline. */
  function part(id: PartId, x0: number, y0: number, x1: number, y1: number, fill: string, outline: string | null = COLORS.third): void {
    box(x0, y0, x1, y1, fill, null);
    if (hot.has(id)) hotBox(x0, y0, x1, y1);
    if (outline) box(x0, y0, x1, y1, null, outline);
  }

  /**
   * Teeth (or tabs) seen side-on: one line across the face per tooth on the near half, at height
   * r sin θ, so they sweep at the part's angular rate and crowd toward the top and bottom edges.
   */
  function ticks(x0: number, x1: number, axisY: number, r: number, angle: number, count: number, colour: string, alpha: number): void {
    const a = snap(X(x0)), b = snap(X(x1));
    if (b - a < 2) return;
    ctx!.strokeStyle = colour; ctx!.globalAlpha = alpha; ctx!.lineWidth = 1;
    ctx!.beginPath();
    const step = TWO_PI / count;
    for (let k = 0; k < count; k++) {
      const th = angle + k * step;
      if (Math.cos(th) <= 0.08) continue; // the far half, and teeth seen edge-on at the rim
      const y = line1(Y(axisY - r * Math.sin(th)));
      ctx!.moveTo(a + 1, y); ctx!.lineTo(b - 1, y);
    }
    ctx!.stroke();
    ctx!.globalAlpha = 1;
  }
  const tickColour = (id: PartId): string => (hot.has(id) ? COLORS.ground : COLORS.third);

  function drawGear(state: SimState, shaft: Shaft, g: GearNo): void {
    const s = shapes[gearIndex(shaft, g)];
    const kind = gearKind(shaft, g);
    part(s.id, s.x, s.y, s.x + s.w, s.y + s.h, kind === 'free' ? COLORS.steel1 : COLORS.steel2);
    const teeth = PARAMS.gears[g][shaft === 'input' ? 0 : 1];
    ticks(s.x, s.x + s.w, AXIS_Y[shaft], s.h / 2, gearAngle(shaft, g, state.angles), teeth, tickColour(s.id), 0.55);
  }

  /**
   * Five lugs on one face, seen side-on: a lug whose centre is at θ shows between the heights of
   * its two edges and only on the near half (cos θ > 0).
   */
  function lugs(id: PartId, axisY: number, r: number, x0: number, x1: number, first: number, width: number, fill: string): void {
    for (let k = 0; k < DOGS; k++) {
      const th = norm(first + k * DOG_PITCH);
      if (Math.cos(th) <= 0) continue;
      const hi = th + width / 2 > Math.PI / 2 ? 1 : Math.sin(th + width / 2);
      const lo = th - width / 2 < -Math.PI / 2 ? -1 : Math.sin(th - width / 2);
      part(id, x0, axisY - r * hi, x1, axisY - r * lo, fill);
    }
  }

  /**
   * The dogs on both faces of a slider and the lugs on the free gears facing them, placed by
   * dogLugAngles; when the slider is blocked at the contact point the lugs face each other tip to tip.
   */
  function drawDogs(state: SimState, s: SliderDraw): void {
    for (const sideName of ['neg', 'pos'] as const) {
      const side = s[sideName];
      const face = shapes[gearIndex(s.shaft, side.face)];
      const gear = shapes[gearIndex(s.shaft, side.free)];
      const axisY = AXIS_Y[s.shaft];
      const sliderFace = side.dir < 0 ? face.x : face.x + face.w;
      const gearFace = side.dir < 0 ? gear.x + gear.w : gear.x;
      const a = dogLugAngles(state, s.id, sideName);
      lugs(gear.id, axisY, side.r, gearFace, gearFace - side.dir * LUG_LEN, a.gear, DOG_GEAR_W, COLORS.steel1);
      lugs(face.id, axisY, side.r, sliderFace, sliderFace + side.dir * LUG_LEN, a.slider, DOG_SLIDER_W, COLORS.steel2);
    }
  }

  function quad(xa: number, ya: number, xb: number, yb: number, halfW: number): void {
    ctx!.beginPath();
    ctx!.moveTo(X(xa - halfW), Y(ya)); ctx!.lineTo(X(xa + halfW), Y(ya));
    ctx!.lineTo(X(xb + halfW), Y(yb)); ctx!.lineTo(X(xb - halfW), Y(yb));
    ctx!.closePath();
  }
  function drawForkRod(id: PartId, pin: number, body: number, topY: number): void {
    quad(pin, CURSOR_Y, body, topY, FORK_W / 2);
    ctx!.fillStyle = COLORS.steel3; ctx!.fill();
    ctx!.strokeStyle = COLORS.third; ctx!.lineWidth = 1; ctx!.stroke();
    if (hot.has(id)) { ctx!.globalAlpha = hotAlpha; ctx!.fillStyle = COLORS.signal; ctx!.fill(); ctx!.globalAlpha = 1; }
  }

  function circle(x: number, y: number, r: number): void {
    ctx!.beginPath(); ctx!.arc(X(x), Y(y), Math.max(0.5, L(r)), 0, TWO_PI);
  }
  function fillCircle(id: PartId | null, x: number, y: number, r: number, fill: string, outline: string | null = COLORS.third): void {
    circle(x, y, r);
    ctx!.fillStyle = fill; ctx!.fill();
    if (id && hot.has(id)) { ctx!.globalAlpha = hotAlpha; ctx!.fillStyle = COLORS.signal; ctx!.fill(); ctx!.globalAlpha = 1; }
    if (outline) { ctx!.strokeStyle = outline; ctx!.lineWidth = 1; ctx!.stroke(); }
  }
  /** Radial ticks round an end-view circle, turning at `angle`. */
  function radialTicks(x: number, y: number, r0: number, r1: number, angle: number, count: number, colour: string, width: number): void {
    ctx!.strokeStyle = colour; ctx!.lineWidth = width;
    ctx!.beginPath();
    for (let k = 0; k < count; k++) {
      const th = angle + (k * TWO_PI) / count, c = Math.cos(th), s = Math.sin(th);
      ctx!.moveTo(X(x + r0 * c), Y(y + r0 * s)); ctx!.lineTo(X(x + r1 * c), Y(y + r1 * s));
    }
    ctx!.stroke();
  }

  function label(x: number, y: number, text: string, align: CanvasTextAlign, colour: string = COLORS.third, dyPx = 0, dxPx = 0): void {
    ctx!.fillStyle = colour; ctx!.textAlign = align;
    ctx!.fillText(text, Math.round(X(x) + dxPx), Math.round(Y(y) + dyPx));
  }

  // --- the drum band ------------------------------------------------------------------------
  const rowY = (a: number, current: number): number => CURSOR_Y + (a - current) * DRUM_R;

  function drawDrum(state: SimState): void {
    const cur = state.drum.angle;
    part('shiftDrum', BAND.x0, BAND.y0, BAND.x1, BAND.y1, COLORS.steel1);
    const bx0 = snap(X(BAND.x0)), bx1 = snap(X(BAND.x1)), by0 = snap(Y(BAND.y0)), by1 = snap(Y(BAND.y1));
    ctx!.save();
    ctx!.beginPath(); ctx!.rect(bx0 + 1, by0 + 1, bx1 - bx0 - 2, by1 - by0 - 2); ctx!.clip();
    // detent rows
    ctx!.strokeStyle = COLORS.steel2; ctx!.lineWidth = 1;
    ctx!.beginPath();
    for (const a of DETENT_ANGLES) {
      const y = line1(Y(rowY(a, cur)));
      ctx!.moveTo(bx0, y); ctx!.lineTo(bx1, y);
    }
    ctx!.stroke();
    // grooves: each the profile of grooveCommand against drum angle, under its slider
    const half = (BAND.y1 - BAND.y0) / 2 / DRUM_R + deg(4);
    const a0 = Math.max(TRACK_RANGE[0], cur - half), a1 = Math.min(TRACK_RANGE[1], cur + half);
    ctx!.strokeStyle = COLORS.ground; ctx!.lineWidth = L(GROOVE_W); ctx!.lineCap = 'round'; ctx!.lineJoin = 'round';
    for (const s of SLIDERS) {
      ctx!.beginPath();
      const step = deg(0.75);
      for (let a = a0; a <= a1 + step / 2; a += step) {
        const aa = Math.min(a, a1);
        const px = X(s.restX + grooveCommand(s.id, aa) * SLIDER_TRAVEL), py = Y(rowY(aa, cur));
        if (a === a0) ctx!.moveTo(px, py); else ctx!.lineTo(px, py);
      }
      ctx!.stroke();
    }
    ctx!.lineCap = 'butt';
    ctx!.restore();
    // cursor at the current angle, with end marks outside the band
    const cy = line1(Y(CURSOR_Y));
    ctx!.strokeStyle = COLORS.ink; ctx!.lineWidth = 1;
    ctx!.beginPath(); ctx!.moveTo(bx0 - 4, cy); ctx!.lineTo(bx1 + 4, cy); ctx!.stroke();
    ctx!.fillStyle = COLORS.ink;
    ctx!.beginPath(); ctx!.moveTo(bx0 - 4, cy - 4); ctx!.lineTo(bx0, cy); ctx!.lineTo(bx0 - 4, cy + 4); ctx!.fill();
    ctx!.beginPath(); ctx!.moveTo(bx1 + 4, cy - 4); ctx!.lineTo(bx1, cy); ctx!.lineTo(bx1 + 4, cy + 4); ctx!.fill();
    // detent labels on the left edge, at their angles, while they are on the band
    for (let i = 0; i < DETENT_ANGLES.length; i++) {
      const y = rowY(DETENT_ANGLES[i], cur);
      if (y < BAND.y0 + 1 * MM || y > BAND.y1 - 1 * MM) continue;
      const seated = state.drum.detent === DETENT_NAMES[i];
      ctx!.fillStyle = seated ? COLORS.ink : COLORS.third; ctx!.textAlign = 'right';
      ctx!.fillText(DETENT_LABELS[i], Math.round(bx0 - 8), Math.round(Y(y)));
    }
  }

  function drawStar(state: SimState): void {
    const cur = state.drum.angle;
    ctx!.beginPath();
    const n = 120;
    for (let i = 0; i <= n; i++) {
      const psi = (i / n) * TWO_PI; // screen angle; psi = 0 faces the roller, a later detent lies below
      const r = starRadius(cur + psi);
      const px = X(STAR.x + r * Math.cos(psi)), py = Y(STAR.y + r * Math.sin(psi));
      if (i === 0) ctx!.moveTo(px, py); else ctx!.lineTo(px, py);
    }
    ctx!.closePath();
    ctx!.fillStyle = COLORS.steel2; ctx!.fill();
    if (hot.has('starWheel')) { ctx!.globalAlpha = hotAlpha; ctx!.fillStyle = COLORS.signal; ctx!.fill(); ctx!.globalAlpha = 1; }
    ctx!.strokeStyle = COLORS.third; ctx!.lineWidth = 1; ctx!.stroke();
    fillCircle(null, STAR.x, STAR.y, 3 * MM, COLORS.steel3);
    // the detent arm's roller rides the profile where it faces the cursor
    const rx = STAR.x + starRadius(cur) + ROLLER_R;
    ctx!.strokeStyle = COLORS.steel3; ctx!.lineWidth = Math.max(2, L(2.4 * MM));
    ctx!.beginPath(); ctx!.moveTo(X(ARM_PIVOT.x), Y(ARM_PIVOT.y)); ctx!.lineTo(X(rx), Y(STAR.y)); ctx!.stroke();
    fillCircle('detentArm', ARM_PIVOT.x, ARM_PIVOT.y, 1.8 * MM, COLORS.steel2);
    fillCircle('detentArm', rx, STAR.y, ROLLER_R, COLORS.steel3);
  }

  // --- the clutch and crank -----------------------------------------------------------------
  function drawCrank(crankAngle: number): void {
    const c = CRANK;
    part('crank', c.journal.x[0], CRANK_Y - c.journal.r, c.journal.x[1], CRANK_Y + c.journal.r, COLORS.steel3);
    part('crank', c.stub.x[0], CRANK_Y - c.stub.r, c.stub.x[1], CRANK_Y + c.stub.r, COLORS.steel3);
    const pinY = CRANK_Y - c.pin.throw * Math.sin(crankAngle);
    part('crank', c.pin.x[0], pinY - c.pin.r, c.pin.x[1], pinY + c.pin.r, COLORS.steel3);
    part('crank', c.web1.x[0], CRANK_Y - c.web1.r, c.web1.x[1], CRANK_Y + c.web1.r, COLORS.steel2);
    part('crank', c.web2.x[0], CRANK_Y - c.web2.r, c.web2.x[1], CRANK_Y + c.web2.r, COLORS.steel2);
    // break line where the crank continues
    const bx = X(c.stub.x[1]);
    ctx!.strokeStyle = COLORS.third; ctx!.lineWidth = 1;
    ctx!.beginPath();
    ctx!.moveTo(bx, Y(CRANK_Y - c.stub.r)); ctx!.lineTo(bx + 3, Y(CRANK_Y - c.stub.r / 3));
    ctx!.lineTo(bx - 3, Y(CRANK_Y + c.stub.r / 3)); ctx!.lineTo(bx, Y(CRANK_Y + c.stub.r));
    ctx!.stroke();
    part('primaryDrive', PRIMARY_X[0], CRANK_Y - DRIVE_R, PRIMARY_X[1], CRANK_Y + DRIVE_R, COLORS.steel2);
    ticks(PRIMARY_X[0], PRIMARY_X[1], CRANK_Y, DRIVE_R, crankAngle, PARAMS.primary.drive, tickColour('primaryDrive'), 0.5);
  }

  function drawClutch(basketAngle: number, inputAngle: number, slipping: boolean): void {
    // basket: rim in section, back wall, and the primary driven gear riveted to it
    part('clutchBasket', BASKET_MOUTH_X, -BASKET_R, BASKET_BACK_X[0], -BASKET_R + BASKET_RIM, COLORS.steel2);
    part('clutchBasket', BASKET_MOUTH_X, BASKET_R - BASKET_RIM, BASKET_BACK_X[0], BASKET_R, COLORS.steel2);
    part('clutchBasket', BASKET_BACK_X[0], -BASKET_R, BASKET_BACK_X[1], BASKET_R, COLORS.steel2);
    part('clutchBasket', PRIMARY_X[0], -DRIVEN_R, PRIMARY_X[1], DRIVEN_R, COLORS.steel2);
    ticks(PRIMARY_X[0], PRIMARY_X[1], IN_Y, DRIVEN_R, basketAngle, PARAMS.primary.driven, tickColour('clutchBasket'), 0.45);
    part('clutchHub', HUB_X[0], -HUB_R, HUB_X[1], HUB_R, COLORS.steel2);
    // the hub's drum carrying the steel plates, seen between the plates when they part
    part('clutchHub', HUB_X[0] - HUB_DRUM_LEN, -STEEL_INNER_R, HUB_X[0], STEEL_INNER_R, COLORS.steel2, null);
    for (let i = 0; i < PLATE_COUNT; i++) {
      const s = shapes[I_PLATE0 + i];
      const friction = i % 2 === 0;
      box(s.x, s.y, s.x + s.w, s.y + s.h, friction ? COLORS.steel1 : COLORS.steel3, null);
      if (hot.has(s.id)) hotBox(s.x, s.y, s.x + s.w, s.y + s.h, slipping);
      if (L(s.w) >= 5) box(s.x, s.y, s.x + s.w, s.y + s.h, null, COLORS.third);
      ticks(s.x, s.x + s.w, IN_Y, s.h / 2, friction ? basketAngle : inputAngle, friction ? 8 : 10,
        hot.has(s.id) && !slipping ? COLORS.ground : COLORS.third, 0.6);
    }
    const p = shapes[I_PRESSURE];
    part('pressurePlate', p.x, p.y, p.x + p.w, p.y + p.h, COLORS.steel2);
    for (const sign of SIGNS) {
      const y = sign * SPRING.r;
      box(p.x - SPRING.len, y - SPRING.h / 2, p.x, y + SPRING.h / 2, COLORS.steel3, COLORS.third);
    }
  }

  function drawCase(): void {
    for (const [x0, x1] of WALLS) {
      for (const [ya, yb] of WALL_PIECES) box(x0, ya, x1, yb, COLORS.steel1, null);
      for (const shaft of ['input', 'output'] as const) {
        const y = AXIS_Y[shaft], r = SHAFT_R[shaft];
        box(x0, y - r - BEARING, x1, y - r, COLORS.steel2, null);
        box(x0, y + r, x1, y + r + BEARING, COLORS.steel2, null);
      }
    }
  }

  // --- final drive ----------------------------------------------------------------------------
  function drawFinalDrive(outAngle: number, wheelAngle: number): void {
    const chainFill = COLORS.steel3;
    part('sprocket', SPROCKET_X[0], OUT_Y - SPROCKET_R, SPROCKET_X[1], OUT_Y + SPROCKET_R, COLORS.steel2);
    ticks(SPROCKET_X[0], SPROCKET_X[1], OUT_Y, SPROCKET_R, outAngle, PARAMS.final.front, tickColour('sprocket'), 0.55);
    const cx = (SPROCKET_X[0] + SPROCKET_X[1]) / 2, w = CHAIN_WRAP;
    for (const sign of SIGNS) {
      const y = OUT_Y + sign * SPROCKET_R;
      part('chain', cx - w.half, y - w.h / 2, cx + w.half, y + w.h / 2, chainFill);
    }
    box(OUT_SHAFT_X[1] - 4 * MM, OUT_Y - 9 * MM, OUT_SHAFT_X[1], OUT_Y + 9 * MM, COLORS.steel2, COLORS.third); // nut
    // leader from the edge-on sprocket to the end view
    ctx!.strokeStyle = COLORS.third; ctx!.lineWidth = 1; ctx!.setLineDash(DASH);
    ctx!.beginPath();
    ctx!.moveTo(X(cx + w.half + 1 * MM), Y(OUT_Y + SPROCKET_R));
    ctx!.lineTo(X(INSET.front.x - INSET.front.r - 3 * MM), Y(INSET.front.y));
    ctx!.stroke(); ctx!.setLineDash(NO_DASH);

    const { front, rear, wheel } = INSET;
    // ground under the wheel
    const gy = line1(Y(rear.y + wheel.r));
    ctx!.strokeStyle = COLORS.third; ctx!.lineWidth = 1;
    ctx!.beginPath(); ctx!.moveTo(X(rear.x - wheel.r - 6 * MM), gy); ctx!.lineTo(X(rear.x + wheel.r + 4 * MM), gy); ctx!.stroke();
    // wheel: tyre, rim and five spokes
    fillCircle('rearWheel', rear.x, rear.y, wheel.r, COLORS.steel2);
    fillCircle(null, rear.x, rear.y, wheel.rim, COLORS.ground, COLORS.third);
    radialTicks(rear.x, rear.y, 3 * MM, wheel.rim, wheelAngle, 5, hot.has('rearWheel') ? COLORS.signal : COLORS.steel3, Math.max(1.5, L(2 * MM)));
    // rear sprocket
    fillCircle('rearSprocket', rear.x, rear.y, rear.r, COLORS.steel2);
    radialTicks(rear.x, rear.y, rear.r - 1.6 * MM, rear.r, wheelAngle, PARAMS.final.rear, tickColour('rearSprocket'), 1);
    fillCircle(null, rear.x, rear.y, 4 * MM, COLORS.steel3);
    // front sprocket
    fillCircle('sprocket', front.x, front.y, front.r, COLORS.steel2);
    radialTicks(front.x, front.y, front.r - 1.4 * MM, front.r, outAngle, PARAMS.final.front, tickColour('sprocket'), 1);
    fillCircle(null, front.x, front.y, 2 * MM, COLORS.steel3);
    // chain loop: top strand, round the rear sprocket, bottom strand, round the front
    const c = CHAIN_PTS;
    const topAngle = Math.atan2(-CHAIN_COS, -CHAIN_SIN), bottomAngle = Math.atan2(CHAIN_COS, -CHAIN_SIN);
    const chainPath = (): void => {
      ctx!.beginPath();
      ctx!.moveTo(X(c.frontTop.x), Y(c.frontTop.y));
      ctx!.lineTo(X(c.rearTop.x), Y(c.rearTop.y));
      ctx!.arc(X(rear.x), Y(rear.y), L(rear.r), topAngle, bottomAngle, false);
      ctx!.lineTo(X(c.frontBottom.x), Y(c.frontBottom.y));
      ctx!.arc(X(front.x), Y(front.y), L(front.r), bottomAngle, topAngle + TWO_PI, false);
    };
    const chainW = Math.max(2, L(2.4 * MM));
    chainPath();
    ctx!.strokeStyle = chainFill; ctx!.lineWidth = chainW; ctx!.stroke();
    if (hot.has('chain')) { ctx!.globalAlpha = hotAlpha; ctx!.strokeStyle = COLORS.signal; ctx!.stroke(); ctx!.globalAlpha = 1; }
    // links travel with the sprocket's rim: offset grows as the drawn angle falls (forward drive)
    const linkPx = Math.max(3, L(CHAIN_PITCH * (front.r / SPROCKET_R)));
    LINKS[0] = linkPx * 0.35; LINKS[1] = linkPx * 0.65;
    ctx!.setLineDash(LINKS);
    const travel = -outAngle * L(front.r);
    ctx!.lineDashOffset = ((travel % linkPx) + linkPx) % linkPx;
    ctx!.strokeStyle = COLORS.ground; ctx!.lineWidth = chainW * 0.45; ctx!.stroke();
    ctx!.setLineDash(NO_DASH); ctx!.lineDashOffset = 0;
  }
  const LINKS: number[] = [1, 2];

  // --- torque line ----------------------------------------------------------------------------
  function push(x: number, y: number): void {
    if (flowN > 0 && Math.abs(flow[2 * flowN - 2] - x) < 1e-6 && Math.abs(flow[2 * flowN - 1] - y) < 1e-6) return;
    if (flowN >= MAX_FLOW) return;
    flow[2 * flowN] = x; flow[2 * flowN + 1] = y; flowN++;
  }
  /** The slider body and the dogs between its face and the gear it has locked, on the shaft axis. */
  function pushDog(state: SimState, g: GearNo): void {
    for (const s of SLIDERS) {
      for (const sideName of ['neg', 'pos'] as const) {
        const side = s[sideName];
        if (side.free !== g) continue;
        const face = shapes[gearIndex(s.shaft, side.face)], gear = shapes[gearIndex(s.shaft, side.free)];
        const fx = side.dir < 0 ? face.x : face.x + face.w, gx = side.dir < 0 ? gear.x + gear.w : gear.x;
        const body = s.restX + sliderShift(state, s.id);
        // on the axis: the line runs through the slider body and the engaged dogs
        if (s.shaft === 'output') { push((fx + gx) / 2, OUT_Y); push(body, OUT_Y); } else { push(body, IN_Y); push((fx + gx) / 2, IN_Y); }
      }
    }
  }
  function buildFlow(state: SimState, path: TorquePath): void {
    flowN = 0;
    const plates = shapes[I_PLATE0 + Math.floor(PLATE_COUNT / 2)];
    const stackX = plates.x + plates.w / 2;
    const parts = path.parts;
    for (let i = 0; i < parts.length; i++) {
      const id = parts[i];
      const next = parts[i + 1];
      switch (id) {
        case 'crank': push((CRANK.journal.x[0] + CRANK.stub.x[1]) / 2, CRANK_Y); break;
        case 'primaryDrive': push((PRIMARY_X[0] + PRIMARY_X[1]) / 2, CRANK_Y); break;
        case 'clutchBasket': push((PRIMARY_X[0] + PRIMARY_X[1]) / 2, -DRIVEN_R + 10 * MM); break;
        case 'frictionPlates': push(stackX, -DRIVEN_R + 10 * MM); break;
        case 'steelPlates': push(stackX, -40 * MM); break;
        case 'clutchHub': push(stackX, -22 * MM); break;
        case 'inputShaft': {
          push(stackX, IN_Y);
          if (next === undefined) push(0, IN_Y);
          break;
        }
        case 'outputShaft': break; // the line runs along its axis from the gear to the sprocket
        case 'sprocket': push((SPROCKET_X[0] + SPROCKET_X[1]) / 2, OUT_Y); break;
        case 'chain':
          push((SPROCKET_X[0] + SPROCKET_X[1]) / 2, OUT_Y + SPROCKET_R);
          push(CHAIN_PTS.frontTop.x, CHAIN_PTS.frontTop.y);
          push(CHAIN_PTS.rearTop.x, CHAIN_PTS.rearTop.y);
          break;
        case 'rearSprocket': push(INSET.rear.x, INSET.rear.y); break;
        case 'rearWheel': push(INSET.rear.x, INSET.rear.y + INSET.wheel.r); break;
        default: {
          const gearOf = GEAR_OF[id];
          if (!gearOf) break;
          const { g, shaft } = gearOf;
          const free = gearKind(shaft, g) === 'free';
          // a free input gear takes its drive from the slider's dogs; a free output gear gives it to them
          if (shaft === 'input' && free) pushDog(state, g);
          push(gearX(state, shaft, g), AXIS_Y[shaft]);
          if (shaft === 'output' && free) pushDog(state, g);
        }
      }
    }
  }
  function drawFlow(path: TorquePath): void {
    if (flowN < 2) return;
    const trace = (): void => {
      ctx!.beginPath();
      ctx!.moveTo(X(flow[0]), Y(flow[1]));
      for (let i = 1; i < flowN; i++) ctx!.lineTo(X(flow[2 * i]), Y(flow[2 * i + 1]));
    };
    ctx!.lineJoin = 'round'; ctx!.lineCap = 'round';
    // engine braking: dashed, casing and all, so the parts show through the gaps
    ctx!.setLineDash(path.torque < 0 ? DASH : NO_DASH);
    trace(); ctx!.strokeStyle = COLORS.ground; ctx!.lineWidth = 6; ctx!.stroke();
    trace(); ctx!.strokeStyle = COLORS.signal; ctx!.lineWidth = 2.5; ctx!.stroke();
    ctx!.setLineDash(NO_DASH);
    ctx!.lineJoin = 'miter'; ctx!.lineCap = 'butt';
  }

  function drawLabels(state: SimState): void {
    label(CRANK.stub.x[1] + 4 * MM, CRANK_Y, 'Crank', 'left');
    label((BASKET_MOUTH_X + BASKET_BACK_X[0]) / 2, -BASKET_R - 6 * MM, 'Clutch', 'center');
    for (const g of GEAR_ORDER) {
      label(gearAxialPosition(g), GEAR_LABEL_Y, String(g), 'center', state.lockedGear === g ? COLORS.ink : COLORS.third);
    }
    label(IN_SHAFT_X[1] + 4 * MM, IN_Y, 'Input shaft', 'left');
    label(OUT_SHAFT_X[1] + 4 * MM, OUT_Y, 'Output shaft', 'left');
    const lx = BAND.x0, ldx = -26; // clear of the detent labels on the band's edge
    const d = Math.round(toDeg(state.drum.angle));
    if (d !== drumTextDeg) { drumTextDeg = d; drumText = `${d}°`; }
    label(lx, CURSOR_Y, 'Shift drum', 'right', COLORS.third, -LINE_PX, ldx);
    label(lx, CURSOR_Y, 'unrolled', 'right', COLORS.third, 0, ldx);
    label(lx, CURSOR_Y, drumText, 'right', COLORS.ink, LINE_PX, ldx);
    for (const s of SLIDERS) label(s.restX, BAND.y1, s.id, 'center', COLORS.third, LINE_PX * 0.75);
    label(INSET.right, INSET.rear.y + INSET.wheel.r, 'End view', 'right', COLORS.third, LINE_PX * 0.5 + 4);
    label(INSET.right, INSET.rear.y + INSET.wheel.r, 'not to scale', 'right', COLORS.third, LINE_PX * 1.5 + 4);
  }

  function drawHighlight(): void {
    if (highlight === null) return;
    ctx!.strokeStyle = COLORS.ink; ctx!.lineWidth = 2;
    for (const s of shapes) {
      if (s.id !== highlight) continue;
      const a = snap(X(s.x)), b = snap(Y(s.y)), c = snap(X(s.x + s.w)), d = snap(Y(s.y + s.h));
      ctx!.strokeRect(a - 1, b - 1, Math.max(1, c - a) + 2, Math.max(1, d - b) + 2);
    }
  }

  return {
    render(state, path) {
      layout(state, shapes);
      laidOut = true;
      if (scale <= 0) return;
      hot.clear();
      for (const id of path.parts) hot.add(id);
      hotAlpha = 0.35 + 0.65 * Math.min(1, Math.abs(path.torque) / TORQUE_FULL);
      const ang = drawnAngles(state);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = COLORS.ground;
      ctx.fillRect(0, 0, cssW, cssH);
      ctx.font = font; ctx.textBaseline = 'middle';

      drawDrum(state);
      const c = SLIDER_OF.C, cBody = c.restX + sliderShift(state, 'C');
      drawForkRod('forkC', pinX(state, c), cBody, IN_Y + C_HUB_R);
      drawCase();
      part('outputShaft', OUT_SHAFT_X[0], OUT_Y - SHAFT_R.output, OUT_SHAFT_X[1], OUT_Y + SHAFT_R.output, COLORS.steel3);
      part('inputShaft', IN_SHAFT_X[0], IN_Y - SHAFT_R.input, IN_SHAFT_X[1], IN_Y + SHAFT_R.input, COLORS.steel3);
      drawCrank(ang.crank);
      drawClutch(ang.basket, ang.input, path.slipping);
      for (const g of GEAR_ORDER) { drawGear(state, 'input', g); drawGear(state, 'output', g); }
      // the web that makes third and fourth one sliding piece
      const g3 = shapes[gearIndex('input', 3)], g4 = shapes[gearIndex('input', 4)];
      box(g3.x + g3.w, -C_HUB_R, g4.x, C_HUB_R, COLORS.steel2, COLORS.third);
      for (const s of SLIDERS) drawDogs(state, s);
      // forks for the output-shaft sliders, and fork C's yoke, in front of the gears
      for (const s of SLIDERS) {
        const body = s.restX + sliderShift(state, s.id);
        if (s.shaft === 'output') {
          drawForkRod(`fork${s.id}`, pinX(state, s), body, OUT_Y + pitchRadius('output', s.gears[0]));
          part(`fork${s.id}`, body - FORK_W / 2, OUT_Y + SHAFT_R.output + 1.5 * MM, body + FORK_W / 2, OUT_Y + pitchRadius('output', s.gears[0]), COLORS.steel3);
        } else {
          part('forkC', body - FORK_W / 2, IN_Y + SHAFT_R.input + 1 * MM, body + FORK_W / 2, IN_Y + C_HUB_R, COLORS.steel3);
        }
        fillCircle(null, pinX(state, s), CURSOR_Y, PIN_R, COLORS.steel3, COLORS.ink);
      }
      drawFinalDrive(ang.output, ang.wheel);
      drawStar(state);
      buildFlow(state, path);
      drawFlow(path);
      drawLabels(state);
      drawHighlight();
    },
    resize(width, height, ratio) {
      cssW = Math.max(0, width); cssH = Math.max(0, height); dpr = ratio > 0 ? ratio : 1;
      canvas.width = Math.max(1, Math.round(cssW * dpr));
      canvas.height = Math.max(1, Math.round(cssH * dpr));
      const pad = 8;
      const ew = EXTENT.x1 - EXTENT.x0, eh = EXTENT.y1 - EXTENT.y0;
      scale = Math.max(0, Math.min((cssW - 2 * pad) / ew, (cssH - 2 * pad) / eh));
      ox = (cssW - ew * scale) / 2 - EXTENT.x0 * scale;
      oy = (cssH - eh * scale) / 2 - EXTENT.y0 * scale;
      makeHatch();
    },
    pick(x, y) {
      if (!laidOut || scale <= 0) return null;
      const mx = (x - ox) / scale, my = (y - oy) / scale;
      for (const tol of [0, 4 / scale]) {
        for (let i = shapes.length - 1; i >= 0; i--) {
          const s = shapes[i];
          if (mx >= s.x - tol && mx <= s.x + s.w + tol && my >= s.y - tol && my <= s.y + s.h + tol) return s.id;
        }
      }
      return null;
    },
    setHighlight(id) { highlight = id; },
    dispose() {
      hatch = null;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    },
  };
}

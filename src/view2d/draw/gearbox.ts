import { gearAngle, gearKind, pitchRadius } from '../../model/geometry';
import type { GearNo, PartId } from '../../model/parts';
import { PARAMS } from '../../sim/params';
import type { SimState } from '../../sim/types';
import { COLORS } from '../../tokens';
import {
  AXIS_Y, BEARING, C_HUB_R, CURSOR_Y, DOG_GEAR_W, DOG_PITCH, DOG_SLIDER_W, DOGS, FORK_W, IN_SHAFT_X, IN_Y, LUG_LEN, MM,
  OUT_SHAFT_X, OUT_Y, PIN_R, SHAFT_R, SLIDER_OF, SLIDERS, WALL_PIECES, WALLS, I_WEB, dogLugAngles, gearIndex, norm,
  sliderShift, type PartShape, type Shaft, type SliderDraw,
} from '../layout';
import type { Painter } from '../paint';

/** The gearbox case walls with a bearing at each shaft. */
export function drawCase(p: Painter): void {
  p.fade('inputShaft');
  for (const [x0, x1] of WALLS) {
    for (const [ya, yb] of WALL_PIECES) p.box(x0, ya, x1, yb, COLORS.steel1, null);
    for (const shaft of ['input', 'output'] as const) {
      const y = AXIS_Y[shaft], r = SHAFT_R[shaft];
      p.box(x0, y - r - BEARING, x1, y - r, COLORS.steel2, null);
      p.box(x0, y + r, x1, y + r + BEARING, COLORS.steel2, null);
    }
  }
}

export function drawShafts(p: Painter): void {
  p.part('outputShaft', OUT_SHAFT_X[0], OUT_Y - SHAFT_R.output, OUT_SHAFT_X[1], OUT_Y + SHAFT_R.output, COLORS.steel3);
  p.part('inputShaft', IN_SHAFT_X[0], IN_Y - SHAFT_R.input, IN_SHAFT_X[1], IN_Y + SHAFT_R.input, COLORS.steel3);
}

export function drawGear(p: Painter, shapes: readonly PartShape[], state: SimState, shaft: Shaft, g: GearNo): void {
  const s = shapes[gearIndex(shaft, g)];
  const kind = gearKind(shaft, g);
  p.part(s.id, s.x, s.y, s.x + s.w, s.y + s.h, kind === 'free' ? COLORS.steel1 : COLORS.steel2);
  const teeth = PARAMS.gears[g][shaft === 'input' ? 0 : 1];
  p.ticks(s.x, s.x + s.w, AXIS_Y[shaft], s.h / 2, gearAngle(shaft, g, state.angles), teeth, p.tickColour(s.id), 0.55);
}

/** The web that makes third and fourth one sliding piece: orange only when the whole piece drives. */
export function drawSliderWeb(p: Painter, shapes: readonly PartShape[]): void {
  const w = shapes[I_WEB];
  p.fade('gear3in');
  p.box(w.x, w.y, w.x + w.w, w.y + w.h, COLORS.steel2, null);
  if (p.hot.has('gear3in') && p.hot.has('gear4in')) p.hotBox(w.x, w.y, w.x + w.w, w.y + w.h);
  p.box(w.x, w.y, w.x + w.w, w.y + w.h, null, COLORS.third);
}

/**
 * Five lugs on one face, seen side-on: a lug whose centre is at θ shows between the heights of
 * its two edges and only on the near half (cos θ > 0).
 */
function lugs(p: Painter, id: PartId, axisY: number, r: number, x0: number, x1: number, first: number, width: number, fill: string): void {
  for (let k = 0; k < DOGS; k++) {
    const th = norm(first + k * DOG_PITCH);
    if (Math.cos(th) <= 0) continue;
    const hi = th + width / 2 > Math.PI / 2 ? 1 : Math.sin(th + width / 2);
    const lo = th - width / 2 < -Math.PI / 2 ? -1 : Math.sin(th - width / 2);
    p.part(id, x0, axisY - r * hi, x1, axisY - r * lo, fill);
  }
}

/**
 * The dogs on both faces of a slider and the lugs on the free gears facing them, placed by
 * dogLugAngles; when the slider is blocked at the contact point the lugs face each other tip to tip.
 */
export function drawDogs(p: Painter, shapes: readonly PartShape[], state: SimState, s: SliderDraw): void {
  for (const sideName of ['neg', 'pos'] as const) {
    const side = s[sideName];
    const face = shapes[gearIndex(s.shaft, side.face)];
    const gear = shapes[gearIndex(s.shaft, side.free)];
    const axisY = AXIS_Y[s.shaft];
    const sliderFace = side.dir < 0 ? face.x : face.x + face.w;
    const gearFace = side.dir < 0 ? gear.x + gear.w : gear.x;
    const a = dogLugAngles(state, s.id, sideName);
    lugs(p, gear.id, axisY, side.r, gearFace, gearFace - side.dir * LUG_LEN, a.gear, DOG_GEAR_W, COLORS.steel1);
    lugs(p, face.id, axisY, side.r, sliderFace, sliderFace + side.dir * LUG_LEN, a.slider, DOG_SLIDER_W, COLORS.steel2);
  }
}

/** A fork's rod, straight up its rail from the pin to the slider: a fork is rigid. */
function drawForkRod(p: Painter, id: PartId, body: number, topY: number): void {
  const ctx = p.ctx;
  p.fade(id);
  p.quad(body, CURSOR_Y, body, topY, FORK_W / 2);
  ctx.fillStyle = COLORS.steel3; ctx.fill();
  ctx.strokeStyle = COLORS.third; ctx.lineWidth = 1; ctx.stroke();
}

/** Fork C's rod, which passes behind the output shaft and its gears. */
export function drawForkBehind(p: Painter, state: SimState): void {
  const c = SLIDER_OF.C;
  drawForkRod(p, 'forkC', c.restX + sliderShift(state, 'C'), IN_Y + C_HUB_R);
}

/**
 * The forks for the output-shaft sliders, fork C's yoke and every fork's pin, in front of the gears.
 * The pin is on the fork, so when a slider lags its groove (a blocked dog) the pin shows off-centre
 * in the groove track below.
 */
export function drawForksFront(p: Painter, state: SimState): void {
  for (const s of SLIDERS) {
    const body = s.restX + sliderShift(state, s.id);
    if (s.shaft === 'output') {
      const id: PartId = `fork${s.id}`;
      drawForkRod(p, id, body, OUT_Y + pitchRadius('output', s.gears[0]));
      p.part(id, body - FORK_W / 2, OUT_Y + SHAFT_R.output + 1.5 * MM, body + FORK_W / 2, OUT_Y + pitchRadius('output', s.gears[0]), COLORS.steel3);
    } else {
      p.part('forkC', body - FORK_W / 2, IN_Y + SHAFT_R.input + 1 * MM, body + FORK_W / 2, IN_Y + C_HUB_R, COLORS.steel3);
    }
    p.fillCircle(`fork${s.id}`, body, CURSOR_Y, PIN_R, COLORS.steel3, COLORS.ink);
  }
}

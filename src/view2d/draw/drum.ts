import { SLIDER_TRAVEL } from '../../model/geometry';
import { grooveCommand } from '../../sim/shiftDrum';
import type { SimState } from '../../sim/types';
import { deg } from '../../sim/units';
import { COLORS } from '../../tokens';
import {
  ARM_PIVOT, BAND, CURSOR_Y, DETENT_ANGLES, DETENT_LABELS, DETENT_NAMES, DRUM_R, GROOVE_W, MM, PAWL, PEDAL, ROLLER_R,
  SHIFT_SHAFT, SLIDERS, STAR, TRACK_RANGE, TWO_PI, pawlAngle, pedalTip, starRadius,
} from '../layout';
import type { Painter } from '../paint';

/** Height on the band of drum angle a when the drum is at `current`. */
export const rowY = (a: number, current: number): number => CURSOR_Y + (a - current) * DRUM_R;

/** The unrolled drum: detent rows, the three grooves, the cursor and the detent labels. */
export function drawDrum(p: Painter, state: SimState): void {
  const ctx = p.ctx;
  const cur = state.drum.angle;
  p.part('shiftDrum', BAND.x0, BAND.y0, BAND.x1, BAND.y1, COLORS.steel1);
  const bx0 = p.snap(p.X(BAND.x0)), bx1 = p.snap(p.X(BAND.x1)), by0 = p.snap(p.Y(BAND.y0)), by1 = p.snap(p.Y(BAND.y1));
  ctx.save();
  ctx.beginPath(); ctx.rect(bx0 + 1, by0 + 1, bx1 - bx0 - 2, by1 - by0 - 2); ctx.clip();
  // detent rows
  ctx.strokeStyle = COLORS.steel2; ctx.lineWidth = p.hair;
  ctx.beginPath();
  for (const a of DETENT_ANGLES) {
    const y = p.line1(p.Y(rowY(a, cur)));
    ctx.moveTo(bx0, y); ctx.lineTo(bx1, y);
  }
  ctx.stroke();
  // grooves: each the profile of grooveCommand against drum angle, under its slider
  const half = (BAND.y1 - BAND.y0) / 2 / DRUM_R + deg(4);
  const a0 = Math.max(TRACK_RANGE[0], cur - half), a1 = Math.min(TRACK_RANGE[1], cur + half);
  ctx.strokeStyle = COLORS.ground; ctx.lineWidth = p.L(GROOVE_W); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const s of SLIDERS) {
    ctx.beginPath();
    const step = deg(0.75);
    for (let a = a0; a <= a1 + step / 2; a += step) {
      const aa = Math.min(a, a1);
      const px = p.X(s.restX + grooveCommand(s.id, aa) * SLIDER_TRAVEL), py = p.Y(rowY(aa, cur));
      if (a === a0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
  ctx.restore();
  // cursor at the current angle, with end marks outside the band
  const cy = p.line1(p.Y(CURSOR_Y));
  ctx.strokeStyle = COLORS.ink; ctx.lineWidth = p.hair;
  ctx.beginPath(); ctx.moveTo(bx0 - 4, cy); ctx.lineTo(bx1 + 4, cy); ctx.stroke();
  ctx.fillStyle = COLORS.ink;
  ctx.beginPath(); ctx.moveTo(bx0 - 4, cy - 4); ctx.lineTo(bx0, cy); ctx.lineTo(bx0 - 4, cy + 4); ctx.fill();
  ctx.beginPath(); ctx.moveTo(bx1 + 4, cy - 4); ctx.lineTo(bx1, cy); ctx.lineTo(bx1 + 4, cy + 4); ctx.fill();
  // detent labels on the left edge, at their angles, while they are on the band
  for (let i = 0; i < DETENT_ANGLES.length; i++) {
    const y = rowY(DETENT_ANGLES[i], cur);
    if (y < BAND.y0 + 1 * MM || y > BAND.y1 - 1 * MM) continue;
    const seated = state.drum.detent === DETENT_NAMES[i];
    ctx.fillStyle = seated ? COLORS.ink : COLORS.ink3; ctx.textAlign = 'right';
    ctx.fillText(DETENT_LABELS[i], Math.round(bx0 - 8), Math.round(p.Y(y)));
  }
}

/** The star wheel on the drum end, turning with the drum, and the detent arm's roller riding it. */
export function drawStar(p: Painter, state: SimState): void {
  const ctx = p.ctx;
  const cur = state.drum.angle;
  p.fade('starWheel');
  ctx.beginPath();
  const n = 120;
  for (let i = 0; i <= n; i++) {
    const psi = (i / n) * TWO_PI; // screen angle; psi = 0 faces the roller, a later detent lies below
    const r = starRadius(cur + psi);
    const px = p.X(STAR.x + r * Math.cos(psi)), py = p.Y(STAR.y + r * Math.sin(psi));
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = COLORS.steel2; ctx.fill();
  ctx.strokeStyle = COLORS.ink3; ctx.lineWidth = 1; ctx.stroke();
  p.fillCircle(null, STAR.x, STAR.y, 3 * MM, COLORS.steel3);
  // the detent arm's roller rides the profile where it faces the cursor
  const rx = STAR.x + starRadius(cur) + ROLLER_R;
  p.fade('detentArm');
  ctx.strokeStyle = COLORS.steel3; ctx.lineWidth = Math.max(2, p.L(2.4 * MM));
  ctx.beginPath(); ctx.moveTo(p.X(ARM_PIVOT.x), p.Y(ARM_PIVOT.y)); ctx.lineTo(p.X(rx), p.Y(STAR.y)); ctx.stroke();
  p.fillCircle('detentArm', ARM_PIVOT.x, ARM_PIVOT.y, 1.8 * MM, COLORS.steel2);
  p.fillCircle('detentArm', rx, STAR.y, ROLLER_R, COLORS.steel3);
}

/** The shift shaft end on, its pawl arm reaching the drum end's pins, and the pedal rocking on it. */
export function drawShiftMechanism(p: Painter, state: SimState): void {
  const ctx = p.ctx, ss = SHIFT_SHAFT;
  const tip = pedalTip(state);
  p.fade('pedal');
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(p.X(ss.x), p.Y(ss.y)); ctx.lineTo(p.X(tip.x), p.Y(tip.y));
  ctx.strokeStyle = COLORS.steel3; ctx.lineWidth = Math.max(3, p.L(PEDAL.w)); ctx.stroke();
  p.fillCircle('pedal', tip.x, tip.y, PEDAL.w * 0.8, COLORS.steel2); // the toe peg
  const pa = pawlAngle(state);
  const px = ss.x + PAWL.len * Math.cos(pa), py = ss.y + PAWL.len * Math.sin(pa);
  p.fade('shiftShaft');
  ctx.beginPath(); ctx.moveTo(p.X(ss.x), p.Y(ss.y)); ctx.lineTo(p.X(px), p.Y(py));
  ctx.strokeStyle = COLORS.steel2; ctx.lineWidth = Math.max(2, p.L(PAWL.w)); ctx.stroke();
  ctx.lineCap = 'butt';
  p.fillCircle('shiftShaft', px, py, PAWL.w * 0.6, COLORS.steel3); // pawl tip on a drum pin
  p.fillCircle('shiftShaft', ss.x, ss.y, ss.r, COLORS.steel3);
}

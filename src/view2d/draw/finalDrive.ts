import { PARAMS } from '../../sim/params';
import { COLORS } from '../../ui/tokens';
import {
  CHAIN_COS, CHAIN_PITCH, CHAIN_PTS, CHAIN_SIN, CHAIN_WRAP, I_CHAIN_WRAP, I_NUT, INSET, MM, OUT_Y, SPROCKET_R, SPROCKET_X,
  TWO_PI, type PartShape,
} from '../layout';
import { DASH, NO_DASH, type Painter } from '../paint';

const LINKS: number[] = [1, 2];

/** The front sprocket edge-on with the chain wrapped on it, and the end-view inset (not to scale). */
export function drawFinalDrive(p: Painter, shapes: readonly PartShape[], outAngle: number, wheelAngle: number): void {
  const ctx = p.ctx;
  const chainFill = COLORS.steel3;
  p.part('sprocket', SPROCKET_X[0], OUT_Y - SPROCKET_R, SPROCKET_X[1], OUT_Y + SPROCKET_R, COLORS.steel2);
  p.ticks(SPROCKET_X[0], SPROCKET_X[1], OUT_Y, SPROCKET_R, outAngle, PARAMS.final.front, p.tickColour('sprocket'), 0.55);
  for (const i of I_CHAIN_WRAP) { const s = shapes[i]; p.part(s.id, s.x, s.y, s.x + s.w, s.y + s.h, chainFill); }
  const nut = shapes[I_NUT];
  p.part(nut.id, nut.x, nut.y, nut.x + nut.w, nut.y + nut.h, COLORS.steel2);
  // leader from the edge-on sprocket to the end view
  const cx = (SPROCKET_X[0] + SPROCKET_X[1]) / 2, w = CHAIN_WRAP;
  p.fade('sprocket');
  ctx.strokeStyle = COLORS.third; ctx.lineWidth = 1; ctx.setLineDash(DASH);
  ctx.beginPath();
  ctx.moveTo(p.X(cx + w.half + 1 * MM), p.Y(OUT_Y + SPROCKET_R));
  ctx.lineTo(p.X(INSET.front.x - INSET.front.r - 3 * MM), p.Y(INSET.front.y));
  ctx.stroke(); ctx.setLineDash(NO_DASH);

  const { front, rear, wheel } = INSET;
  // ground under the wheel
  p.fade('rearWheel');
  const gy = p.line1(p.Y(rear.y + wheel.r));
  ctx.strokeStyle = COLORS.third; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(p.X(rear.x - wheel.r - 6 * MM), gy); ctx.lineTo(p.X(rear.x + wheel.r + 4 * MM), gy); ctx.stroke();
  // wheel: tyre, rim and five spokes
  p.fillCircle('rearWheel', rear.x, rear.y, wheel.r, COLORS.steel2);
  p.fillCircle(null, rear.x, rear.y, wheel.rim, COLORS.ground, COLORS.third);
  p.radialTicks(rear.x, rear.y, 3 * MM, wheel.rim, wheelAngle, 5, p.hot.has('rearWheel') ? COLORS.signal : COLORS.steel3, Math.max(1.5, p.L(2 * MM)));
  // rear sprocket
  p.fillCircle('rearSprocket', rear.x, rear.y, rear.r, COLORS.steel2);
  p.radialTicks(rear.x, rear.y, rear.r - 1.6 * MM, rear.r, wheelAngle, PARAMS.final.rear, p.tickColour('rearSprocket'), 1);
  p.fillCircle(null, rear.x, rear.y, 4 * MM, COLORS.steel3);
  // front sprocket
  p.fillCircle('sprocket', front.x, front.y, front.r, COLORS.steel2);
  p.radialTicks(front.x, front.y, front.r - 1.4 * MM, front.r, outAngle, PARAMS.final.front, p.tickColour('sprocket'), 1);
  p.fillCircle(null, front.x, front.y, 2 * MM, COLORS.steel3);
  // chain loop: top strand, round the rear sprocket, bottom strand, round the front
  const c = CHAIN_PTS;
  const topAngle = Math.atan2(-CHAIN_COS, -CHAIN_SIN), bottomAngle = Math.atan2(CHAIN_COS, -CHAIN_SIN);
  p.fade('chain');
  ctx.beginPath();
  ctx.moveTo(p.X(c.frontTop.x), p.Y(c.frontTop.y));
  ctx.lineTo(p.X(c.rearTop.x), p.Y(c.rearTop.y));
  ctx.arc(p.X(rear.x), p.Y(rear.y), p.L(rear.r), topAngle, bottomAngle, false);
  ctx.lineTo(p.X(c.frontBottom.x), p.Y(c.frontBottom.y));
  ctx.arc(p.X(front.x), p.Y(front.y), p.L(front.r), bottomAngle, topAngle + TWO_PI, false);
  const chainW = Math.max(2, p.L(2.4 * MM));
  ctx.strokeStyle = chainFill; ctx.lineWidth = chainW; ctx.stroke();
  p.hotPath('chain', true);
  // links travel with the sprocket's rim: offset grows as the drawn angle falls (forward drive)
  const linkPx = Math.max(3, p.L(CHAIN_PITCH * (front.r / SPROCKET_R)));
  LINKS[0] = linkPx * 0.35; LINKS[1] = linkPx * 0.65;
  ctx.setLineDash(LINKS);
  const travel = -outAngle * p.L(front.r);
  ctx.lineDashOffset = ((travel % linkPx) + linkPx) % linkPx;
  ctx.strokeStyle = COLORS.ground; ctx.lineWidth = chainW * 0.45; ctx.stroke();
  ctx.setLineDash(NO_DASH); ctx.lineDashOffset = 0;
}

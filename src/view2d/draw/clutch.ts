import { PARAMS } from '../../sim/params';
import { COLORS } from '../../tokens';
import {
  BASKET_BACK_X, BASKET_BORE, BEARING_GAP, CRANK, I_BASKET_BACK, I_BASKET_RIM, I_DRIVEN, SHAFT_R, CRANK_Y, DRIVE_R, DRIVEN_R, HUB_R, HUB_X,
  I_HUB_DRUM, I_PLATE0, I_PRESSURE, I_ROD, IN_Y, PLATE_COUNT, PRIMARY_X, SIGNS, SPRING, type PartShape,
} from '../layout';
import type { Painter } from '../paint';

/** The crank stub with its crankpin rising and falling with the crank angle, and the primary drive gear. */
export function drawCrank(p: Painter, crankAngle: number): void {
  const c = CRANK, ctx = p.ctx;
  p.part('crank', c.journal.x[0], CRANK_Y - c.journal.r, c.journal.x[1], CRANK_Y + c.journal.r, COLORS.steel3);
  p.part('crank', c.stub.x[0], CRANK_Y - c.stub.r, c.stub.x[1], CRANK_Y + c.stub.r, COLORS.steel3);
  const pinY = CRANK_Y - c.pin.throw * Math.sin(crankAngle);
  p.part('crank', c.pin.x[0], pinY - c.pin.r, c.pin.x[1], pinY + c.pin.r, COLORS.steel3);
  p.part('crank', c.web1.x[0], CRANK_Y - c.web1.r, c.web1.x[1], CRANK_Y + c.web1.r, COLORS.steel2);
  p.part('crank', c.web2.x[0], CRANK_Y - c.web2.r, c.web2.x[1], CRANK_Y + c.web2.r, COLORS.steel2);
  // break line where the crank continues
  const bx = p.X(c.stub.x[1]);
  ctx.strokeStyle = COLORS.third; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(bx, p.Y(CRANK_Y - c.stub.r)); ctx.lineTo(bx + 3, p.Y(CRANK_Y - c.stub.r / 3));
  ctx.lineTo(bx - 3, p.Y(CRANK_Y + c.stub.r / 3)); ctx.lineTo(bx, p.Y(CRANK_Y + c.stub.r));
  ctx.stroke();
  p.part('primaryDrive', PRIMARY_X[0], CRANK_Y - DRIVE_R, PRIMARY_X[1], CRANK_Y + DRIVE_R, COLORS.steel2);
  p.ticks(PRIMARY_X[0], PRIMARY_X[1], CRANK_Y, DRIVE_R, crankAngle, PARAMS.primary.drive, p.tickColour('primaryDrive'), 0.5);
}

/** Basket in section with its driven gear, hub, plate stack, pressure plate, springs and release rod. */
export function drawClutch(p: Painter, shapes: readonly PartShape[], basketAngle: number, inputAngle: number, slipping: boolean): void {
  // basket: rim in section, back wall, and the primary driven gear riveted to it, all running free
  // on the input shaft on a needle bearing in their bore
  for (const set of [I_BASKET_RIM, I_BASKET_BACK, I_DRIVEN]) {
    for (const i of set) { const s = shapes[i]; p.part(s.id, s.x, s.y, s.x + s.w, s.y + s.h, COLORS.steel2); }
  }
  p.ticks(PRIMARY_X[0], PRIMARY_X[1], IN_Y, DRIVEN_R, basketAngle, PARAMS.primary.driven, p.tickColour('clutchBasket'), 0.45);
  for (const sign of SIGNS) {
    const r0 = SHAFT_R.input + BEARING_GAP;
    p.box(BASKET_BACK_X[0], sign * r0, PRIMARY_X[1], sign * BASKET_BORE, COLORS.steel1, COLORS.third);
  }
  p.part('clutchHub', HUB_X[0], -HUB_R, HUB_X[1], HUB_R, COLORS.steel2);
  // the hub's drum carrying the steel plates, seen between the plates when they part
  const drum = shapes[I_HUB_DRUM];
  p.part('clutchHub', drum.x, drum.y, drum.x + drum.w, drum.y + drum.h, COLORS.steel2, null);
  // the release rod runs in the hollow input shaft; only its lifter shows, outboard of the plate
  const rod = shapes[I_ROD];
  p.part('pressurePlate', rod.x, rod.y, rod.x + rod.w, rod.y + rod.h, COLORS.steel2);
  for (let i = 0; i < PLATE_COUNT; i++) {
    const s = shapes[I_PLATE0 + i];
    const friction = i % 2 === 0;
    p.fade(s.id);
    p.box(s.x, s.y, s.x + s.w, s.y + s.h, friction ? COLORS.steel1 : COLORS.steel3, null);
    if (p.hot.has(s.id)) p.hotBox(s.x, s.y, s.x + s.w, s.y + s.h, slipping);
    if (p.L(s.w) >= 5) p.box(s.x, s.y, s.x + s.w, s.y + s.h, null, COLORS.third);
    p.ticks(s.x, s.x + s.w, IN_Y, s.h / 2, friction ? basketAngle : inputAngle, friction ? 8 : 10,
      p.hot.has(s.id) && !slipping ? COLORS.ground : COLORS.third, 0.6);
  }
  const pp = shapes[I_PRESSURE];
  const drumEnd = drum.x;
  for (const sign of SIGNS) { // spring posts, fixed to the hub, behind the plate
    const y = sign * SPRING.r;
    p.part('pressurePlate', SPRING.boltX, y - SPRING.post, drumEnd, y + SPRING.post, COLORS.steel3, null);
  }
  p.part('pressurePlate', pp.x, pp.y, pp.x + pp.w, pp.y + pp.h, COLORS.steel2);
  for (const sign of SIGNS) {
    const y = sign * SPRING.r;
    p.part('pressurePlate', SPRING.boltX, y - SPRING.h / 2, pp.x, y + SPRING.h / 2, COLORS.steel3); // spring
    p.part('pressurePlate', SPRING.boltX - SPRING.head, y - SPRING.h * 0.8, SPRING.boltX, y + SPRING.h * 0.8, COLORS.steel2); // bolt head
  }
}

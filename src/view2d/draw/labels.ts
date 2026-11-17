import { GEAR_ORDER, gearAxialPosition } from '../../model/geometry';
import type { SimState } from '../../sim/types';
import { toDeg } from '../../sim/units';
import { COLORS } from '../../tokens';
import {
  BAND, BASKET_BACK_X, BASKET_MOUTH_X, BASKET_R, CRANK, CRANK_Y, CURSOR_Y, GEAR_LABEL_Y, IN_SHAFT_X, IN_Y, INSET, MM,
  OUT_SHAFT_X, OUT_Y, SLIDERS,
} from '../layout';
import { LINE_PX, type Painter } from '../paint';

/** The part names on the drawing; the drum angle's text is rebuilt only when its degree changes. */
export function createLabels(): (p: Painter, state: SimState) => void {
  let drumText = '';
  let drumTextDeg = NaN;
  return (p, state) => {
    p.label(CRANK.stub.x[1] + 4 * MM, CRANK_Y, 'Crank', 'left');
    p.label((BASKET_MOUTH_X + BASKET_BACK_X[0]) / 2, -BASKET_R - 6 * MM, 'Clutch', 'center');
    for (const g of GEAR_ORDER) {
      p.label(gearAxialPosition(g), GEAR_LABEL_Y, String(g), 'center', state.lockedGear === g ? COLORS.ink : COLORS.ink3);
    }
    // what the row of numbers names; to the right of it, where the drawing leaves room at every size
    const last = GEAR_ORDER[GEAR_ORDER.length - 1];
    p.label(gearAxialPosition(last), GEAR_LABEL_Y, 'Gear pair', 'left', COLORS.ink3, 0, 14);
    p.label(IN_SHAFT_X[1] + 4 * MM, IN_Y, 'Input shaft', 'left');
    p.label(OUT_SHAFT_X[1] + 4 * MM, OUT_Y, 'Output shaft', 'left');
    const lx = BAND.x0, ldx = -26; // clear of the detent labels on the band's edge
    const d = Math.round(toDeg(state.drum.angle));
    if (d !== drumTextDeg) { drumTextDeg = d; drumText = `${d}°`; }
    p.label(lx, CURSOR_Y, 'Shift drum', 'right', COLORS.ink3, -LINE_PX, ldx);
    p.label(lx, CURSOR_Y, 'unrolled', 'right', COLORS.ink3, 0, ldx);
    p.label(lx, CURSOR_Y, drumText, 'right', COLORS.ink, LINE_PX, ldx);
    for (const s of SLIDERS) p.label(s.restX, BAND.y1, s.id, 'center', COLORS.ink3, LINE_PX * 0.75);
    p.label(INSET.right, INSET.rear.y + INSET.wheel.r, 'End view', 'right', COLORS.ink3, LINE_PX * 0.5 + 4);
    p.label(INSET.right, INSET.rear.y + INSET.wheel.r, 'not to scale', 'right', COLORS.ink3, LINE_PX * 1.5 + 4);
  };
}

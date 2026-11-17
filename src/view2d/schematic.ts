import type { View } from '../app/view';
import { GEAR_ORDER, drawnAngles } from '../model/geometry';
import { PARTS, type PartId } from '../model/parts';
import { COLORS } from '../ui/tokens';
import { drawClutch, drawCrank } from './draw/clutch';
import { drawDrum, drawShiftMechanism, drawStar } from './draw/drum';
import { drawFinalDrive } from './draw/finalDrive';
import { drawCase, drawDogs, drawForkBehind, drawForksFront, drawGear, drawShafts, drawSliderWeb } from './draw/gearbox';
import { createLabels } from './draw/labels';
import { createFlow, torqueCarriers } from './flow';
import { EXTENT, SLIDERS, layout, newShapes, pickShape } from './layout';
import { LABEL_PX, Painter } from './paint';

const TORQUE_FULL = 150; // N·m at which a part carrying torque is filled at full opacity

// Arrival: parts appear in torque-path order, crank to rear wheel, with the shift mechanism last.
const SHIFT_PARTS = new Set<PartId>(['forkA', 'forkB', 'forkC', 'shiftDrum', 'starWheel', 'detentArm', 'shiftShaft', 'pedal']);
const ALL_PARTS = Object.keys(PARTS) as PartId[];
const REVEAL_ORDER: readonly PartId[] = [
  ...ALL_PARTS.filter((id) => !SHIFT_PARTS.has(id)), ...ALL_PARTS.filter((id) => SHIFT_PARTS.has(id)),
];
/** Share of the arrival over which each part fades in. */
const REVEAL_FADE = 0.15;

export function createSchematic(canvas: HTMLCanvasElement): View {
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('2D canvas is not available');
  const mono = getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim()
    || 'ui-monospace, monospace';
  const font = `${LABEL_PX}px ${mono}`;

  const p = new Painter(ctx);
  const shapes = newShapes();
  const flow = createFlow();
  const drawLabels = createLabels();
  let laidOut = false;
  let cssW = 0, cssH = 0;
  let highlight: PartId | null = null;

  function drawHighlight(): void {
    if (highlight === null) return;
    ctx!.strokeStyle = COLORS.ink; ctx!.lineWidth = 2;
    for (const s of shapes) {
      if (s.id !== highlight) continue;
      const a = p.snap(p.X(s.x)), b = p.snap(p.Y(s.y)), c = p.snap(p.X(s.x + s.w)), d = p.snap(p.Y(s.y + s.h));
      ctx!.strokeRect(a - 1, b - 1, Math.max(1, c - a) + 2, Math.max(1, d - b) + 2);
    }
  }

  return {
    render(state, path) {
      layout(state, shapes);
      laidOut = true;
      if (p.scale <= 0) return;
      torqueCarriers(path, state, p.hot);
      p.hotAlpha = 0.35 + 0.65 * Math.min(1, Math.abs(path.torque) / TORQUE_FULL);
      const ang = drawnAngles(state);

      ctx.setTransform(p.dpr, 0, 0, p.dpr, 0, 0);
      ctx.fillStyle = COLORS.ground;
      ctx.fillRect(0, 0, cssW, cssH);
      ctx.font = font; ctx.textBaseline = 'middle';

      drawDrum(p, state);
      drawForkBehind(p, state);
      drawCase(p);
      drawShafts(p);
      drawCrank(p, ang.crank);
      drawClutch(p, shapes, ang.basket, ang.input, path.slipping);
      for (const g of GEAR_ORDER) { drawGear(p, shapes, state, 'input', g); drawGear(p, shapes, state, 'output', g); }
      drawSliderWeb(p, shapes);
      for (const s of SLIDERS) drawDogs(p, shapes, state, s);
      drawForksFront(p, state);
      drawFinalDrive(p, shapes, ang.output, ang.wheel);
      drawStar(p, state);
      drawShiftMechanism(p, state);
      flow.build(state, path, shapes);
      p.base = Math.min(1, p.reveal); ctx.globalAlpha = p.base;
      flow.draw(p, path);
      drawLabels(p, state);
      p.base = 1; ctx.globalAlpha = 1;
      drawHighlight();
    },
    resize(width, height, ratio) {
      cssW = Math.max(0, width); cssH = Math.max(0, height); p.dpr = ratio > 0 ? ratio : 1;
      canvas.width = Math.max(1, Math.round(cssW * p.dpr));
      canvas.height = Math.max(1, Math.round(cssH * p.dpr));
      const pad = 8;
      const ew = EXTENT.x1 - EXTENT.x0, eh = EXTENT.y1 - EXTENT.y0;
      p.scale = Math.max(0, Math.min((cssW - 2 * pad) / ew, (cssH - 2 * pad) / eh));
      p.ox = (cssW - ew * p.scale) / 2 - EXTENT.x0 * p.scale;
      p.oy = (cssH - eh * p.scale) / 2 - EXTENT.y0 * p.scale;
      p.makeHatch();
    },
    pick(x, y) {
      if (!laidOut || p.scale <= 0) return null;
      const mx = (x - p.ox) / p.scale, my = (y - p.oy) / p.scale;
      // exact first, then within 4 CSS px so thin parts can be hit
      return pickShape(shapes, mx, my) ?? pickShape(shapes, mx, my, 4 / p.scale);
    },
    setHighlight(id) { highlight = id; },
    setReveal(progress) {
      p.reveal = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 1;
      // part i starts at i/(n-1) of (1 - REVEAL_FADE): none starts before its i/n share of the
      // arrival is past, and the last is fully drawn at 1
      const n = REVEAL_ORDER.length;
      REVEAL_ORDER.forEach((id, i) => {
        const start = (i / (n - 1)) * (1 - REVEAL_FADE);
        p.revealAlpha.set(id, Math.min(1, Math.max(0, (p.reveal - start) / REVEAL_FADE)));
      });
    },
    dispose() {
      p.hatch = null;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    },
  };
}

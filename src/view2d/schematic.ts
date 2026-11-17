import type { View } from '../app/view';
import { GEAR_ORDER, drawnAngles } from '../model/geometry';
import type { PartId } from '../model/parts';
import type { TorquePath } from '../model/torquePath';
import type { SimState } from '../sim/types';
import { clamp } from '../sim/units';
import { COLORS } from '../tokens';
import { drawClutch, drawCrank } from './draw/clutch';
import { drawDrum, drawShiftMechanism, drawStar } from './draw/drum';
import { drawFinalDrive } from './draw/finalDrive';
import { drawCase, drawDogs, drawForkBehind, drawForksFront, drawGear, drawShafts, drawSliderWeb } from './draw/gearbox';
import { createLabels } from './draw/labels';
import { createFlow, hotAlpha, torqueCarriers } from './flow';
import { SLIDERS, fitTransform, layout, newShapes, pickShape, toModel } from './layout';
import { LABEL_PX, Painter } from './paint';
import { REVEAL_ORDER, revealAlpha } from './reveal';

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
  let last: { state: SimState; path: TorquePath } | null = null;

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
    redrawsOnResize: true,
    render(state, path) {
      last = { state, path };
      layout(state, shapes);
      laidOut = true;
      if (p.scale <= 0) return;
      torqueCarriers(path, state, p.hot);
      p.hotAlpha = hotAlpha(path.torque);
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
      Object.assign(p, fitTransform(cssW, cssH));
      p.makeHatch();
      // setting the canvas size cleared it: draw the last frame again before the browser paints
      if (last) this.render(last.state, last.path);
    },
    pick(x, y) {
      const m = laidOut ? toModel(p, x, y) : null;
      if (m === null) return null;
      // exact first, then within 4 CSS px so thin parts can be hit
      return pickShape(shapes, m.x, m.y) ?? pickShape(shapes, m.x, m.y, 4 / p.scale);
    },
    setHighlight(id) { highlight = id; },
    setReveal(progress) {
      p.reveal = Number.isFinite(progress) ? clamp(progress, 0, 1) : 1;
      REVEAL_ORDER.forEach((id, i) => p.revealAlpha.set(id, revealAlpha(i, p.reveal)));
    },
    dispose() {
      p.hatch = null;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    },
  };
}

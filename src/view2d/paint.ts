import type { PartId } from '../model/parts';
import { COLORS } from '../tokens';
import { TWO_PI } from './layout';

export const LABEL_PX = 11;
export const LINE_PX = 14;
export const DASH: number[] = [7, 5];
export const NO_DASH: number[] = [];

/**
 * Holds the canvas context and the model-to-CSS-pixel transform, and paints boxes, ticks, circles
 * and labels in model metres. It also carries the frame's torque set and the arrival opacities,
 * so every part painted through `part` and `fillCircle` gets its torque overlay and its fade.
 */
export class Painter {
  dpr = 1;
  scale = 0;
  ox = 0;
  oy = 0;
  /** Parts carrying torque this frame, and the opacity of their overlay. */
  readonly hot = new Set<PartId>();
  hotAlpha = 1;
  /** Opacity of the part being painted: below 1 only during the arrival. */
  base = 1;
  reveal = 1;
  readonly revealAlpha = new Map<PartId, number>();
  hatch: CanvasPattern | null = null;

  constructor(readonly ctx: CanvasRenderingContext2D) {}

  X(x: number): number { return this.ox + x * this.scale; }
  Y(y: number): number { return this.oy + y * this.scale; }
  L(d: number): number { return d * this.scale; }
  snap(v: number): number { return Math.round(v * this.dpr) / this.dpr; }
  /** Device pixels in a hairline: the whole number nearest one CSS px, at least one. */
  private get hairDevice(): number { return Math.max(1, Math.round(this.dpr)); }
  /** Width of a hairline in CSS px; a line this wide, centred by line1, covers whole device pixels. */
  get hair(): number { return this.hairDevice / this.dpr; }
  /** Centre of a hairline near v, placed so the line covers whole device pixel rows. */
  line1(v: number): number {
    const o = (this.hairDevice % 2) / 2;
    return (Math.round(v * this.dpr - o) + o) / this.dpr;
  }

  /** Sets the opacity for what follows to that of part `id` in the arrival. */
  fade(id: PartId): void {
    this.base = this.reveal >= 1 ? 1 : this.revealAlpha.get(id) ?? 1;
    this.ctx.globalAlpha = this.base;
  }

  makeHatch(): void {
    const dpr = this.dpr;
    const size = Math.max(1, Math.round(6 * dpr));
    const tile = document.createElement('canvas');
    tile.width = size; tile.height = size;
    const t = tile.getContext('2d');
    if (!t) { this.hatch = null; return; }
    t.strokeStyle = COLORS.signal;
    t.lineWidth = Math.max(1, dpr * 1.25);
    t.beginPath();
    t.moveTo(-1, size + 1); t.lineTo(size + 1, -1);
    t.moveTo(-1, 1); t.lineTo(1, -1);
    t.moveTo(size - 1, size + 1); t.lineTo(size + 1, size - 1);
    t.stroke();
    this.hatch = this.ctx.createPattern(tile, 'repeat');
    if (this.hatch && typeof DOMMatrix !== 'undefined') this.hatch.setTransform(new DOMMatrix([1 / dpr, 0, 0, 1 / dpr, 0, 0]));
  }

  /** A filled box in model coordinates, snapped to device pixels, with an optional 1px inner outline. */
  box(x0: number, y0: number, x1: number, y1: number, fill: string | null, outline: string | null): void {
    const ctx = this.ctx;
    const a = this.snap(this.X(x0)), b = this.snap(this.Y(y0));
    const w = Math.max(1 / this.dpr, this.snap(this.X(x1)) - a), h = Math.max(1 / this.dpr, this.snap(this.Y(y1)) - b);
    if (fill) { ctx.fillStyle = fill; ctx.fillRect(a, b, w, h); }
    if (outline && w > 3 && h > 3) {
      ctx.strokeStyle = outline; ctx.lineWidth = 1;
      ctx.strokeRect(a + 0.5, b + 0.5, w - 1, h - 1);
    }
  }
  /** Torque overlay on a box: signal at the path opacity, hatched instead when `hatched`. */
  hotBox(x0: number, y0: number, x1: number, y1: number, hatched = false): void {
    const ctx = this.ctx;
    const a = this.snap(this.X(x0)), b = this.snap(this.Y(y0));
    const w = Math.max(1 / this.dpr, this.snap(this.X(x1)) - a), h = Math.max(1 / this.dpr, this.snap(this.Y(y1)) - b);
    ctx.globalAlpha = this.hotAlpha * this.base;
    ctx.fillStyle = hatched && this.hatch ? this.hatch : COLORS.signal;
    ctx.fillRect(a, b, w, h);
    ctx.globalAlpha = this.base;
  }
  /** A part's box: base fill, torque overlay when it carries torque, outline. */
  part(id: PartId, x0: number, y0: number, x1: number, y1: number, fill: string, outline: string | null = COLORS.third): void {
    this.fade(id);
    this.box(x0, y0, x1, y1, fill, null);
    if (this.hot.has(id)) this.hotBox(x0, y0, x1, y1);
    if (outline) this.box(x0, y0, x1, y1, null, outline);
  }
  /** Signal overlay on the current path, filled or stroked, when `id` carries torque. */
  hotPath(id: PartId, stroke = false): void {
    if (!this.hot.has(id)) return;
    const ctx = this.ctx;
    ctx.globalAlpha = this.hotAlpha * this.base;
    if (stroke) { ctx.strokeStyle = COLORS.signal; ctx.stroke(); } else { ctx.fillStyle = COLORS.signal; ctx.fill(); }
    ctx.globalAlpha = this.base;
  }

  /**
   * Teeth (or tabs) seen side-on: one line across the face per tooth on the near half, at height
   * r sin θ, so they sweep at the part's angular rate and crowd toward the top and bottom edges.
   */
  ticks(x0: number, x1: number, axisY: number, r: number, angle: number, count: number, colour: string, alpha: number): void {
    const ctx = this.ctx;
    const a = this.snap(this.X(x0)), b = this.snap(this.X(x1));
    if (b - a < 2) return;
    ctx.strokeStyle = colour; ctx.globalAlpha = alpha * this.base; ctx.lineWidth = 1;
    ctx.beginPath();
    const step = TWO_PI / count;
    for (let k = 0; k < count; k++) {
      const th = angle + k * step;
      if (Math.cos(th) <= 0.08) continue; // the far half, and teeth seen edge-on at the rim
      const y = this.line1(this.Y(axisY - r * Math.sin(th)));
      ctx.moveTo(a + 1, y); ctx.lineTo(b - 1, y);
    }
    ctx.stroke();
    ctx.globalAlpha = this.base;
  }
  tickColour(id: PartId): string { return this.hot.has(id) ? COLORS.ground : COLORS.third; }

  /** A quadrilateral path from a segment (xa, ya)–(xb, yb) widened by halfW on either side. */
  quad(xa: number, ya: number, xb: number, yb: number, halfW: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(this.X(xa - halfW), this.Y(ya)); ctx.lineTo(this.X(xa + halfW), this.Y(ya));
    ctx.lineTo(this.X(xb + halfW), this.Y(yb)); ctx.lineTo(this.X(xb - halfW), this.Y(yb));
    ctx.closePath();
  }
  circle(x: number, y: number, r: number): void {
    this.ctx.beginPath(); this.ctx.arc(this.X(x), this.Y(y), Math.max(0.5, this.L(r)), 0, TWO_PI);
  }
  fillCircle(id: PartId | null, x: number, y: number, r: number, fill: string, outline: string | null = COLORS.third): void {
    const ctx = this.ctx;
    if (id) this.fade(id);
    this.circle(x, y, r);
    ctx.fillStyle = fill; ctx.fill();
    if (id) this.hotPath(id);
    if (outline) { ctx.strokeStyle = outline; ctx.lineWidth = 1; ctx.stroke(); }
  }
  /** Radial ticks round an end-view circle, turning at `angle`. */
  radialTicks(x: number, y: number, r0: number, r1: number, angle: number, count: number, colour: string, width: number): void {
    const ctx = this.ctx;
    ctx.strokeStyle = colour; ctx.lineWidth = width;
    ctx.beginPath();
    for (let k = 0; k < count; k++) {
      const th = angle + (k * TWO_PI) / count, c = Math.cos(th), s = Math.sin(th);
      ctx.moveTo(this.X(x + r0 * c), this.Y(y + r0 * s)); ctx.lineTo(this.X(x + r1 * c), this.Y(y + r1 * s));
    }
    ctx.stroke();
  }

  label(x: number, y: number, text: string, align: CanvasTextAlign, colour: string = COLORS.third, dyPx = 0, dxPx = 0): void {
    const ctx = this.ctx;
    ctx.fillStyle = colour; ctx.textAlign = align;
    ctx.fillText(text, Math.round(this.X(x) + dxPx), Math.round(this.Y(y) + dyPx));
  }
}

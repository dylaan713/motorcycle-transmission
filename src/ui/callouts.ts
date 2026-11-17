import type { PartId } from '../model/parts';
import { selection } from '../app/selection';
import type { View3d } from '../view3d/view';
import { el } from './dom';

/**
 * Callout cards on leader lines over the 3D view. This module sits in the initial bundle, so it
 * imports only types from the 3D chunk. layoutCallouts is pure; mountCallouts owns the DOM.
 */

type AnchorId = keyof View3d['anchors'];

export interface CalloutSpec {
  anchor: AnchorId; title: string; text: string; side: 'left' | 'right';
  /** The group's main part, selected when the card is clicked. */
  part: PartId;
}

/**
 * The left column top to bottom, then the right: also the cards' tab order. With the default
 * camera (in front of the bike, a little to its left) the clutch end is on the left and the sprocket
 * end on the right, as in the schematic.
 */
export const CALLOUTS: CalloutSpec[] = [
  { anchor: 'clutch', side: 'left', part: 'clutchBasket', title: 'Clutch', text: 'Connects the engine to the gearbox, and lets it slip or let go.' },
  { anchor: 'forks', side: 'left', part: 'forkC', title: 'Shift forks', text: 'Slide a gear sideways to lock its neighbour to the shaft.' },
  { anchor: 'shiftDrum', side: 'left', part: 'shiftDrum', title: 'Shift drum', text: 'Each click of the pedal turns it one step and moves a fork.' },
  { anchor: 'inputShaft', side: 'right', part: 'inputShaft', title: 'Input shaft', text: 'Driven by the clutch. Its gears turn whenever the clutch does.' },
  { anchor: 'outputShaft', side: 'right', part: 'outputShaft', title: 'Output shaft', text: 'Drives the chain. It turns only with the rear wheel.' },
  { anchor: 'finalDrive', side: 'right', part: 'chain', title: 'Final drive', text: 'Sprockets and chain carry the output to the rear wheel.' },
];

/** One reusable point per anchor, for projectAnchors. */
export function projectionBuffer(): Record<string, Projected> {
  return Object.fromEntries(CALLOUTS.map((c) => [c.anchor, { x: 0, y: 0, visible: false }]));
}

/** Projects every callout's anchor into `into`'s own objects: nothing is allocated. */
export function projectAnchors(view: Pick<View3d, 'anchors' | 'project'>, into: Record<string, Projected>): void {
  for (const c of CALLOUTS) view.project(view.anchors[c.anchor], into[c.anchor]);
}

export interface Rect { x: number; y: number; w: number; h: number }
export interface Projected { x: number; y: number; visible: boolean }
export interface CalloutLayoutOptions {
  /** Card size, CSS px. */
  card?: { w: number; h: number };
  /** Regions no card may cover (toolbar, inset, loader, status line), in the same coordinates. */
  avoid?: Rect[];
  /** Distance from the stage edges, px. */
  margin?: number;
}
export interface PlacedCallout {
  spec: CalloutSpec;
  card: { x: number; y: number };
  line: { x1: number; y1: number; x2: number; y2: number } | null;
  /** False when the card has no room clear of `avoid`, its column's other cards and its own anchor; the caller hides it. */
  fits: boolean;
}

const DEFAULT_CARD = { w: 220, h: 72 };
const MIN_PITCH = 84; // px between slot tops, at least
const SLOT_GAP = 12; // px between cards, at least
const MAX_GAP = 40; // spread no wider than this
const EDGE_GAP = 12; // px kept clear of an avoided region
const MARGIN = 0;
/** A card keeps this far from its own anchor (the anchor ring and a little air), px. */
const ANCHOR_CLEAR = 8;

type Line = { x1: number; y1: number; x2: number; y2: number };
const lineBuffers = new WeakMap<PlacedCallout, Line>();

/** The stretches of [top, bottom] that no region in the column x..x+w covers, each kept `gap` clear of the regions. */
function freeIntervals(top: number, bottom: number, x: number, w: number, avoid: readonly Rect[], gap: number): Array<[number, number]> {
  let free: Array<[number, number]> = [[top, bottom]];
  for (const r of avoid) {
    if (r.x >= x + w || r.x + r.w <= x) continue; // not in this column
    const a = r.y - gap, b = r.y + r.h + gap;
    free = free.flatMap(([lo, hi]): Array<[number, number]> => (b <= lo || a >= hi ? [[lo, hi]] : [
      ...(a > lo ? [[lo, a] as [number, number]] : []), ...(b < hi ? [[b, hi] as [number, number]] : []),
    ]));
  }
  return free;
}

/**
 * Fixed slots: each side's cards stack in a column at that side of the stage. When the tallest
 * stretch of the column left free by the regions to avoid holds them all, they are centred in it
 * and spread a little; otherwise they take the free slots top to bottom and the cards past the last
 * slot drop out. Slots depend only on the size, so the cards hold still while the camera moves and
 * only the leader lines follow the anchors, except that a card never covers its own anchor: it moves
 * to the nearest free slot, or drops out when there is none. Pass `out` from a previous call to have
 * its objects reused instead of new ones made.
 */
export function layoutCallouts(
  specs: CalloutSpec[], projected: Record<string, Projected>, size: { w: number; h: number },
  opts: CalloutLayoutOptions = {}, out: PlacedCallout[] = [],
): PlacedCallout[] {
  const card = opts.card ?? DEFAULT_CARD;
  const margin = opts.margin ?? MARGIN;
  const avoid = opts.avoid ?? [];
  const pitch = Math.max(MIN_PITCH, card.h + SLOT_GAP);
  out.length = specs.length;
  for (const side of ['left', 'right'] as const) {
    const x = side === 'left' ? margin : size.w - margin - card.w;
    const free = freeIntervals(margin, size.h - margin, x, card.w, avoid, EDGE_GAP);
    const members: number[] = [];
    for (let i = 0; i < specs.length; i++) if (specs[i].side === side) members.push(i);
    const n = members.length;
    if (n === 0) continue;

    // every slot a card could take: each stretch filled from its top at the pitch
    const grid: number[] = [];
    for (const [lo, hi] of free) for (let y = lo; y + card.h <= hi; y += pitch) grid.push(y);
    const inFree = (y: number): boolean => free.some(([lo, hi]) => y >= lo && y + card.h <= hi);

    // the preferred slots: all n centred and spread in the tallest stretch, or the grid's first n
    const ys: Array<number | null> = [];
    const [lo, hi] = free.reduce((best, f) => (f[1] - f[0] > best[1] - best[0] ? f : best), [0, 0] as [number, number]);
    const band = hi - lo;
    if (band >= (n - 1) * pitch + card.h) {
      const step = n > 1 ? Math.min(card.h + MAX_GAP, Math.max(pitch, (band - card.h) / (n - 1))) : 0;
      const y0 = lo + (band - ((n - 1) * step + card.h)) / 2;
      for (let k = 0; k < n; k++) ys.push(y0 + k * step);
    } else {
      for (let k = 0; k < n; k++) ys.push(k < grid.length ? grid[k] : null);
    }

    // a card over its own anchor moves to the nearest slot that is clear of it and of the other cards
    const covers = (y: number, p: Projected | undefined): boolean => p !== undefined && p.visible &&
      p.x >= x - ANCHOR_CLEAR && p.x <= x + card.w + ANCHOR_CLEAR && p.y >= y - ANCHOR_CLEAR && p.y <= y + card.h + ANCHOR_CLEAR;
    for (let k = 0; k < n; k++) {
      const y = ys[k];
      const p = projected[specs[members[k]].anchor];
      if (y === null || !covers(y, p)) continue;
      const taken = (c: number): boolean => ys.some((o, j) => j !== k && o !== null && Math.abs(o - c) < card.h + SLOT_GAP);
      let best: number | null = null;
      for (const c of [...grid, ...ys.flatMap((o) => (o === null ? [] : [o - pitch, o + pitch]))]) {
        if (!inFree(c) || taken(c) || covers(c, p)) continue;
        if (best === null || Math.abs(c - y) < Math.abs(best - y)) best = c;
      }
      ys[k] = best;
    }

    for (let k = 0; k < n; k++) {
      const i = members[k], spec = specs[i];
      const fits = ys[k] !== null;
      const y = ys[k] ?? lo;
      let e = out[i];
      if (!e) { e = { spec, card: { x, y }, line: null, fits }; out[i] = e; }
      e.spec = spec; e.card.x = x; e.card.y = y; e.fits = fits;
      const p = projected[spec.anchor];
      if (fits && p && p.visible) {
        let line = lineBuffers.get(e);
        if (!line) { line = { x1: 0, y1: 0, x2: 0, y2: 0 }; lineBuffers.set(e, line); }
        line.x1 = side === 'left' ? x + card.w : x; line.y1 = y + card.h / 2; line.x2 = p.x; line.y2 = p.y;
        e.line = line;
      } else e.line = null;
    }
  }
  return out;
}

const SVG = 'http://www.w3.org/2000/svg';
const RING_R = 3.5;
/** Hide the labels on a stage narrower than this: two columns of cards would crowd the model. */
const MIN_STAGE_W = 720;
const FADE_DELAY_MS = 200;
/** Frames the camera must hold still before the leaders are tested for hidden anchors (a raycast each). */
const SETTLE_FRAMES = 3;

export interface Callouts {
  /** Re-projects and redraws when the camera or the stage changed; cheap to call every frame. */
  sync(): void;
  setVisible(on: boolean): void;
  /** Regions the cards must keep clear of; read when the size changes or after `invalidate`. */
  setAvoid(read: () => Rect[]): void;
  /** Something the cards avoid moved (the inset was toggled): re-read on the next sync. */
  invalidate(): void;
  dispose(): void;
}

/**
 * Mounts the cards and one SVG overlay for the leader lines in `layer`, which must sit exactly over
 * the 3D view. Labels hide at once while the camera is dragged and fade back after it stops. A
 * leader to an anchor hidden behind another part is dashed, as hidden lines are in a drawing.
 */
export function mountCallouts(layer: HTMLElement, view: View3d): Callouts {
  layer.classList.add('callouts');
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'callout-lines');
  svg.setAttribute('aria-hidden', 'true');
  const lines = CALLOUTS.map(() => {
    const g = document.createElementNS(SVG, 'g');
    const line = document.createElementNS(SVG, 'line');
    const ring = document.createElementNS(SVG, 'circle');
    ring.setAttribute('r', String(RING_R));
    g.append(line, ring);
    svg.append(g);
    return { g, line, ring };
  });
  const cards = CALLOUTS.map((c) => {
    const b = el('button', 'callout', { type: 'button', 'aria-label': `${c.title}: ${c.text} Select it.` },
      el('span', 'callout-title', {}, c.title), el('span', 'callout-text', {}, c.text));
    b.addEventListener('click', () => selection.set(c.part));
    return b;
  });
  layer.append(svg, ...cards);

  let visible = true;
  let dragging = false;
  let fadeTimer = 0;
  let version = -1;
  let size = { w: 0, h: 0 };
  let cardSize = DEFAULT_CARD;
  let readAvoid: () => Rect[] = () => [];
  let avoid: Rect[] = [];
  const layoutOpts: CalloutLayoutOptions = { card: cardSize, avoid };
  const projected = projectionBuffer();
  const placed: PlacedCallout[] = [];
  const drawn = new Float64Array(CALLOUTS.length * 6).fill(Number.NaN); // last written card x, y and line x1..y2
  const set = (node: Element, attr: string, i: number, v: number): void => {
    const r = Math.round(v * 2) / 2; // half-pixel steps: no DOM write for a sub-pixel change
    if (drawn[i] === r) return;
    drawn[i] = r;
    node.setAttribute(attr, String(r));
  };

  const apply = (): void => {
    layer.hidden = !visible || size.w < MIN_STAGE_W;
    if (dragging) layer.dataset.off = ''; else delete layer.dataset.off;
  };

  let measured = false;
  let still = 0; // frames since the camera last moved
  const markHidden = (): void => {
    CALLOUTS.forEach((c, i) => lines[i].g.classList.toggle('is-hidden', view.occluded(view.anchors[c.anchor])));
  };
  const draw = (): void => {
    const { w, h } = view.size;
    if (w !== size.w || h !== size.h) { size = { w, h }; measured = false; apply(); }
    if (layer.hidden) return;
    // cards wrap their text to the column width: measure the tallest once per size
    if (!measured) {
      for (const c of cards) c.hidden = false;
      cardSize = { w: cards[0].offsetWidth, h: Math.max(...cards.map((c) => c.offsetHeight)) };
      avoid = readAvoid(); // the page measures what the cards must keep clear of
      layoutOpts.card = cardSize; layoutOpts.avoid = avoid;
      measured = true;
    }
    projectAnchors(view, projected);
    layoutCallouts(CALLOUTS, projected, size, layoutOpts, placed);
    for (let i = 0; i < placed.length; i++) {
      const p = placed[i], card = cards[i], l = lines[i], o = i * 6;
      if (card.hidden === p.fits) card.hidden = !p.fits;
      const cx = Math.round(p.card.x), cy = Math.round(p.card.y);
      if (drawn[o] !== cx || drawn[o + 1] !== cy) { drawn[o] = cx; drawn[o + 1] = cy; card.style.transform = `translate(${cx}px, ${cy}px)`; }
      const show = p.fits && p.line !== null;
      if (show) {
        const { x1, y1, x2, y2 } = p.line!;
        set(l.line, 'x1', o + 2, x1); set(l.line, 'y1', o + 3, y1);
        if (drawn[o + 4] !== Math.round(x2 * 2) / 2 || drawn[o + 5] !== Math.round(y2 * 2) / 2) {
          set(l.line, 'x2', o + 4, x2); set(l.line, 'y2', o + 5, y2);
          l.ring.setAttribute('cx', String(drawn[o + 4])); l.ring.setAttribute('cy', String(drawn[o + 5]));
        }
      }
      const display = show ? '' : 'none';
      if (l.g.style.display !== display) l.g.style.display = display;
    }
  };

  const stopDrag = view.onCamera((phase) => {
    if (phase === 'drag') {
      clearTimeout(fadeTimer);
      if (!dragging) { dragging = true; apply(); }
    } else if (phase === 'end' && dragging) {
      clearTimeout(fadeTimer);
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const back = (): void => { dragging = false; version = -1; apply(); };
      if (reduced) back(); else fadeTimer = window.setTimeout(back, FADE_DELAY_MS);
    }
  });

  return {
    sync() {
      // hidden (labels off, a narrow stage) or mid-drag: no work; redraw in full when shown again
      if (!visible || dragging || (layer.hidden && size.w === view.size.w && size.h === view.size.h)) { version = -1; return; }
      const { w, h } = view.size;
      if (view.cameraVersion === version && w === size.w && h === size.h) {
        if (++still === SETTLE_FRAMES && !layer.hidden) markHidden();
        return;
      }
      version = view.cameraVersion;
      still = 0;
      draw();
    },
    setVisible(on) {
      if (on === visible) return;
      visible = on;
      version = -1;
      size = { w: -1, h: -1 }; // re-measure on the next sync
      apply();
    },
    setAvoid(read) { readAvoid = read; measured = false; version = -1; },
    invalidate() { measured = false; version = -1; },
    dispose() {
      stopDrag();
      clearTimeout(fadeTimer);
      layer.replaceChildren();
    },
  };
}

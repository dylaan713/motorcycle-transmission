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

/** Listed top to bottom within each side. With the default camera the clutch is on the right. */
export const CALLOUTS: CalloutSpec[] = [
  { anchor: 'outputShaft', side: 'left', part: 'outputShaft', title: 'Output shaft', text: 'Drives the chain. It turns only with the rear wheel.' },
  { anchor: 'clutch', side: 'right', part: 'clutchBasket', title: 'Clutch', text: 'Connects the engine to the gearbox, and lets it slip or let go.' },
  { anchor: 'finalDrive', side: 'left', part: 'chain', title: 'Final drive', text: 'Sprockets and chain carry the output to the rear wheel.' },
  { anchor: 'inputShaft', side: 'right', part: 'inputShaft', title: 'Input shaft', text: 'Driven by the clutch. Its gears turn whenever the clutch does.' },
  { anchor: 'forks', side: 'left', part: 'forkC', title: 'Shift forks', text: 'Slide a gear sideways to lock its neighbour to the shaft.' },
  { anchor: 'shiftDrum', side: 'right', part: 'shiftDrum', title: 'Shift drum', text: 'Each click of the pedal turns it one step and moves a fork.' },
];

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
  /** False when its side has no room for all its cards clear of `avoid`; the caller hides them. */
  fits: boolean;
}

/** The stage's top-right corner is kept for the instrument cluster, CSS px. */
export const INSTRUMENT_CLUSTER = { w: 300, h: 220 };
/** Status line and loader along the top of the stage, px. */
const TOP_BAND = 48;

/**
 * Regions of the stage no callout may cover, in the callout layer's coordinates (`origin` is the
 * layer's top-left within the stage): the status line along the top, the instrument cluster in the
 * top-right corner, and the inset (already in layer coordinates) when it shows.
 */
export function reservedRegions(stage: { w: number; h: number }, origin: { x: number; y: number }, inset: Rect | null): Rect[] {
  const out: Rect[] = [
    { x: -origin.x, y: -origin.y, w: stage.w, h: TOP_BAND },
    { x: stage.w - INSTRUMENT_CLUSTER.w - origin.x, y: -origin.y, w: INSTRUMENT_CLUSTER.w, h: INSTRUMENT_CLUSTER.h },
  ];
  if (inset) out.push(inset);
  return out;
}

const DEFAULT_CARD = { w: 220, h: 72 };
const MIN_PITCH = 84; // px between slot tops, at least
const SLOT_GAP = 12; // px between cards, at least
const MAX_GAP = 40; // spread no wider than this
const EDGE_GAP = 12; // px kept clear of an avoided region
const MARGIN = 0;

/**
 * Fixed slots: each side's cards stack in a column at that side of the stage, centred in the
 * vertical band left free by the regions to avoid. Slots depend only on the size, so the cards
 * hold still while the camera moves and only the leader lines follow the anchors.
 */
export function layoutCallouts(
  specs: CalloutSpec[], projected: Record<string, Projected>, size: { w: number; h: number },
  opts: CalloutLayoutOptions = {},
): PlacedCallout[] {
  const card = opts.card ?? DEFAULT_CARD;
  const margin = opts.margin ?? MARGIN;
  const avoid = opts.avoid ?? [];
  const pitch = Math.max(MIN_PITCH, card.h + SLOT_GAP);
  const columns = { left: margin, right: size.w - margin - card.w };
  const slots = new Map<CalloutSpec, { x: number; y: number; fits: boolean }>();
  for (const side of ['left', 'right'] as const) {
    const x = columns[side];
    let top = margin, bottom = size.h - margin;
    for (const r of avoid) {
      if (r.x >= x + card.w || r.x + r.w <= x) continue; // not in this column
      if (r.y + r.h / 2 > size.h / 2) bottom = Math.min(bottom, r.y - EDGE_GAP);
      else top = Math.max(top, r.y + r.h + EDGE_GAP);
    }
    const mine = specs.filter((s) => s.side === side);
    if (mine.length === 0) continue;
    const band = bottom - top;
    const fits = band >= (mine.length - 1) * pitch + card.h;
    // spread a little when there is room, centred in the band
    const step = mine.length > 1 ? Math.min(card.h + MAX_GAP, Math.max(pitch, (band - card.h) / (mine.length - 1))) : 0;
    const used = (mine.length - 1) * step + card.h;
    const y0 = fits ? top + (band - used) / 2 : top;
    mine.forEach((s, i) => slots.set(s, { x, y: y0 + i * step, fits }));
  }
  return specs.map((spec) => {
    const slot = slots.get(spec)!;
    const p = projected[spec.anchor];
    const line = p && p.visible
      ? { x1: spec.side === 'left' ? slot.x + card.w : slot.x, y1: slot.y + card.h / 2, x2: p.x, y2: p.y }
      : null;
    return { spec, card: { x: slot.x, y: slot.y }, line, fits: slot.fits };
  });
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
  const projected: Record<string, Projected> = {};

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
      const stageEl = layer.parentElement;
      const sr = stageEl?.getBoundingClientRect(), lr = layer.getBoundingClientRect();
      avoid = [
        ...(sr ? reservedRegions({ w: sr.width, h: sr.height }, { x: lr.left - sr.left, y: lr.top - sr.top }, null) : []),
        ...readAvoid(),
      ];
      measured = true;
    }
    for (const c of CALLOUTS) projected[c.anchor] = view.project(view.anchors[c.anchor]);
    const placed = layoutCallouts(CALLOUTS, projected, size, { card: cardSize, avoid });
    placed.forEach((p, i) => {
      const card = cards[i], l = lines[i];
      card.hidden = !p.fits;
      card.style.transform = `translate(${Math.round(p.card.x)}px, ${Math.round(p.card.y)}px)`;
      const show = p.fits && p.line !== null;
      if (show) {
        const { x1, y1, x2, y2 } = p.line!;
        l.line.setAttribute('x1', x1.toFixed(1)); l.line.setAttribute('y1', y1.toFixed(1));
        l.line.setAttribute('x2', x2.toFixed(1)); l.line.setAttribute('y2', y2.toFixed(1));
        l.ring.setAttribute('cx', x2.toFixed(1)); l.ring.setAttribute('cy', y2.toFixed(1));
      }
      l.g.style.display = show ? '' : 'none';
    });
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
      if (!visible) return;
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

import { expect, test } from 'vitest';
import * as calloutsModule from '../../src/ui/callouts';
import { CALLOUTS, layoutCallouts, projectAnchors, projectionBuffer, type PlacedCallout, type Rect } from '../../src/ui/callouts';

test('callouts take fixed slots on their side and lines join card to anchor', () => {
  const projected = Object.fromEntries(CALLOUTS.map((c, i) => [c.anchor, { x: 400 + i * 40, y: 200 + i * 30, visible: i !== 2 }]));
  const out = layoutCallouts(CALLOUTS, projected, { w: 1000, h: 700 });
  const left = out.filter((o) => o.spec.side === 'left'), right = out.filter((o) => o.spec.side === 'right');
  expect(left.length).toBeGreaterThan(0); expect(right.length).toBeGreaterThan(0);
  for (const o of left) expect(o.card.x).toBeLessThan(300);
  for (const o of right) expect(o.card.x).toBeGreaterThan(700);
  for (const side of [left, right]) for (let i = 1; i < side.length; i++) expect(side[i].card.y - side[i - 1].card.y).toBeGreaterThanOrEqual(84);
  expect(out[2].line).toBeNull();
  expect(out[0].line).toMatchObject({ x2: 400, y2: 200 });
});

test('six callouts, none naming a brand, each one sentence or two', () => {
  expect(CALLOUTS.length).toBe(6);
  for (const c of CALLOUTS) expect(c.text.length).toBeLessThanOrEqual(80);
  const MAKERS = /\b(honda|yamaha|suzuki|kawasaki|ducati|bmw|ktm|triumph|aprilia|harley|davidson|mv agusta|benelli|royal enfield|husqvarna|moto guzzi|indian)\b/i;
  for (const c of CALLOUTS) expect(`${c.title} ${c.text}`).not.toMatch(MAKERS);
});

test('cards tab by side, top to bottom: the left column first', () => {
  const sides = CALLOUTS.map((c) => c.side);
  expect(sides).toEqual(['left', 'left', 'left', 'right', 'right', 'right']);
});

test('projecting anchors writes into reused objects (no allocation per frame)', () => {
  const calls: unknown[] = [];
  const fake = {
    anchors: Object.fromEntries(CALLOUTS.map((c, i) => [c.anchor, { i }])),
    project(world: { i: number }, out: { x: number; y: number; visible: boolean }) { calls.push(out); out.x = world.i * 10; out.y = 5; out.visible = true; return out; },
  };
  const into = projectionBuffer();
  projectAnchors(fake as never, into);
  const first = CALLOUTS.map((c) => into[c.anchor]);
  projectAnchors(fake as never, into);
  CALLOUTS.forEach((c, i) => { expect(into[c.anchor]).toBe(first[i]); });
  expect(new Set(calls).size).toBe(CALLOUTS.length);
  expect(into[CALLOUTS[2].anchor].x).toBe(20);
});

test('slots do not move when the anchors do', () => {
  const at = (dx: number) => Object.fromEntries(CALLOUTS.map((c, i) => [c.anchor, { x: 300 + dx + i * 50, y: 150 + i * 60, visible: true }]));
  const a = layoutCallouts(CALLOUTS, at(0), { w: 1000, h: 700 }), b = layoutCallouts(CALLOUTS, at(120), { w: 1000, h: 700 });
  expect(b.map((o) => o.card)).toEqual(a.map((o) => o.card));
  expect(b[1].line!.x2).toBe(a[1].line!.x2 + 120);
});

test('a line starts on the card edge that faces the stage', () => {
  const projected = Object.fromEntries(CALLOUTS.map((c) => [c.anchor, { x: 500, y: 350, visible: true }]));
  const card = { w: 200, h: 60 };
  for (const o of layoutCallouts(CALLOUTS, projected, { w: 1000, h: 700 }, { card })) {
    expect(o.line!.x1).toBe(o.spec.side === 'left' ? o.card.x + card.w : o.card.x);
    expect(o.line!.y1).toBe(o.card.y + card.h / 2);
  }
});

test('cards keep clear of the regions they must avoid, and say when a side has no room', () => {
  const projected = Object.fromEntries(CALLOUTS.map((c) => [c.anchor, { x: 500, y: 350, visible: true }]));
  const card = { w: 200, h: 60 };
  const inset = { x: 0, y: 460, w: 340, h: 240 }; // bottom-left
  const toolbar = { x: 300, y: 640, w: 400, h: 60 };
  const out = layoutCallouts(CALLOUTS, projected, { w: 1000, h: 700 }, { card, avoid: [inset, toolbar] });
  const overlaps = (a: { x: number; y: number; w: number; h: number }, b: typeof a) =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  for (const o of out) {
    expect(o.fits).toBe(true);
    const r = { ...o.card, ...card };
    for (const z of [inset, toolbar]) expect(overlaps(r, z)).toBe(false);
    for (const p of out) if (p !== o) expect(overlaps(r, { ...p.card, ...card })).toBe(false);
  }
  // a column with room for one card keeps the first and drops the rest, rather than overlap
  const cramped = layoutCallouts(CALLOUTS, projected, { w: 1000, h: 260 }, { card, avoid: [{ x: 0, y: 120, w: 340, h: 140 }] });
  expect(cramped.filter((o) => o.spec.side === 'left').map((o) => o.fits)).toEqual([true, false, false]);
  expect(cramped[0].card.y + card.h).toBeLessThanOrEqual(120);
});

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const rectOf = (o: PlacedCallout, card: { w: number; h: number }): Rect => ({ ...o.card, ...card });
/** Every placed card is clear of the regions and of every other placed card. */
const expectClear = (out: PlacedCallout[], card: { w: number; h: number }, avoid: Rect[]) => {
  for (const o of out) {
    if (!o.fits) continue;
    for (const z of avoid) expect(overlaps(rectOf(o, card), z), `${o.spec.title} over a region`).toBe(false);
    for (const p of out) if (p !== o && p.fits) expect(overlaps(rectOf(o, card), rectOf(p, card)), `${o.spec.title} over ${p.spec.title}`).toBe(false);
  }
};

test('the regions to avoid come from the page alone: the callouts keep no copy of the stage layout', () => {
  expect(Object.keys(calloutsModule)).not.toContain('reservedRegions');
  expect(Object.keys(calloutsModule)).not.toContain('INSTRUMENT_CLUSTER');
});

test('with the page\'s regions at 1440 × 900 (top band, cluster, toolbar, inset), three cards a side fit', () => {
  // the callout layer of a 1080 × 712 stage, inset 24 px: the regions as main.ts measures them, in layer coordinates
  const layer = { w: 1032, h: 606 };
  const avoid: Rect[] = [
    { x: 0, y: 0, w: layer.w, h: 48 },                    // status line and loader
    { x: layer.w + 24 - 16 - 300, y: -24 + 16, w: 300, h: 196 }, // the instrument cluster, top right
    { x: 302, y: 606, w: 730, h: 58 },                    // the toolbar, under the layer
    { x: 0, y: 712 - 24 - 175 - 24 - 24, w: 278, h: 175 }, // the inset, bottom left
  ];
  const projected = Object.fromEntries(CALLOUTS.map((c) => [c.anchor, { x: 500, y: 300, visible: true }]));
  const card = { w: 220, h: 72 };
  const out = layoutCallouts(CALLOUTS, projected, layer, { card, avoid });
  for (const o of out) expect(o.fits, o.spec.title).toBe(true);
  expectClear(out, card, avoid);
});

test('a part card under the cluster leaves the right column room for one card: the others drop, nothing overlaps', () => {
  const layer = { w: 1100, h: 606 };
  const avoid: Rect[] = [
    { x: 0, y: 0, w: layer.w, h: 48 },
    { x: layer.w - 300, y: 0, w: 300, h: 196 },   // cluster
    { x: layer.w - 300, y: 204, w: 300, h: 250 }, // part card under it
  ];
  const projected = Object.fromEntries(CALLOUTS.map((c) => [c.anchor, { x: 550, y: 300, visible: true }]));
  const card = { w: 220, h: 72 };
  const out = layoutCallouts(CALLOUTS, projected, layer, { card, avoid });
  expect(out.filter((o) => o.spec.side === 'right').map((o) => o.fits)).toEqual([true, false, false]);
  expect(out.filter((o) => o.spec.side === 'left').every((o) => o.fits)).toBe(true);
  expectClear(out, card, avoid);
});

test('a card never sits on its own anchor: it moves to a free slot, or drops when there is none', () => {
  const card = { w: 220, h: 72 };
  const size = { w: 1000, h: 700 };
  const away = Object.fromEntries(CALLOUTS.map((c) => [c.anchor, { x: 500, y: 350, visible: true }]));
  const before = layoutCallouts(CALLOUTS, away, size, { card }).map((o) => ({ ...o.card }));
  // the clutch's anchor right under the clutch card's slot
  const on = { ...away, clutch: { x: before[0].x + 60, y: before[0].y + 30, visible: true } };
  const out = layoutCallouts(CALLOUTS, on, size, { card });
  const inside = (o: PlacedCallout, p: { x: number; y: number }) =>
    p.x >= o.card.x && p.x <= o.card.x + card.w && p.y >= o.card.y && p.y <= o.card.y + card.h;
  expect(out[0].fits).toBe(true);
  expect(inside(out[0], on.clutch)).toBe(false);
  expectClear(out, card, []);
  // the others keep their slots
  for (let i = 1; i < out.length; i++) expect(out[i].card).toEqual(before[i]);
  // a column with no spare slot: the card drops rather than cover its anchor
  const tight = { w: 1000, h: 3 * 84 };
  const t0 = layoutCallouts(CALLOUTS, away, tight, { card }).map((o) => ({ ...o.card }));
  const onTight = { ...away, clutch: { x: t0[0].x + 60, y: t0[0].y + 30, visible: true } };
  const t = layoutCallouts(CALLOUTS, onTight, tight, { card });
  expect(t[0].fits).toBe(false);
  expect(t[1].fits && t[2].fits).toBe(true);
});

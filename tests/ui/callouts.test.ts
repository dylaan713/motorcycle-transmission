import { expect, test } from 'vitest';
import { CALLOUTS, layoutCallouts, projectAnchors, projectionBuffer, reservedRegions } from '../../src/ui/callouts';

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
  const cramped = layoutCallouts(CALLOUTS, projected, { w: 1000, h: 260 }, { card, avoid: [{ x: 0, y: 120, w: 340, h: 140 }] });
  expect(cramped.filter((o) => o.spec.side === 'left').every((o) => !o.fits)).toBe(true);
});

test('reserved regions: the instrument cluster top-right and the inset bottom-left stay clear, three cards a side', () => {
  // a 1440 × 900 stage: 1080 × 712, its layer inset 24 px, the inset 28% at bottom-left
  const stage = { w: 1080, h: 712 }, origin = { x: 24, y: 24 };
  const layer = { w: 1032, h: 606 };
  const inset = { x: 0, y: 712 - 24 - 175 - 24, w: 278, h: 175 };
  const reserved = reservedRegions(stage, origin, inset);
  expect(reserved).toContainEqual({ x: stage.w - 300 - origin.x, y: -origin.y, w: 300, h: 220 });
  const projected = Object.fromEntries(CALLOUTS.map((c) => [c.anchor, { x: 500, y: 300, visible: true }]));
  const card = { w: 220, h: 72 };
  const out = layoutCallouts(CALLOUTS, projected, layer, { card, avoid: reserved });
  expect(out.filter((o) => o.spec.side === 'left').length).toBe(3);
  expect(out.filter((o) => o.spec.side === 'right').length).toBe(3);
  for (const o of out) {
    expect(o.fits, o.spec.title).toBe(true);
    if (o.spec.side === 'right') expect(o.card.y + origin.y).toBeGreaterThanOrEqual(220);
    if (o.spec.side === 'left') expect(o.card.y + card.h).toBeLessThanOrEqual(inset.y);
  }
});

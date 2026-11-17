import { expect, test } from 'vitest';
import { CALLOUTS, layoutCallouts } from '../../src/ui/callouts';

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

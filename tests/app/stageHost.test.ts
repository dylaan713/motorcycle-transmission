import { test, expect } from 'vitest';
import { createStageHost } from '../../src/app/stageHost';
import type { View } from '../../src/app/view';
import type { PartId } from '../../src/model/parts';
import { torquePath } from '../../src/model/torquePath';
import { createSimulation } from '../../src/sim/simulation';

const STATE = createSimulation().getState();
const PATH = torquePath(STATE);

/** A view that records what the host asks of it. */
function fakeView(answer: PartId | null = null) {
  const v = {
    renders: 0, picks: 0, highlight: null as PartId | null,
    render() { v.renders++; },
    resize() {},
    pick() { v.picks++; return answer; },
    setHighlight(p: PartId | null) { v.highlight = p; },
    dispose() {},
  };
  return v satisfies View;
}

test('schematic alone is main; 3D takes over and the schematic becomes the inset', () => {
  const host = createStageHost(); const a = fakeView(), b = fakeView();
  host.register('schematic', a); expect(host.main).toBe('schematic'); expect(host.inset).toBeNull();
  host.register('3d', b); expect(host.main).toBe('3d'); expect(host.inset).toBe('schematic');
  host.render(STATE, PATH); expect(a.renders).toBe(1); expect(b.renders).toBe(1);
  host.setInset(false); host.render(STATE, PATH); expect(a.renders).toBe(1); expect(b.renders).toBe(2);
  host.setMain('schematic'); expect(host.main).toBe('schematic'); expect(host.inset).toBeNull();
  host.setHighlight('shiftDrum'); expect(a.highlight).toBe('shiftDrum'); expect(b.highlight).toBe('shiftDrum');
});

test('swap exchanges main and inset', () => {
  const host = createStageHost(); const a = fakeView(), b = fakeView();
  host.register('schematic', a); host.register('3d', b);
  host.swap(); expect(host.main).toBe('schematic'); expect(host.inset).toBe('3d');
  host.swap(); expect(host.main).toBe('3d'); expect(host.inset).toBe('schematic');
});

test('swap with insets off still exchanges which view is main', () => {
  const host = createStageHost(); const a = fakeView(), b = fakeView();
  host.register('schematic', a); host.register('3d', b); host.setInset(false);
  host.swap(); expect(host.main).toBe('schematic'); expect(host.inset).toBeNull();
  host.render(STATE, PATH); expect(a.renders).toBe(1); expect(b.renders).toBe(0);
});

test('swap with one view registered does nothing', () => {
  const host = createStageHost(); host.register('schematic', fakeView());
  host.swap(); expect(host.main).toBe('schematic'); expect(host.inset).toBeNull();
});

test('pick asks the main view only', () => {
  const host = createStageHost(); const a = fakeView('gear3in'), b = fakeView(null);
  host.register('schematic', a);
  expect(host.pick(10, 10)).toBe('gear3in');
  host.register('3d', b);
  expect(host.pick(10, 10)).toBeNull(); expect(a.picks).toBe(1); expect(b.picks).toBe(1);
  host.swap();
  expect(host.pick(10, 10)).toBe('gear3in'); expect(a.picks).toBe(2); expect(b.picks).toBe(1);
});

test('pick with nothing registered is null', () => {
  expect(createStageHost().pick(0, 0)).toBeNull();
});

test('registering 3D while insets are off makes it main with no inset', () => {
  const host = createStageHost(); const a = fakeView(), b = fakeView();
  host.setInset(false);
  host.register('schematic', a); host.register('3d', b);
  expect(host.main).toBe('3d'); expect(host.inset).toBeNull();
  host.render(STATE, PATH); expect(a.renders).toBe(0); expect(b.renders).toBe(1);
  host.setInset(true); expect(host.inset).toBe('schematic');
  host.render(STATE, PATH); expect(a.renders).toBe(1); expect(b.renders).toBe(2);
});

test('a view registered later receives the current highlight', () => {
  const host = createStageHost(); const a = fakeView(), b = fakeView();
  host.register('schematic', a); host.setHighlight('clutchHub');
  host.register('3d', b); expect(b.highlight).toBe('clutchHub');
});

/** Just enough of an element for the host to move containers between slots. */
class FakeEl {
  parentElement: FakeEl | null = null;
  hidden = false;
  constructor(readonly root = false) {}
  append(c: FakeEl) { c.parentElement = this; }
  remove() { this.parentElement = null; }
  get isConnected(): boolean { return this.root || (this.parentElement?.isConnected ?? false); }
}

/** A view that logs resizes and renders, optionally redrawing itself inside resize. */
function loggingView(log: string[], name: string, redrawsOnResize = false) {
  const v = {
    redrawsOnResize,
    render() { log.push(`${name}:render`); },
    resize(w: number, h: number) { log.push(`${name}:resize ${w}x${h}`); },
    pick() { return null; },
    setHighlight() {},
    dispose() {},
  };
  return v satisfies View;
}

test('a resize is followed at once by a render with the last state, unless the view redraws itself', () => {
  const mainEl = new FakeEl(true), insetEl = new FakeEl(true);
  let onSize: ((slot: HTMLElement, w: number, h: number) => void) | null = null;
  const host = createStageHost(mainEl as unknown as HTMLElement, insetEl as unknown as HTMLElement, {
    observe: (_slots, size) => { onSize = size; },
  });
  const log: string[] = [];
  host.register('schematic', loggingView(log, '2d', true), new FakeEl() as unknown as HTMLElement);
  host.register('3d', loggingView(log, '3d'), new FakeEl() as unknown as HTMLElement);
  onSize!(mainEl as unknown as HTMLElement, 800, 600);
  onSize!(insetEl as unknown as HTMLElement, 200, 150);
  expect(log).toEqual(['3d:resize 800x600', '2d:resize 200x150']); // nothing rendered yet: no state to draw
  log.length = 0;
  host.render(STATE, PATH);
  expect(log).toEqual(['3d:render', '2d:render']);
  log.length = 0;
  onSize!(mainEl as unknown as HTMLElement, 640, 480);
  expect(log).toEqual(['3d:resize 640x480', '3d:render']);
  log.length = 0;
  onSize!(insetEl as unknown as HTMLElement, 180, 120);
  expect(log).toEqual(['2d:resize 180x120']); // the schematic redraws inside its own resize
  log.length = 0;
  host.swap(); // the views change slots: each is resized to its new slot and drawn there at once
  expect(log).toEqual(['2d:resize 640x480', '3d:resize 180x120', '3d:render']);
});

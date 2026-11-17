import type { PartId } from '../model/parts';
import type { TorquePath } from '../model/torquePath';
import type { SimState } from '../sim/types';
import type { View } from './view';

export type ViewName = '3d' | 'schematic';

/** Owns which view is the main one and which is the inset, and where each view's element sits. */
export interface StageHost {
  /** `container` is the element the view draws into; the host moves it between the two slots. */
  register(name: ViewName, view: View, container?: HTMLElement): void;
  setMain(name: ViewName): void; // the other registered view becomes the inset if insets are on
  setInset(on: boolean): void;
  swap(): void; // the inset becomes main and main the inset (or, with insets off, the hidden one main)
  readonly main: ViewName | null;
  readonly inset: ViewName | null;
  render(state: SimState, path: TorquePath): void; // renders main and, if on, inset
  pick(x: number, y: number): PartId | null; // main view only, CSS pixels relative to the main slot
  setHighlight(part: PartId | null): void; // both views
}

interface Entry { view: View; container: HTMLElement | null }
interface Size { w: number; h: number }

/** Reports each slot's content size, and changes of pixel ratio alone; ResizeObserver in the page. */
export type ObserveSize = (
  slots: HTMLElement[], onSize: (slot: HTMLElement, w: number, h: number) => void, onRatio: () => void,
) => void;

const observeWithResizeObserver: ObserveSize = (slots, onSize, onRatio) => {
  if (typeof ResizeObserver === 'undefined') return;
  const ro = new ResizeObserver((entries) => {
    for (const entry of entries) onSize(entry.target as HTMLElement, entry.contentRect.width, entry.contentRect.height);
  });
  for (const slot of slots) ro.observe(slot);
  // a change of pixel ratio alone (another monitor, or zoom) resizes nothing, so watch for it too
  const watchPixelRatio = (): void => {
    matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`).addEventListener('change', () => {
      onRatio();
      watchPixelRatio(); // the query names one ratio: re-arm for the new one
    }, { once: true });
  };
  watchPixelRatio();
};

/**
 * With the two slot elements it also places each view's container in its slot, keeps every view
 * sized to its slot, and skips drawing a view that is detached, unsized or in a hidden tab.
 * Setting a canvas's size clears it, and a resize lands after the frame's render and before the
 * paint, so a resized view is drawn again at once with the last state, unless it says it redraws
 * itself (`redrawsOnResize`). Without the slots (unit tests) it only tracks state and calls the views.
 */
export function createStageHost(
  mainEl?: HTMLElement, insetEl?: HTMLElement, opts: { observe?: ObserveSize } = {},
): StageHost {
  const views = new Map<ViewName, Entry>();
  let mainName: ViewName | null = null;
  let insetOn = true;
  let highlight: PartId | null = null;
  const slotSize = new Map<HTMLElement, Size>();
  let last: { state: SimState; path: TorquePath } | null = null;

  const other = (name: ViewName | null): ViewName | null => {
    for (const n of views.keys()) if (n !== name) return n;
    return null;
  };
  const insetName = (): ViewName | null => (insetOn ? other(mainName) : null);
  const dpr = (): number => (typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1);

  const slotOf = (name: ViewName): HTMLElement | undefined => {
    if (name === mainName) return mainEl;
    if (name === insetName()) return insetEl;
    return undefined;
  };

  const drawable = (e: Entry, slot: HTMLElement | undefined): boolean => {
    if (typeof document !== 'undefined' && document.hidden) return false;
    if (!slot || !e.container) return true; // no DOM to check: the caller manages it
    const size = slotSize.get(slot);
    return e.container.isConnected && size !== undefined && size.w > 0 && size.h > 0;
  };

  const resizeIn = (slot: HTMLElement): void => {
    const size = slotSize.get(slot);
    if (!size) return;
    for (const [name, e] of views) {
      if (slotOf(name) !== slot) continue;
      e.view.resize(size.w, size.h, dpr());
      if (last && !e.view.redrawsOnResize && drawable(e, slot)) e.view.render(last.state, last.path);
    }
  };

  /** Puts each container in its slot (or takes it out of the page) and resizes what moved. */
  const place = (): void => {
    if (!mainEl || !insetEl) return;
    for (const [name, e] of views) {
      if (!e.container) continue;
      const slot = slotOf(name);
      if (!slot) { e.container.remove(); continue; }
      if (e.container.parentElement !== slot) slot.append(e.container);
    }
    insetEl.hidden = insetName() === null;
    resizeIn(mainEl); resizeIn(insetEl);
  };

  if (mainEl && insetEl) {
    (opts.observe ?? observeWithResizeObserver)([mainEl, insetEl], (slot, w, h) => {
      slotSize.set(slot, { w, h });
      resizeIn(slot);
    }, () => { resizeIn(mainEl); resizeIn(insetEl); });
  }

  return {
    register(name, view, container) {
      views.get(name)?.view.dispose();
      views.set(name, { view, container: container ?? null });
      view.setHighlight(highlight);
      if (name === '3d' || mainName === null) mainName = name;
      place();
    },
    setMain(name) {
      if (!views.has(name) || name === mainName) return;
      mainName = name;
      place();
    },
    setInset(on) {
      if (on === insetOn) return;
      insetOn = on;
      place();
    },
    swap() {
      const next = other(mainName);
      if (next !== null) this.setMain(next);
    },
    get main() { return mainName; },
    get inset() { return insetName(); },
    render(state, path) {
      last = { state, path };
      for (const name of [mainName, insetName()]) {
        if (name === null) continue;
        const e = views.get(name)!;
        if (drawable(e, slotOf(name))) e.view.render(state, path);
      }
    },
    pick(x, y) {
      return mainName === null ? null : views.get(mainName)!.view.pick(x, y);
    },
    setHighlight(part) {
      highlight = part;
      for (const e of views.values()) e.view.setHighlight(part);
    },
  };
}

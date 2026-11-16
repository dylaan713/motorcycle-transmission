import type { Driver, DriverMode } from '../app/driver';
import { el, setText } from './dom';
import type { Reading } from './readouts';

/**
 * The mode chip in the header: "Demo ride" while the autopilot drives, a "Watch the demo" button
 * once the visitor has taken over, and "Start the demo ride" when nobody rides (reduced motion).
 * Empty until `ready()`, so nothing flickers during the arrival.
 */
export function mountModeChip(host: HTMLElement, driver: Driver): { ready(): void } {
  let shown: DriverMode | null = null;
  let isReady = false;
  const render = (): void => {
    if (!isReady || driver.mode === shown) return;
    shown = driver.mode;
    const hadFocus = host.contains(document.activeElement);
    if (shown === 'demo') {
      const chip = el('div', 'chip', { tabindex: '-1' },
        el('span', 'chip-dot', { 'aria-hidden': 'true' }), el('span', 'chip-name', {}, 'Demo ride'),
        el('span', 'chip-hint', {}, 'touch any control to take over'));
      host.replaceChildren(chip);
      if (hadFocus) chip.focus();
    } else {
      const label = shown === 'idle' ? 'Start the demo ride' : 'Watch the demo';
      const b = el('button', 'chip-btn', { type: 'button', 'data-press': '' }, label);
      b.addEventListener('click', () => driver.startDemo());
      host.replaceChildren(b);
      if (hadFocus) b.focus();
    }
  };
  driver.onModeChange(render);
  return { ready() { isReady = true; render(); } };
}

const STALLED = 'Stalled. Pull the clutch and press Enter to restart.';
const OFF = 'Ignition off. Press I to switch it on.';

/** A polite live line for status changes (a stall, the ignition); never the changing numbers. */
export function mountStatus(host: HTMLElement): { sync(r: Reading): void } {
  host.setAttribute('role', 'status');
  host.setAttribute('aria-live', 'polite');
  return {
    sync(r) {
      setText(host, r.engine === 'stalled' ? STALLED : r.engine === 'off' ? OFF : '');
    },
  };
}

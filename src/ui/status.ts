import type { Driver, DriverMode } from '../app/driver';
import { el, setText } from './dom';
import type { Reading } from './readouts';

/**
 * The mode chip in the header, status and the way back: "Demo ride" while the autopilot drives, a "Watch the demo" button
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
        // a short hint on phones; at 1280px and wider the deck carries the invitation instead
        el('span', 'chip-hint', {},
          el('span', 'chip-hint-long', {}, 'touch any control to take over'),
          el('span', 'chip-hint-short', {}, 'any control takes over')));
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

// keyboard wording on wide screens with a fine pointer, the deck's button names on phones
const MESSAGES = {
  keys: { stalled: 'Stalled. Pull the clutch and press Enter to restart.', off: 'Ignition off. Press I to switch it on.' },
  touch: { stalled: 'Stalled. Pull the clutch and press Start to restart.', off: 'Ignition off. Tap Ignition to switch it on.' },
} as const;

/**
 * What the status line says. A stall or ignition message takes precedence while it lasts. A notice
 * (the 3D view paused or unavailable) stays until the next status change: another notice, its own
 * `clear`, or a stall or ignition message, after which it is not shown again. Pure.
 */
export function createStatusText(): {
  notice(text: string): void;
  /** Clears the notice only if it is still `text`, so another message is never wiped. */
  clear(text: string): void;
  text(engine: Reading['engine'], touch: boolean): string;
} {
  let note = '';
  return {
    notice(text) { note = text; },
    clear(text) { if (note === text) note = ''; },
    text(engine, touch) {
      const m = MESSAGES[touch ? 'touch' : 'keys'];
      if (engine === 'stalled' || engine === 'off') { note = ''; return engine === 'stalled' ? m.stalled : m.off; }
      return note;
    },
  };
}

/** A polite live line for status changes (a stall, the ignition, a notice); never the changing numbers. */
export function mountStatus(host: HTMLElement): { sync(r: Reading): void; notice(text: string): void; clear(text: string): void } {
  host.setAttribute('role', 'status');
  host.setAttribute('aria-live', 'polite');
  const touch = matchMedia('(max-width: 899.98px), (pointer: coarse)');
  const status = createStatusText();
  return {
    sync(r) { setText(host, status.text(r.engine, touch.matches)); },
    notice: status.notice,
    clear: status.clear,
  };
}

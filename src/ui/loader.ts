import { clamp } from '../sim/units';
import { el, setText } from './dom';

/** How long the loader takes to fade out once the view is ready, in ms (matches styles.css). */
const FADE_MS = 300;

export interface Loader {
  progress(done: number, total: number, label: string): void;
  /** Fades the loader out and removes it. */
  done(): void;
  /** Removes it at once. */
  remove(): void;
}

/** How long "3D view ready" stays in the page for a screen reader to say it, in ms. */
const ANNOUNCE_MS = 3000;

/**
 * A thin progress bar with a percentage and the current step, over the stage. The steps change
 * several times a second, so they are for the eye only: a screen reader hears "Loading 3D view"
 * and then "3D view ready", from a live region of their own.
 */
export function mountLoader(host: HTMLElement): Loader {
  const label = el('span', 'loader-label', {}, 'Loading 3D view');
  const pct = el('span', 'loader-pct', {}, '0%');
  const fill = el('div', 'loader-fill');
  const root = el('div', 'loader mono', { 'aria-hidden': 'true' },
    el('div', 'loader-line', {}, label, pct), el('div', 'loader-bar', {}, fill));
  const said = el('span', 'sr-only', { role: 'status' }, 'Loading 3D view');
  host.append(root, said);
  return {
    progress(done, total, text) {
      const p = total > 0 ? clamp(done / total, 0, 1) : 0;
      setText(label, text);
      setText(pct, `${Math.round(p * 100)}%`);
      fill.style.setProperty('--v', String(p));
    },
    done() {
      root.dataset.done = '';
      setText(said, '3D view ready');
      setTimeout(() => root.remove(), FADE_MS);
      setTimeout(() => said.remove(), ANNOUNCE_MS);
    },
    remove() { root.remove(); said.remove(); },
  };
}

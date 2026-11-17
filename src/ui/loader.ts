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

/** A thin progress bar with a percentage and the current step, over the stage. */
export function mountLoader(host: HTMLElement): Loader {
  const label = el('span', 'loader-label', {}, 'Loading 3D view');
  const pct = el('span', 'loader-pct', {}, '0%');
  const fill = el('div', 'loader-fill');
  const root = el('div', 'loader mono', { role: 'status', 'aria-live': 'polite' },
    el('div', 'loader-line', {}, label, pct), el('div', 'loader-bar', { 'aria-hidden': 'true' }, fill));
  host.append(root);
  return {
    progress(done, total, text) {
      const p = total > 0 ? Math.min(1, Math.max(0, done / total)) : 0;
      setText(label, text);
      setText(pct, `${Math.round(p * 100)}%`);
      fill.style.setProperty('--v', String(p));
    },
    done() {
      root.dataset.done = '';
      setTimeout(() => root.remove(), FADE_MS);
    },
    remove() { root.remove(); },
  };
}

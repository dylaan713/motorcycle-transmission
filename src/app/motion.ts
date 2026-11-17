import type { Driver } from './driver';
import type { Loop } from './loop';

/**
 * Under reduced motion nothing moves that the visitor did not ask for. The idling engine would
 * still turn every shaft and gear, so after the first frame the loop is paused; the first time
 * anyone rides (the visitor takes over or starts the demo) it resumes for good. Call `frame` from
 * the loop's frame callback.
 */
export function holdForReducedMotion(loop: Pick<Loop, 'setPaused'>, driver: Pick<Driver, 'onModeChange'>, reduced: boolean): { frame(): void } {
  let state: 'awaitFirstFrame' | 'held' | 'free' = reduced ? 'awaitFirstFrame' : 'free';
  driver.onModeChange((mode) => {
    if (mode === 'idle' || state === 'free') return;
    const wasHeld = state === 'held';
    state = 'free';
    if (wasHeld) loop.setPaused(false);
  });
  return {
    frame() {
      if (state !== 'awaitFirstFrame') return;
      state = 'held';
      loop.setPaused(true);
    },
  };
}

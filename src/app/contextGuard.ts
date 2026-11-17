import type { ViewName } from './stageHost';

/**
 * Which view may be main while the 3D view's WebGL context comes and goes. While it is lost the
 * schematic is main and nothing may put the dead 3D canvas back; on restore the stage returns to
 * 3D only if 3D was main when the context was lost, so a visitor who had chosen the schematic keeps it.
 */
export interface ContextGuard {
  readonly lost: boolean;
  /** The context was lost with `main` showing; returns the view to make main. */
  lose(main: ViewName | null): ViewName;
  /** The context is back; returns the view to make main, given the one main now. */
  restore(main: ViewName | null): ViewName | null;
  /** The view to make main when `requested` is asked for (a toolbar button, the inset): null to refuse. */
  request(requested: ViewName): ViewName | null;
  /** Forget any loss: the 3D view that had it is gone (a new one starts with a live context). */
  reset(): void;
}

export function createContextGuard(): ContextGuard {
  let lost = false;
  let was3dMain = false;
  return {
    get lost() { return lost; },
    lose(main) {
      if (!lost) { lost = true; was3dMain = main === '3d'; }
      return 'schematic';
    },
    restore(main) {
      if (!lost) return main;
      lost = false;
      return was3dMain ? '3d' : main;
    },
    request(requested) {
      return lost && requested === '3d' ? null : requested;
    },
    reset() { lost = false; was3dMain = false; },
  };
}

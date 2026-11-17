import { el } from './dom';

export const TOUCH_HINT = 'Drag to orbit, pinch to zoom';

export interface TouchHint {
  /** Shows the hint on a narrow screen with the 3D view main, until it is dismissed. */
  sync(s: { narrow: boolean; main3d: boolean }): void;
}

/**
 * The phone's camera hint: one line over the stage, shown once. The first touch (any press) on
 * the stage dismisses it for good. Wide screens have the toolbar's hint instead. Hidden from
 * screen readers: the 3D canvas's own label says how to orbit.
 */
export function mountTouchHint(stage: HTMLElement): TouchHint {
  const node = el('p', 'touch-hint', { 'aria-hidden': 'true' }, TOUCH_HINT);
  node.hidden = true;
  stage.append(node);
  let dismissed = false;
  const dismiss = (): void => {
    dismissed = true;
    node.remove();
    stage.removeEventListener('pointerdown', dismiss);
  };
  stage.addEventListener('pointerdown', dismiss);
  return {
    sync({ narrow, main3d }) {
      if (dismissed) return;
      node.hidden = !(narrow && main3d);
    },
  };
}

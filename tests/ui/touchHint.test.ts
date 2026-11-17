import { expect, test } from 'vitest';
import { FakeElement, withFakeDocument } from './fakeDom';
import { mountTouchHint, TOUCH_HINT } from '../../src/ui/touchHint';

test('on a phone with the 3D view main, a one-line hint shows once; the first touch on the stage dismisses it for good', async () => {
  await withFakeDocument(() => {
    expect(TOUCH_HINT).toBe('Drag to orbit, pinch to zoom');
    const stage = new FakeElement('DIV');
    const hint = mountTouchHint(stage as unknown as HTMLElement);
    const node = stage.all().find((e) => e.textContent === TOUCH_HINT)!;
    expect(node).toBeDefined();
    expect(node.getAttribute('aria-hidden')).toBe('true'); // the canvas's own label says how to orbit
    hint.sync({ narrow: false, main3d: true });
    expect(node.hidden).toBe(true); // wide screens have the toolbar hint
    hint.sync({ narrow: true, main3d: false });
    expect(node.hidden).toBe(true); // the schematic does not orbit
    hint.sync({ narrow: true, main3d: true });
    expect(node.hidden).toBe(false);
    stage.fire('pointerdown', { pointerType: 'touch' });
    expect(stage.all()).toHaveLength(0);
    hint.sync({ narrow: true, main3d: true }); // never again
    expect(stage.all()).toHaveLength(0);
    expect(stage.listeners.get('pointerdown')).toEqual([]);
  });
});

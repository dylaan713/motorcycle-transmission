import { expect, test, vi } from 'vitest';
import { FakeElement, withFakeDocument } from './fakeDom';
import { mountLoader } from '../../src/ui/loader';

test('the loader announces only "Loading 3D view" and "3D view ready"; its step labels are for the eye', async () => {
  vi.useFakeTimers();
  try {
    await withFakeDocument(() => {
      const host = new FakeElement('DIV');
      const loader = mountLoader(host as unknown as HTMLElement);
      const live = host.all().filter((e) => e.getAttribute('aria-live') !== null || e.getAttribute('role') === 'status');
      expect(live).toHaveLength(1);
      const [region] = live;
      expect(region.textContent).toBe('Loading 3D view');
      const steps = ['Shafts', 'Input gears', 'Output gears', 'Clutch', 'Shift drum', 'Final drive', 'Wheel', 'Ready'];
      steps.forEach((s, i) => loader.progress(i + 1, steps.length, s));
      expect(region.textContent).toBe('Loading 3D view');
      // the label the eye reads changes, out of the accessibility tree
      const visible = host.all().find((e) => e.className.includes('loader-line'))!;
      expect(visible.textContent).toContain('Ready');
      let n: FakeElement | null = visible;
      let hidden = false;
      while (n) { if (n.getAttribute('aria-hidden') === 'true') hidden = true; n = n.parent; }
      expect(hidden).toBe(true);
      loader.done();
      expect(region.textContent).toBe('3D view ready');
      vi.runAllTimers();
      expect(host.all()).toHaveLength(0); // everything goes once it has been said
    });
  } finally { vi.useRealTimers(); }
});

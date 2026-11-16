import { expect, test } from 'vitest';
import { createDriver } from '../../src/app/driver';
import type { InputSource } from '../../src/sim/inputScript';
import { createSimulation } from '../../src/sim/simulation';
import { NEUTRAL_INPUTS } from '../../src/sim/types';

test('driver: demo until taken over, and back', () => {
  const visitor: InputSource = () => ({ ...NEUTRAL_INPUTS, throttle: 0.77 });
  const d = createDriver(visitor, { autoStart: true }); const modes: string[] = [];
  d.onModeChange((m) => modes.push(m));
  expect(d.mode).toBe('demo');
  d.takeOver(); d.takeOver();
  expect(d.mode).toBe('visitor');
  expect(d.source()(0, createSimulation().getState()).throttle).toBe(0.77);
  d.startDemo(); expect(modes).toEqual(['visitor', 'demo']);
  expect(createDriver(visitor, { autoStart: false }).mode).toBe('idle');
});

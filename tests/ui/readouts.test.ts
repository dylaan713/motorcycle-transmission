import { test, expect } from 'vitest';
import { formatReading } from '../../src/ui/readouts';
import { inGear } from '../sim/helpers';
import { createSimulation } from '../../src/sim/simulation';
import { finalRatio, gearRatio, primaryRatio } from '../../src/sim/kinematics';
import { NEUTRAL_INPUTS } from '../../src/sim/types';
import { deg } from '../../src/sim/units';

test('formats a riding state', () => {
  const sim = inGear(3, 6000); const r = formatReading(sim.getState(), NEUTRAL_INPUTS);
  expect(r.gear).toBe('3'); expect(r.rpm).toBe('06000'); expect(r.clutch).toBe('locked'); expect(r.engine).toBe('running');
  expect(r.ratio).toBe((primaryRatio * gearRatio(3) * finalRatio).toFixed(2));
  expect(r.speedKmh).toMatch(/^\d{3}$/);
});
test('neutral, false neutral, clutch open, stalled and off', () => {
  const s = createSimulation().getState();
  expect(formatReading(s, NEUTRAL_INPUTS).gear).toBe('N');
  s.drum.angle = deg(90); expect(formatReading(s, NEUTRAL_INPUTS).gear).toBe('–');
  s.clutch.capacity = 0; expect(formatReading(s, NEUTRAL_INPUTS).clutch).toBe('open');
  s.engine.running = false; expect(formatReading(s, NEUTRAL_INPUTS).engine).toBe('stalled');
  expect(formatReading(s, { ...NEUTRAL_INPUTS, ignition: false }).engine).toBe('off');
  expect(formatReading(s, NEUTRAL_INPUTS).ratio).toBe('—');
});

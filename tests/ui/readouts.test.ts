import { test, expect } from 'vitest';
import { formatReading } from '../../src/ui/readouts';
import { inGear } from '../sim/helpers';
import { createSimulation } from '../../src/sim/simulation';
import { finalRatio, gearRatio, primaryRatio } from '../../src/sim/kinematics';
import { NEUTRAL_INPUTS } from '../../src/sim/types';
import { deg, rpm } from '../../src/sim/units';

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

test('readings clamp to their fixed widths and never show a negative zero', () => {
  const s = createSimulation().getState();
  s.engine.omega = rpm(123456); s.roadSpeed = 400; // 1,440 km/h
  let r = formatReading(s, NEUTRAL_INPUTS);
  expect(r.rpm).toBe('99999'); expect(r.speedKmh).toBe('999');
  s.engine.omega = rpm(-250); s.roadSpeed = -2; // running backwards, rolling back at 7.2 km/h
  r = formatReading(s, NEUTRAL_INPUTS);
  expect(r.rpm).toBe('00000'); expect(r.speedKmh).toBe('007');
  s.clutch.slip = rpm(-0.4); s.clutch.torque = -0.3;
  r = formatReading(s, NEUTRAL_INPUTS);
  expect(r.slipRpm).toBe('0'); expect(r.torqueNm).toBe('0');
  s.clutch.slip = rpm(-12); s.clutch.torque = -40.4;
  r = formatReading(s, NEUTRAL_INPUTS);
  expect(r.slipRpm).toBe('−12'); expect(r.torqueNm).toBe('−40');
});

test('the tachometer needle stops at the end of its scale while the reading stays true', async () => {
  const { tachPosition, TACH_MAX_RPM } = await import('../../src/ui/readouts');
  expect(tachPosition(0)).toBe(0);
  expect(tachPosition(7500)).toBe(0.5);
  expect(tachPosition(TACH_MAX_RPM)).toBe(1);
  expect(tachPosition(17200)).toBe(1);
  expect(tachPosition(-300)).toBe(0);
  const s = createSimulation().getState(); s.engine.omega = rpm(17200);
  expect(formatReading(s, NEUTRAL_INPUTS).rpm).toBe('17200');
});

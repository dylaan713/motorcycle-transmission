import { overallRatio } from '../sim/kinematics';
import { seatedDetent } from '../sim/shiftDrum';
import type { Inputs, SimState } from '../sim/types';
import { toRpm } from '../sim/units';
import { el, setText, srOnly } from './dom';

export interface Reading {
  gear: string; rpm: string; speedKmh: string; inputRpm: string; outputRpm: string; ratio: string;
  slipRpm: string; torqueNm: string;
  clutch: 'locked' | 'slipping' | 'open';
  engine: 'running' | 'stalled' | 'off';
}

const pad = (v: number, digits: number): string =>
  String(Math.min(10 ** digits - 1, Math.max(0, Math.round(v)))).padStart(digits, '0');
/** A signed whole number with a true minus sign, and no "-0". */
const signed = (v: number): string => {
  const n = Math.round(v);
  return n < 0 ? `−${-n}` : String(n);
};

/**
 * The readings shown on the page, as display strings. Pure. The gear comes from the locked dog;
 * with nothing locked it is N only where the drum is seated in the neutral detent, worked out from
 * the drum angle itself, and a dash anywhere else (a false neutral).
 */
export function formatReading(state: SimState, inputs: Inputs): Reading {
  const g = state.lockedGear;
  const gear = g !== null ? String(g) : seatedDetent(state.drum.angle) === 'N' ? 'N' : '–';
  return {
    gear,
    rpm: pad(toRpm(state.engine.omega), 5),
    speedKmh: pad(Math.abs(state.roadSpeed) * 3.6, 3),
    inputRpm: pad(Math.abs(toRpm(state.inputShaftOmega)), 5),
    outputRpm: pad(Math.abs(toRpm(state.outputShaftOmega)), 5),
    ratio: g !== null ? overallRatio(g).toFixed(2) : '—',
    slipRpm: signed(toRpm(state.clutch.slip)),
    torqueNm: signed(state.clutch.torque),
    clutch: state.clutch.capacity <= 0 ? 'open' : state.clutch.locked ? 'locked' : 'slipping',
    engine: !inputs.ignition ? 'off' : state.engine.running ? 'running' : 'stalled',
  };
}

/** Top of the tachometer scale; the last TACH_BAND_RPM of it is the marked band. */
export const TACH_MAX_RPM = 15000;
export const TACH_BAND_RPM = 1000;

/**
 * Header readings: gear, engine rpm with a tachometer bar, and road speed. `sync` moves the bar
 * every call and writes text only when a value has changed; the caller decides how often a new
 * Reading is made.
 */
export function mountReadouts(_header: HTMLElement, live: HTMLElement): { sync(r: Reading, state: SimState): void } {
  const gear = el('span', 'ro-gear-value', { 'data-count': '' }, 'N');
  const rpmText = el('span', 'ro-value', { 'data-count': '' }, '00000');
  const speed = el('span', 'ro-value', { 'data-count': '' }, '000');
  const tach = el('div', 'tach', { 'aria-hidden': 'true' },
    el('div', 'tach-fill'), el('div', 'tach-band'), el('div', 'tach-needle'));
  tach.style.setProperty('--band', String(TACH_BAND_RPM / TACH_MAX_RPM));
  live.replaceChildren(
    el('div', 'ro ro-gear', {}, el('span', 'ro-label', {}, 'Gear'), gear),
    el('div', 'ro ro-rpm', {},
      el('div', 'ro-line', {}, srOnly('Engine speed '), rpmText, el('span', 'ro-unit', {}, 'rpm')),
      tach),
    el('div', 'ro ro-speed', {}, el('div', 'ro-line', {}, srOnly('Road speed '), speed, el('span', 'ro-unit', {}, 'km/h'))),
  );
  let shown = Number.NaN;

  return {
    sync(r, state) {
      // the bar clamps to the scale; the number beside it stays true
      const v = Math.min(1, Math.max(0, toRpm(state.engine.omega) / TACH_MAX_RPM));
      const q = Math.round(v * 1000) / 1000;
      if (q !== shown) { shown = q; tach.style.setProperty('--v', String(q)); }
      setText(gear, r.gear);
      setText(rpmText, r.rpm);
      setText(speed, r.speedKmh);
    },
  };
}

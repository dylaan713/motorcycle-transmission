import { overallRatio } from '../sim/kinematics';
import { seatedDetent } from '../sim/shiftDrum';
import type { Inputs, SimState } from '../sim/types';
import { clamp, toRpm } from '../sim/units';
import { el, setText, srOnly } from './dom';

export interface Reading {
  gear: string; rpm: string; speedKmh: string; inputRpm: string; outputRpm: string; ratio: string;
  slipRpm: string; torqueNm: string;
  clutch: 'locked' | 'slipping' | 'open';
  engine: 'running' | 'stalled' | 'off';
}

const pad = (v: number, digits: number): string =>
  String(clamp(Math.round(v), 0, 10 ** digits - 1)).padStart(digits, '0');
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
const TACH_TICK_RPM = 1000;
const TACH_NUMERALS = [0, 5, 10, 15]; // thousands of rpm

/** Where the tachometer needle sits, 0..1 of the scale: clamped to the scale, rounded so it moves only when it shows. */
export const tachPosition = (rpm: number): number => Math.round(clamp(rpm / TACH_MAX_RPM, 0, 1) * 1000) / 1000;

/**
 * The tachometer: a track with a tick every 1,000 rpm, numerals at 0, 5, 10 and 15 thousand, the
 * last 1,000 rpm hatched, a steel fill and an ink needle. Every length is a share of its width, so
 * ticks and numerals scale with the cluster.
 */
function tachometer(): HTMLElement {
  const ticks = el('div', 'tach-ticks');
  for (let k = 0; k <= TACH_MAX_RPM / TACH_TICK_RPM; k++) {
    const t = el('span', TACH_NUMERALS.includes(k) ? 'tach-tick tach-tick-major' : 'tach-tick');
    t.style.left = `${(k * TACH_TICK_RPM * 100) / TACH_MAX_RPM}%`;
    ticks.append(t);
  }
  const numerals = el('div', 'tach-numerals mono');
  for (const n of TACH_NUMERALS) {
    const t = el('span', 'tach-numeral', {}, String(n));
    t.style.left = `${(n * 1000 * 100) / TACH_MAX_RPM}%`;
    numerals.append(t);
  }
  const tach = el('div', 'tach', { 'aria-hidden': 'true' },
    el('div', 'tach-track', {}, el('div', 'tach-fill'), el('div', 'tach-band')),
    el('div', 'tach-needle-run', {}, el('div', 'tach-needle')),
    ticks, numerals, el('span', 'tach-unit', {}, '×1,000 rpm'));
  tach.style.setProperty('--band', String(TACH_BAND_RPM / TACH_MAX_RPM));
  return tach;
}

/**
 * The instrument cluster on the stage: the gear as a large numeral, engine rpm, road speed and the
 * tachometer. `sync` moves the needle every call and writes text only when a value has changed;
 * the caller decides how often a new Reading is made.
 */
export function mountCluster(host: HTMLElement): { sync(r: Reading, state: SimState): void } {
  const gear = el('span', 'cl-gear-value', { 'data-count': '' }, 'N');
  const rpmText = el('span', 'cl-rpm-value', { 'data-count': '' }, '00000');
  const speed = el('span', 'cl-speed-value', { 'data-count': '' }, '000');
  const tach = tachometer();
  host.replaceChildren(
    el('div', 'cl-gear', {}, el('span', 'cl-label', {}, 'Gear'), gear),
    el('div', 'cl-figures', {},
      el('div', 'cl-line', {}, srOnly('Engine speed '), rpmText, el('span', 'cl-unit', {}, 'rpm')),
      el('div', 'cl-line', {}, srOnly('Road speed '), speed, el('span', 'cl-unit', {}, 'km/h'))),
    tach,
  );
  let shown = Number.NaN;

  return {
    sync(r, state) {
      // the needle stops at the end of the scale; the number beside it stays true
      const q = tachPosition(toRpm(state.engine.omega));
      if (q !== shown) { shown = q; tach.style.setProperty('--v', String(q)); }
      setText(gear, r.gear);
      setText(rpmText, r.rpm);
      setText(speed, r.speedKmh);
    },
  };
}

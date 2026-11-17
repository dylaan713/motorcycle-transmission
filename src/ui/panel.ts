import { KEYMAP } from '../app/controls';
import { selection } from '../app/selection';
import { PARTS, type GearNo, type PartId } from '../model/parts';
import { clutchCapacityMax } from '../sim/clutch';
import { finalRatio, gearRatio, overallRatio, primaryRatio, roadSpeed } from '../sim/kinematics';
import { PARAMS } from '../sim/params';
import { rpm } from '../sim/units';
import { el, setText, srOnly } from './dom';
import type { Reading } from './readouts';

const GEARS: readonly GearNo[] = [1, 2, 3, 4, 5, 6];
const ORDINAL: Record<GearNo, string> = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 5: '5th', 6: '6th' };
const thousands = (n: number): string => n.toLocaleString('en-US');

/** Road speed for an engine speed in gear g, km/h. */
const kmhAt = (g: GearNo, engineRpm: number): number =>
  roadSpeed((rpm(engineRpm) * finalRatio) / overallRatio(g)) * 3.6;

// ---- Overview ----------------------------------------------------------------------------------

const ACTIONS: Record<(typeof KEYMAP)[string], string> = {
  throttle: 'Throttle', brake: 'Brake', clutchLever: 'Pull the clutch', pedalUp: 'Shift up',
  pedalDown: 'Shift down', starter: 'Starter', ignition: 'Ignition on or off', reset: 'Reset',
};
const KEY_NAMES: Record<string, { glyph: string; name: string }> = {
  ArrowUp: { glyph: '↑', name: 'Arrow Up' },
  ArrowDown: { glyph: '↓', name: 'Arrow Down' },
  Enter: { glyph: 'Enter', name: 'Enter' },
};
const keyName = (code: string): { glyph: string; name: string } =>
  KEY_NAMES[code] ?? { glyph: code.replace(/^Key/, ''), name: code.replace(/^Key/, '') };

function overview(): HTMLElement {
  const keys = el('dl', 'keys');
  for (const [code, action] of Object.entries(KEYMAP)) {
    const k = keyName(code);
    keys.append(el('div', 'keys-row', {},
      el('dt', '', {}, el('kbd', 'key', {}, el('span', '', { 'aria-hidden': 'true' }, k.glyph), srOnly(k.name))),
      el('dd', '', {}, ACTIONS[action])));
  }
  return el('div', 'prose', {},
    el('p', '', {}, 'A live simulation of a motorcycle clutch and six-speed sequential gearbox. ',
      'The orange line is the torque path: every part it runs through is carrying torque between the crankshaft and the rear wheel at this moment. ',
      'The numbers are representative of a middleweight sport bike.'),
    el('h3', '', {}, 'How to read it'),
    el('p', '', {}, 'The clutch turns the input shaft, and the output shaft below it turns the front sprocket. ',
      'All six gear pairs are always in mesh, but one gear of each pair spins free on its shaft. ',
      'A sliding gear locks a free gear to its shaft with the dogs on its face, and that pair carries the drive. ',
      'The shift drum, drawn unrolled, sets where each fork slides its gear; each detent is one gear, with neutral between first and second.'),
    el('h3', '', {}, 'How to ride it'),
    el('p', '', {}, 'The demo rider hands over as soon as you touch a control. ',
      'From a standstill, pull the clutch, shift down into first, then let the clutch out as you open the throttle.'),
    keys);
}

// ---- Ratios ------------------------------------------------------------------------------------

function ratios(): { root: HTMLElement; rows: Map<string, HTMLElement> } {
  const rows = new Map<string, HTMLElement>();
  const th = (text: string, cls = ''): HTMLElement => el('th', cls, { scope: 'col' }, text);
  const body = el('tbody', '');
  for (const g of GEARS) {
    const [i, o] = PARAMS.gears[g];
    const row = el('tr', '', {},
      el('th', '', { scope: 'row' }, ORDINAL[g]),
      el('td', '', {}, `${i}:${o}`),
      el('td', '', {}, gearRatio(g).toFixed(3)),
      el('td', '', {}, overallRatio(g).toFixed(2)),
      el('td', '', {}, kmhAt(g, 1000).toFixed(1)),
      el('td', '', {}, String(Math.round(kmhAt(g, PARAMS.engine.limiterRpm)))));
    rows.set(String(g), row);
    body.append(row);
  }
  const table = el('table', 'data-table', {},
    el('caption', 'sr-only', {}, 'Gear ratios and road speeds'),
    el('thead', '', {}, el('tr', '', {},
      th('Gear'), th('Teeth'), th('Ratio'), th('Overall'), th('km/h per 1,000 rpm'), th('Top km/h'))),
    body);
  const root = el('div', 'prose', {},
    el('div', 'table-wrap', {}, table),
    el('p', 'note', {},
      `Teeth are input : output. Ratio is input shaft turns per output shaft turn; overall multiplies in the primary drive (${PARAMS.primary.driven}:${PARAMS.primary.drive}) and the chain (${PARAMS.final.rear}:${PARAMS.final.front}), so it is crankshaft turns per rear wheel turn. Top speed is the road speed at the ${thousands(PARAMS.engine.limiterRpm)} rpm limiter; in sixth, air drag holds the bike below it.`));
  return { root, rows };
}

// ---- Live data ---------------------------------------------------------------------------------

const LIVE: ReadonlyArray<[keyof Reading, string, string]> = [
  ['gear', 'Gear', ''],
  ['rpm', 'Engine speed', 'rpm'],
  ['speedKmh', 'Road speed', 'km/h'],
  ['inputRpm', 'Input shaft', 'rpm'],
  ['outputRpm', 'Output shaft', 'rpm'],
  ['ratio', 'Overall ratio', ''],
  ['slipRpm', 'Clutch slip', 'rpm'],
  ['torqueNm', 'Clutch torque', 'N·m'],
  ['clutch', 'Clutch', ''],
  ['engine', 'Engine', ''],
];

function liveData(): { root: HTMLElement; values: Map<keyof Reading, HTMLElement> } {
  const values = new Map<keyof Reading, HTMLElement>();
  const list = el('dl', 'spec');
  for (const [key, label, unit] of LIVE) {
    const v = el('span', 'spec-value', { 'data-count': '' }, '');
    values.set(key, v);
    list.append(el('div', 'spec-row', {}, el('dt', '', {}, label),
      el('dd', '', {}, v, unit ? el('span', 'spec-unit', {}, unit) : '')));
  }
  return { root: el('div', 'prose', {}, list), values };
}

// ---- Specs -------------------------------------------------------------------------------------

function specifications(): HTMLElement {
  const peak = PARAMS.engine.torqueCurve.reduce((a, b) => (b[1] > a[1] ? b : a));
  const rows: Array<[string, string]> = [
    ['Primary drive', `${PARAMS.primary.driven}:${PARAMS.primary.drive} teeth, ${primaryRatio.toFixed(3)}`],
    ['Final drive', `${PARAMS.final.rear}:${PARAMS.final.front} teeth, ${finalRatio.toFixed(3)}`],
    ['Rear wheel radius', `${Math.round(PARAMS.wheelRadius * 1000)} mm`],
    ['Mass, bike and rider', `${PARAMS.mass} kg`],
    ['Clutch', `${PARAMS.clutch.surfaces / 2} friction plates, ${PARAMS.clutch.surfaces} faces`],
    ['Clutch capacity', `${Math.round(clutchCapacityMax)} N·m`],
    ['Peak engine torque', `${peak[1]} N·m at ${thousands(peak[0])} rpm`],
    ['Idle and limiter', `${thousands(PARAMS.engine.idleRpm)} and ${thousands(PARAMS.engine.limiterRpm)} rpm`],
  ];
  const list = el('dl', 'spec');
  for (const [k, v] of rows) list.append(el('div', 'spec-row', {}, el('dt', '', {}, k), el('dd', '', {}, el('span', 'spec-value', {}, v))));
  return el('div', 'prose', {}, list,
    el('p', 'note', {}, 'Representative of a middleweight sport bike, not any particular model.'));
}

// ---- Parts -------------------------------------------------------------------------------------

const GROUPS: ReadonlyArray<[string, (id: PartId) => boolean]> = [
  ['Clutch', (id) => ['crank', 'primaryDrive', 'clutchBasket', 'frictionPlates', 'steelPlates', 'clutchHub', 'pressurePlate'].includes(id)],
  ['Shafts and gears', (id) => id === 'inputShaft' || id === 'outputShaft' || id.startsWith('gear')],
  ['Shift mechanism', (id) => id.startsWith('fork') || ['shiftDrum', 'starWheel', 'detentArm', 'shiftShaft', 'pedal'].includes(id)],
  ['Final drive', (id) => ['sprocket', 'chain', 'rearSprocket', 'rearWheel'].includes(id)],
];

function partsList(): { root: HTMLElement; buttons: Map<PartId, HTMLButtonElement> } {
  const buttons = new Map<PartId, HTMLButtonElement>();
  const root = el('div', 'prose');
  root.append(el('p', 'note', {}, 'Pick a part to highlight it in the drawing and read what it does.'));
  for (const [title, member] of GROUPS) {
    const list = el('ul', 'part-list');
    for (const p of Object.values(PARTS)) {
      if (!member(p.id)) continue;
      const b = el('button', 'part-btn', { type: 'button', 'data-press': '', 'aria-pressed': 'false' }, p.name);
      b.addEventListener('click', () => selection.set(selection.get() === p.id ? null : p.id));
      buttons.set(p.id, b);
      list.append(el('li', '', {}, b));
    }
    root.append(el('h3', '', {}, title), list);
  }
  return { root, buttons };
}

// ---- Tabs --------------------------------------------------------------------------------------

export interface TabKey { key: string; altKey: boolean; ctrlKey: boolean; metaKey: boolean }

/**
 * The tab a key moves to in a row of `count` tabs with `current` selected: Left and Right wrap,
 * Home and End jump to the ends. Null for any other key, and whenever a browser modifier is held,
 * so shortcuts such as Alt+Left still reach the browser.
 */
export function tabKeyTarget(e: TabKey, count: number, current: number): number | null {
  if (e.altKey || e.ctrlKey || e.metaKey) return null;
  switch (e.key) {
    case 'ArrowRight': return (current + 1) % count;
    case 'ArrowLeft': return (current - 1 + count) % count;
    case 'Home': return 0;
    case 'End': return count - 1;
    default: return null;
  }
}

/**
 * The information panel: a card for the selected part above five tabs (Overview, Ratios, Live
 * data, Specs, Parts) in the ARIA tabs pattern, with roving tabindex and automatic
 * activation. The part card follows the shared selection; `syncLive` updates the live figures
 * and marks the current gear in the ratio table, writing only what changed.
 */
export function mountPanel(host: HTMLElement): { showPart(id: PartId | null): void; syncLive(r: Reading): void } {
  const ratioTab = ratios();
  const live = liveData();
  const parts = partsList();
  const sections: Array<[string, string, HTMLElement]> = [
    ['overview', 'Overview', overview()],
    ['ratios', 'Ratios', ratioTab.root],
    ['live', 'Live data', live.root],
    ['specs', 'Specs', specifications()],
    ['parts', 'Parts', parts.root],
  ];

  const tablist = el('div', 'tabs', { role: 'tablist', 'aria-label': 'Information' });
  const tabs: HTMLButtonElement[] = [];
  const panels: HTMLElement[] = [];
  for (const [key, label, content] of sections) {
    const tab = el('button', 'tab', {
      type: 'button', role: 'tab', id: `tab-${key}`, 'aria-controls': `tabpanel-${key}`,
      'aria-selected': 'false', tabindex: '-1',
    }, label);
    const panel = el('div', 'tabpanel', {
      role: 'tabpanel', id: `tabpanel-${key}`, 'aria-labelledby': `tab-${key}`, tabindex: '0',
    }, content);
    panel.hidden = true;
    tabs.push(tab); panels.push(panel);
    tablist.append(tab);
  }

  let current = -1;
  const select = (i: number, focus: boolean): void => {
    if (i !== current) {
      if (current >= 0) {
        tabs[current].setAttribute('aria-selected', 'false');
        tabs[current].tabIndex = -1;
        panels[current].hidden = true;
      }
      current = i;
      tabs[i].setAttribute('aria-selected', 'true');
      tabs[i].tabIndex = 0;
      panels[i].hidden = false;
    }
    if (focus) tabs[i].focus();
  };
  tabs.forEach((tab, i) => tab.addEventListener('click', () => select(i, false)));
  tablist.addEventListener('keydown', (e) => {
    const to = tabKeyTarget(e, tabs.length, current);
    if (to === null) return;
    e.preventDefault();
    select(to, true);
  });
  select(0, false);

  // the selected part's card
  const cardName = el('h2', 'card-name', { id: 'part-card-name' }, '');
  const cardRole = el('p', 'card-role', {}, '');
  const close = el('button', 'card-close', { type: 'button', 'data-press': '', 'aria-label': 'Close part details' },
    el('span', '', { 'aria-hidden': 'true' }, '×'));
  const card = el('section', 'card', { 'aria-labelledby': 'part-card-name' },
    el('div', 'card-head', {}, el('span', 'card-kicker', {}, 'Selected part'), close), cardName, cardRole);
  card.hidden = true;
  close.addEventListener('click', () => {
    selection.set(null);
    tabs[current].focus();
  });

  host.replaceChildren(card, tablist, ...panels);

  let pressed: HTMLButtonElement | null = null;
  const showPart = (id: PartId | null): void => {
    if (pressed) pressed.setAttribute('aria-pressed', 'false');
    pressed = id === null ? null : parts.buttons.get(id) ?? null;
    if (pressed) pressed.setAttribute('aria-pressed', 'true');
    if (id === null) { card.hidden = true; return; }
    setText(cardName, PARTS[id].name);
    setText(cardRole, PARTS[id].role);
    card.hidden = false;
  };
  selection.subscribe(showPart);
  showPart(selection.get());

  let currentRow: HTMLElement | null = null;
  return {
    showPart,
    syncLive(r) {
      for (const [key] of LIVE) setText(live.values.get(key)!, r[key]);
      const row = ratioTab.rows.get(r.gear) ?? null;
      if (row !== currentRow) {
        currentRow?.removeAttribute('aria-current');
        row?.setAttribute('aria-current', 'true');
        currentRow = row;
      }
    },
  };
}

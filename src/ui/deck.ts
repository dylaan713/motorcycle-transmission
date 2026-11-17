import type { Controls } from '../app/controls';
import type { DriverMode } from '../app/driver';
import type { Inputs, SimState } from '../sim/types';
import { clamp } from '../sim/units';
import { el, srOnly } from './dom';

type Analog = 'throttle' | 'clutchLever' | 'pedal';
type Hooks = { onTouch(): void; onReset(): void };

const KEYBOARD_PULSE_MS = 150; // a button activated by Space holds its channel this long
const STARTER_PULSE_MS = 800; // cranking needs longer than a tap

const kbd = (hint: string): HTMLElement => el('kbd', 'deck-key', { 'aria-hidden': 'true' }, hint);

/** A visible caption under a widget: its name and key hint. */
const caption = (name: string, hint: string): HTMLElement =>
  el('div', 'deck-caption', { 'aria-hidden': 'true' }, el('span', 'deck-name', {}, name), kbd(hint));

/** A deck button with a name and a key hint stacked inside. */
function button(cls: string, name: string, hint: string, shortcut: string, label = name): HTMLButtonElement {
  return el('button', `deck-btn ${cls}`, {
    type: 'button', 'data-press': '', 'aria-label': label, 'aria-keyshortcuts': shortcut,
  }, el('span', 'deck-name', { 'aria-hidden': 'true' }, name), kbd(hint));
}

/** A held button: down on press, up on release; Space or Enter activation gives a timed pulse. */
function holdable(b: HTMLElement, down: () => void, up: () => void, pulseMs: number): void {
  let pressed = false;
  let pulse = 0; // pending timed release from a keyboard activation
  const cancelPulse = (): void => { window.clearTimeout(pulse); pulse = 0; };
  const release = (): void => { if (pressed) { pressed = false; up(); } };
  b.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    cancelPulse(); // an earlier pulse must not cut this press short
    b.setPointerCapture(e.pointerId);
    pressed = true;
    down();
  });
  b.addEventListener('pointerup', release);
  b.addEventListener('pointercancel', release);
  b.addEventListener('lostpointercapture', release);
  b.addEventListener('click', (e) => {
    if (e.detail !== 0) return; // a pointer click was already handled by pointerdown/up
    cancelPulse();
    down();
    pulse = window.setTimeout(() => { pulse = 0; if (!pressed) up(); }, pulseMs);
  });
}

interface Slider {
  root: HTMLElement;
  dragging: boolean;
  shown: number;
  pct: number | null; // the ARIA value last written
}

const ARROWS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

/**
 * A custom slider: pointer capture on drag, the value sent to `controls.setPointer`, released on
 * pointer up so the control ramps back to rest. `compute` maps the pointer to a value given
 * where the drag started. While focused, its arrow keys drive its own channel through the held
 * key path (`arrowKeys` maps an arrow to a KEYMAP code) and never reach the page-wide keymap;
 * an arrow with no mapping does nothing.
 */
function slider(
  root: HTMLElement, channel: Analog, controls: Controls, onTouch: () => void,
  arrowKeys: Record<string, string>,
  compute: (e: PointerEvent, start: { x: number; y: number; v: number; rect: DOMRect }) => number,
): Slider {
  const s: Slider = { root, dragging: false, shown: Number.NaN, pct: null };
  const pressed = new Set<string>(); // KEYMAP codes this slider is holding down
  const mods = (e: KeyboardEvent): boolean => e.metaKey || e.ctrlKey || e.altKey;
  root.addEventListener('keydown', (e) => {
    if (!ARROWS.has(e.code) || mods(e)) return;
    e.preventDefault();
    e.stopPropagation();
    const code = arrowKeys[e.code];
    if (e.repeat || code === undefined) return;
    onTouch();
    pressed.add(code);
    controls.setKey(code, true);
  });
  root.addEventListener('keyup', (e) => {
    if (!ARROWS.has(e.code)) return;
    e.stopPropagation();
    const code = arrowKeys[e.code];
    if (code === undefined || !pressed.delete(code)) return;
    controls.setKey(code, false);
  });
  root.addEventListener('blur', () => {
    for (const code of pressed) controls.setKey(code, false);
    pressed.clear();
  });
  let start = { x: 0, y: 0, v: 0, rect: new DOMRect() };
  root.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    root.setPointerCapture(e.pointerId);
    start = { x: e.clientX, y: e.clientY, v: controls.inputs()[channel], rect: root.getBoundingClientRect() };
    s.dragging = true;
    root.dataset.active = '';
    controls.setPointer(channel, compute(e, start));
  });
  root.addEventListener('pointermove', (e) => {
    if (s.dragging) controls.setPointer(channel, compute(e, start));
  });
  const release = (): void => {
    if (!s.dragging) return;
    s.dragging = false;
    delete root.dataset.active;
    controls.setPointer(channel, null);
  };
  root.addEventListener('pointerup', release);
  root.addEventListener('pointercancel', release);
  root.addEventListener('lostpointercapture', release);
  return s;
}

/** Writes a slider's position and ARIA value, only when it has visibly changed. */
function show(s: Slider, v: number, text: (pct: number) => string): void {
  if (Math.abs(v - s.shown) < 0.002) return;
  s.shown = v;
  s.root.style.setProperty('--v', v.toFixed(3));
  const pct = Math.round(v * 100);
  if (pct !== s.pct) {
    s.pct = pct;
    s.root.setAttribute('aria-valuenow', String(pct));
    s.root.setAttribute('aria-valuetext', text(pct));
  }
}

// no data-press: a drag surface must not scale under the pointer; its own movement is the feedback
// these sliders spring back when let go and answer only the arrows that move them, so they say so
const sliderAttrs = (label: string, shortcut: string, min: number, orientation: string, hintId: string): Record<string, string> => ({
  role: 'slider', tabindex: '0', 'aria-label': label, 'aria-keyshortcuts': shortcut,
  'aria-valuemin': String(min), 'aria-valuemax': '100', 'aria-orientation': orientation,
  'aria-roledescription': 'spring-return slider', 'aria-describedby': hintId,
});
const HINTS: Record<string, string> = {
  'hint-throttle': 'Springs back to closed when let go. Hold the up or right arrow to open it.',
  'hint-clutch': 'Springs back to released when let go. Hold the right or up arrow to pull it.',
  'hint-pedal': 'Springs back to rest when let go. Up arrow shifts up, down arrow shifts down.',
};

const clamp01 = (v: number): number => clamp(v, 0, 1);
const toggle = (e: HTMLElement, name: string, on: boolean): void => {
  if ((name in e.dataset) !== on) { if (on) e.dataset[name] = ''; else delete e.dataset[name]; }
};

/**
 * Builds the control deck: throttle, clutch lever, shift pedal with tap buttons, brake, reset,
 * ignition and starter. Every interaction calls hooks.onTouch first. `sync` moves the widgets to
 * the inputs the simulation last used, so the visitor sees what the autopilot is doing.
 */
export function mountDeck(
  host: HTMLElement, controls: Controls, hooks: Hooks,
): { sync(state: SimState, inputs: Inputs): void; setMode(mode: DriverMode): void } {
  // throttle: a vertical track with a grip; the grip's position is absolute in the track
  const throttleEl = el('div', 'deck-throttle', sliderAttrs('Throttle', 'ArrowUp', 0, 'vertical', 'hint-throttle'),
    el('div', 'deck-throttle-fill'), el('div', 'deck-throttle-grip'));
  const throttle = slider(throttleEl, 'throttle', controls, () => hooks.onTouch(),
    { ArrowUp: 'ArrowUp', ArrowRight: 'ArrowUp' },
    (e, s) => clamp01((s.rect.bottom - e.clientY) / s.rect.height));

  // clutch: a lever swinging about its perch toward a fixed grip; drag right or up to pull
  const clutchEl = el('div', 'deck-clutch', sliderAttrs('Clutch lever', 'C', 0, 'horizontal', 'hint-clutch'),
    el('div', 'deck-clutch-bar'),
    el('div', 'deck-clutch-lever', {}, el('div', 'deck-pivot')));
  const clutch = slider(clutchEl, 'clutchLever', controls, () => hooks.onTouch(),
    { ArrowRight: 'KeyC', ArrowUp: 'KeyC' },
    (e, s) => clamp01(s.v + ((e.clientX - s.x) - (e.clientY - s.y)) / (s.rect.width * 0.75)));

  // shift pedal: rocks about a pivot; drag up from centre for up, down for down
  const pedalEl = el('div', 'deck-pedal', sliderAttrs('Shift pedal', 'W S', -100, 'vertical', 'hint-pedal'),
    el('div', 'deck-pedal-arm', {}, el('div', 'deck-pivot')));
  const pedal = slider(pedalEl, 'pedal', controls, () => hooks.onTouch(),
    { ArrowUp: 'KeyW', ArrowDown: 'KeyS' },
    (e, s) => clamp(s.v - (e.clientY - s.y) / (s.rect.height / 2), -1, 1));

  const up = button('deck-tap', 'Up', 'W', 'W', 'Shift up');
  const down = button('deck-tap', 'Down', 'S', 'S', 'Shift down');
  holdable(up, () => controls.setKey('KeyW', true), () => controls.setKey('KeyW', false), KEYBOARD_PULSE_MS);
  holdable(down, () => controls.setKey('KeyS', true), () => controls.setKey('KeyS', false), KEYBOARD_PULSE_MS);

  const brake = button('deck-brake', 'Brake', '↓', 'ArrowDown');
  holdable(brake, () => controls.setPointer('brake', 1), () => controls.setPointer('brake', null), KEYBOARD_PULSE_MS * 2);
  const reset = button('deck-reset', 'Reset', 'R', 'R');
  reset.addEventListener('click', () => hooks.onReset());

  const ignition = button('deck-ignition', 'Ignition', 'I', 'I');
  ignition.setAttribute('aria-pressed', 'true');
  ignition.addEventListener('click', () => controls.toggleIgnition());
  const starter = button('deck-starter', 'Start', '⏎', 'Enter', 'Starter');
  holdable(starter, () => controls.setStarter(true), () => controls.setStarter(false), STARTER_PULSE_MS);

  const cell = (cls: string, ...children: HTMLElement[]): HTMLElement => el('div', `deck-cell ${cls}`, {}, ...children);
  // while the demo rides, an invitation at the deck's right end says how to take over
  const invite = el('p', 'deck-invite', {}, 'The demo rider is riding. Touch any control to take over.');
  // every button is one row high, in two rows; on phones the clutch goes far left and the throttle far right
  const root = el('div', 'deck', {},
    cell('deck-cell-throttle', throttleEl, caption('Throttle', '↑')),
    cell('deck-cell-clutch', clutchEl, caption('Clutch', 'C')),
    el('div', 'deck-shift', { role: 'group', 'aria-label': 'Gear shift' },
      cell('deck-cell-pedal', pedalEl, caption('Shift', 'W/S')),
      el('div', 'deck-stack', {}, up, down)),
    el('div', 'deck-stack deck-stack-brake', {}, brake, reset),
    el('div', 'deck-stack deck-stack-engine', {}, ignition, starter),
    invite);

  // any interaction hands control to the visitor; capture runs it before the widget's own handler
  root.addEventListener('pointerdown', () => hooks.onTouch(), true);
  root.addEventListener('click', () => hooks.onTouch(), true);
  root.addEventListener('contextmenu', (e) => e.preventDefault()); // long-press on touch screens
  const hints = Object.entries(HINTS).map(([id, text]) => Object.assign(srOnly(text), { id }));
  host.replaceChildren(root, ...hints);

  const sliders: Array<[Slider, Analog, (pct: number) => string]> = [
    [throttle, 'throttle', (p) => `${p} percent open`],
    [clutch, 'clutchLever', (p) => (p === 0 ? 'released' : `${p} percent pulled`)],
    [pedal, 'pedal', (p) => (p === 0 ? 'at rest' : p > 0 ? `${p} percent up` : `${-p} percent down`)],
  ];

  for (const [s, , text] of sliders) show(s, 0, text); // initial ARIA value and text

  return {
    sync(state, inputs) {
      // while the visitor drags a widget, it follows the pointer even when the simulation is paused
      const own = controls.inputs();
      for (const [s, ch, text] of sliders) show(s, s.dragging ? own[ch] : inputs[ch], text);
      toggle(up, 'active', inputs.pedal > 0.05);
      toggle(down, 'active', inputs.pedal < -0.05);
      toggle(brake, 'active', inputs.brake > 0.05);
      toggle(starter, 'active', inputs.starter);
      const on = String(inputs.ignition);
      if (ignition.getAttribute('aria-pressed') !== on) ignition.setAttribute('aria-pressed', on);
      toggle(root, 'running', state.engine.running);
    },
    setMode(mode) { toggle(root, 'demo', mode === 'demo'); },
  };
}

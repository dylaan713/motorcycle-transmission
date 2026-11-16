import type { Controls } from '../app/controls';
import type { Inputs, SimState } from '../sim/types';

type Analog = 'throttle' | 'clutchLever' | 'pedal';
type Hooks = { onTouch(): void; onReset(): void };

const KEYBOARD_PULSE_MS = 150; // a button activated by Space holds its channel this long
const STARTER_PULSE_MS = 800; // cranking needs longer than a tap

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, cls: string, attrs: Record<string, string> = {}, ...children: Array<Node | string>
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  e.append(...children);
  return e;
}

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
  const release = (): void => { if (pressed) { pressed = false; up(); } };
  b.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    b.setPointerCapture(e.pointerId);
    pressed = true;
    down();
  });
  b.addEventListener('pointerup', release);
  b.addEventListener('pointercancel', release);
  b.addEventListener('lostpointercapture', release);
  b.addEventListener('click', (e) => {
    if (e.detail !== 0) return; // a pointer click was already handled by pointerdown/up
    down();
    window.setTimeout(up, pulseMs);
  });
}

interface Slider {
  root: HTMLElement;
  dragging: boolean;
  shown: number;
}

/**
 * A custom slider: pointer capture on drag, the value sent to `controls.setPointer`, released on
 * pointer up so the control ramps back to rest. `compute` maps the pointer to a value given
 * where the drag started.
 */
function slider(
  root: HTMLElement, channel: Analog, controls: Controls,
  compute: (e: PointerEvent, start: { x: number; y: number; v: number; rect: DOMRect }) => number,
): Slider {
  const s: Slider = { root, dragging: false, shown: Number.NaN };
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
  if (s.root.getAttribute('aria-valuenow') !== String(pct)) {
    s.root.setAttribute('aria-valuenow', String(pct));
    s.root.setAttribute('aria-valuetext', text(pct));
  }
}

const sliderAttrs = (label: string, shortcut: string, min: number, orientation: string): Record<string, string> => ({
  role: 'slider', tabindex: '0', 'data-press': '', 'aria-label': label, 'aria-keyshortcuts': shortcut,
  'aria-valuemin': String(min), 'aria-valuemax': '100', 'aria-valuenow': '0', 'aria-orientation': orientation,
});

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
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
): { sync(state: SimState, inputs: Inputs): void } {
  // throttle: a vertical track with a grip; the grip's position is absolute in the track
  const throttleEl = el('div', 'deck-throttle', sliderAttrs('Throttle', 'ArrowUp', 0, 'vertical'),
    el('div', 'deck-throttle-fill'), el('div', 'deck-throttle-grip'));
  const throttle = slider(throttleEl, 'throttle', controls,
    (e, s) => clamp01((s.rect.bottom - e.clientY) / s.rect.height));

  // clutch: a lever swinging about its perch toward a fixed grip; drag right or up to pull
  const clutchEl = el('div', 'deck-clutch', sliderAttrs('Clutch lever', 'C Shift', 0, 'horizontal'),
    el('div', 'deck-clutch-bar'),
    el('div', 'deck-clutch-lever', {}, el('div', 'deck-pivot')));
  const clutch = slider(clutchEl, 'clutchLever', controls,
    (e, s) => clamp01(s.v + ((e.clientX - s.x) - (e.clientY - s.y)) / (s.rect.width * 0.75)));

  // shift pedal: rocks about a pivot; drag up from centre for up, down for down
  const pedalEl = el('div', 'deck-pedal', sliderAttrs('Shift pedal', 'W S', -100, 'vertical'),
    el('div', 'deck-pedal-arm', {}, el('div', 'deck-pivot')));
  const pedal = slider(pedalEl, 'pedal', controls,
    (e, s) => Math.min(1, Math.max(-1, s.v - (e.clientY - s.y) / (s.rect.height / 2))));

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
  const root = el('div', 'deck', {},
    cell('deck-cell-throttle', throttleEl, caption('Throttle', '↑')),
    cell('deck-cell-clutch', clutchEl, caption('Clutch', 'C')),
    el('div', 'deck-shift', { role: 'group', 'aria-label': 'Gear shift' },
      cell('deck-cell-pedal', pedalEl, caption('Shift', 'W/S')),
      el('div', 'deck-stack', {}, up, down)),
    el('div', 'deck-stack', {}, brake, reset),
    el('div', 'deck-stack', {}, ignition, starter));

  // any interaction hands control to the visitor; capture runs it before the widget's own handler
  root.addEventListener('pointerdown', () => hooks.onTouch(), true);
  root.addEventListener('click', () => hooks.onTouch(), true);
  root.addEventListener('contextmenu', (e) => e.preventDefault()); // long-press on touch screens
  host.replaceChildren(root);

  const sliders: Array<[Slider, Analog, (pct: number) => string]> = [
    [throttle, 'throttle', (p) => `${p} percent open`],
    [clutch, 'clutchLever', (p) => (p === 0 ? 'released' : `${p} percent pulled`)],
    [pedal, 'pedal', (p) => (p === 0 ? 'at rest' : p > 0 ? `${p} percent up` : `${-p} percent down`)],
  ];

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
  };
}

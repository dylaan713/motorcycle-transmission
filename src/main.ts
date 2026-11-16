import '@fontsource-variable/archivo/wdth.css';
import '@fontsource-variable/jetbrains-mono/index.css';
import './ui/styles.css';
import { applyTokens } from './ui/tokens';
import { createControls, KEYMAP } from './app/controls';
import { createDriver } from './app/driver';
import { describeTarget, shouldHandleKey } from './app/keys';
import { createLoop, startAnimation } from './app/loop';
import { mountDeck } from './ui/deck';
import { createSimulation } from './sim/simulation';
import { torquePath } from './model/torquePath';
import { selection } from './app/selection';
import { createSchematic } from './view2d/schematic';
import { formatReading, mountReadouts, type Reading } from './ui/readouts';
import { mountPanel } from './ui/panel';
import { mountModeChip, mountStatus } from './ui/status';

applyTokens(document.documentElement);

const sim = createSimulation();
const controls = createControls();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
// the autopilot starts after the arrival, or never by itself under reduced motion
const driver = createDriver(controls.source, { autoStart: false });
const ARRIVAL_MS = 900;
const TEXT_MS = 1000 / 15; // text readouts change at most 15 times a second

const deck = mountDeck(document.getElementById('deck')!, controls, {
  onTouch: () => driver.takeOver(),
  onReset: () => sim.reset(),
});
const stage = document.getElementById('stage')!;
const canvas = document.createElement('canvas');
canvas.className = 'stage-canvas';
canvas.setAttribute('role', 'img');
canvas.setAttribute('aria-label', 'Cutaway schematic of the clutch, gearbox and final drive, with the torque path in orange');
stage.append(canvas);
const view = createSchematic(canvas);
new ResizeObserver(([entry]) => {
  view.resize(entry.contentRect.width, entry.contentRect.height, window.devicePixelRatio || 1);
}).observe(canvas);

const readouts = mountReadouts(document.querySelector<HTMLElement>('.app-header')!, document.getElementById('live')!);
const panel = mountPanel(document.getElementById('panel')!);
const status = mountStatus(document.getElementById('status')!);
const chip = mountModeChip(document.getElementById('mode')!, driver);

let arrivalStart: number | null = reducedMotion ? null : performance.now();
if (arrivalStart !== null) view.setReveal?.(0);
else chip.ready();

let reading: Reading | null = null;
let lastText = -Infinity;
const loop = createLoop(sim, () => driver.source(), (state) => {
  const now = performance.now();
  if (arrivalStart !== null) {
    const p = (now - arrivalStart) / ARRIVAL_MS;
    view.setReveal?.(p);
    if (p >= 1) {
      arrivalStart = null;
      if (driver.mode === 'idle') driver.startDemo(); // unless the visitor already took over
      chip.ready();
    }
  }
  if (reading === null || now - lastText >= TEXT_MS) {
    lastText = now;
    reading = formatReading(state, loop.lastInputs);
    panel.syncLive(reading);
    status.sync(reading);
  }
  readouts.sync(reading, state);
  deck.sync(state, loop.lastInputs);
  view.render(state, torquePath(state));
});

// hover highlights a part, a click (not a drag) selects it
const DRAG_PX = 5;
let hovering = false;
let press: { x: number; y: number } | null = null;
const local = (e: PointerEvent) => {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
};
canvas.addEventListener('pointermove', (e) => {
  const { x, y } = local(e);
  const id = view.pick(x, y);
  hovering = id !== null;
  canvas.style.cursor = hovering ? 'pointer' : '';
  view.setHighlight(id ?? selection.get());
});
canvas.addEventListener('pointerleave', () => {
  hovering = false;
  canvas.style.cursor = '';
  view.setHighlight(selection.get());
});
canvas.addEventListener('pointerdown', (e) => { press = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointercancel', () => { press = null; });
canvas.addEventListener('pointerup', (e) => {
  if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) <= DRAG_PX) {
    const { x, y } = local(e);
    selection.set(view.pick(x, y));
  }
  press = null;
});
selection.subscribe((id) => { if (!hovering) view.setHighlight(id); });

// taking over starts from what the bike was doing, so each control ramps back from there
driver.onModeChange((mode) => { if (mode === 'visitor') controls.seed(loop.lastInputs); });

window.addEventListener('keydown', (e) => {
  if (!shouldHandleKey(e, describeTarget(e.target))) return;
  e.preventDefault(); // repeats too, so a held arrow never scrolls the page
  if (e.repeat) return;
  driver.takeOver();
  if (KEYMAP[e.code] === 'reset') sim.reset();
  controls.setKey(e.code, true);
});
window.addEventListener('keyup', (e) => { controls.setKey(e.code, false); });
window.addEventListener('blur', () => controls.releaseAll());

startAnimation(loop);

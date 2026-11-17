import '@fontsource-variable/archivo/wdth.css';
import '@fontsource-variable/jetbrains-mono/index.css';
import './ui/styles.css';
import { applyTokens } from './ui/tokens';
import { CAMERA_KEYS, createControls, KEYMAP } from './app/controls';
import { createDriver } from './app/driver';
import { describeTarget, shouldHandleCameraKey, shouldHandleKey } from './app/keys';
import { createLoop, startAnimation } from './app/loop';
import { holdForReducedMotion } from './app/motion';
import { mountDeck } from './ui/deck';
import { createSimulation } from './sim/simulation';
import { torquePath } from './model/torquePath';
import { selection } from './app/selection';
import { createSchematic } from './view2d/schematic';
import { formatReading, mountReadouts, type Reading } from './ui/readouts';
import { mountPanel } from './ui/panel';
import { mountModeChip, mountStatus } from './ui/status';
import { mountLoader } from './ui/loader';
import { el } from './ui/dom';
import { createStageHost } from './app/stageHost';
import { load3d, webglAvailable } from './view3d/load';
import type { View3d } from './view3d/view';
import { mountCallouts, type Callouts, type Rect } from './ui/callouts';
import { mountToolbar, ORBIT_STEP, ZOOM_STEP, type Toolbar } from './ui/toolbar';

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
// the stage holds two slots; each view draws into its own container, which the host moves between them
const stage = document.getElementById('stage')!;
const mainSlot = el('div', 'stage-main', { id: 'stage-main' });
const insetSlot = el('button', 'stage-inset', { id: 'stage-inset', type: 'button', 'aria-label': 'Swap views', hidden: '' });
stage.prepend(mainSlot, insetSlot);
const host = createStageHost(mainSlot, insetSlot);
const wide = matchMedia('(min-width: 900px)');
host.setInset(wide.matches); // phones get the whole stage for one view
// set once the 3D view has arrived
let view3d: View3d | null = null;
let toolbar: Toolbar | null = null;
let callouts: Callouts | null = null;
let labelsOn = wide.matches; // labels default on at 900px and wider
const syncChrome = (): void => {
  toolbar?.sync({ view: host.main ?? 'schematic', inset: host.inset !== null });
  callouts?.setVisible(labelsOn && host.main === '3d');
  callouts?.invalidate();
  stage.toggleAttribute('data-inset', host.inset !== null);
};
wide.addEventListener('change', () => {
  host.setInset(wide.matches);
  labelsOn = wide.matches;
  toolbar?.sync({ labels: labelsOn });
  syncChrome();
});
insetSlot.addEventListener('click', () => { host.swap(); syncChrome(); });

const schematicBox = el('div', 'view');
const canvas = el('canvas', 'view-canvas', {
  role: 'img', 'aria-label': 'Cutaway schematic of the clutch, gearbox and final drive, with the torque path in orange',
});
schematicBox.append(canvas);
const view = createSchematic(canvas);
host.register('schematic', view, schematicBox);

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
  host.render(state, torquePath(state));
  callouts?.sync();
  hold.frame();
});
// under reduced motion the idling engine is held still after the first frame until someone rides
const hold = holdForReducedMotion(loop, driver, reducedMotion);

// hover highlights a part, a click (not a drag) selects it
const DRAG_PX = 5;
let hovering = false;
let press: { x: number; y: number } | null = null;
const local = (e: PointerEvent) => {
  const r = mainSlot.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
};
mainSlot.addEventListener('pointermove', (e) => {
  if (e.buttons !== 0) return; // dragging the camera: no picking on the way
  const { x, y } = local(e);
  const id = host.pick(x, y);
  hovering = id !== null;
  mainSlot.style.cursor = hovering ? 'pointer' : '';
  host.setHighlight(id ?? selection.get());
});
mainSlot.addEventListener('pointerleave', () => {
  hovering = false;
  mainSlot.style.cursor = '';
  host.setHighlight(selection.get());
});
mainSlot.addEventListener('pointerdown', (e) => { press = { x: e.clientX, y: e.clientY }; });
mainSlot.addEventListener('pointercancel', () => { press = null; });
mainSlot.addEventListener('pointerup', (e) => {
  if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) <= DRAG_PX) {
    const { x, y } = local(e);
    selection.set(host.pick(x, y));
  }
  press = null;
});
selection.subscribe((id) => { if (!hovering) host.setHighlight(id); });

// the 3D view arrives after first paint; the schematic stays rideable underneath until it does
const UNAVAILABLE = '3D view unavailable on this device; showing the schematic.';
const fallBack = (why: unknown): void => {
  console.warn('3D view not loaded:', why);
  status.notice(UNAVAILABLE);
};
if (webglAvailable()) {
  const loader = mountLoader(stage);
  const box = el('div', 'view');
  load3d(box, loader.progress).then((v3) => {
    host.register('3d', v3, box);
    loader.done();
    arrive3d(v3);
  }, (err: unknown) => {
    box.remove();
    loader.remove();
    fallBack(err);
  });
} else {
  fallBack('WebGL 2 is not available');
}

/** The toolbar, the callouts and context loss, once the 3D view is on the stage. */
function arrive3d(v3: View3d): void {
  view3d = v3;
  const tools = el('div', 'stage-tools');
  const layer = el('div', 'callout-layer');
  stage.insertBefore(layer, insetSlot); // under the inset, over the main view
  stage.append(tools);
  stage.toggleAttribute('data-tools', true); // the main view makes room for it
  toolbar = mountToolbar(tools, {
    onView: (v) => { host.setMain(v); syncChrome(); },
    onInset: (on) => { host.setInset(on); syncChrome(); },
    onTorqueFlow: (on) => v3.setTorqueFlow(on),
    onLabels: (on) => { labelsOn = on; syncChrome(); },
    onResetCamera: () => v3.resetCamera(),
    onOrbit: (d) => v3.orbit(d, 0),
    onZoom: (f) => v3.zoom(f),
  }, { view: host.main ?? '3d', inset: host.inset !== null, labels: labelsOn });
  callouts = mountCallouts(layer, v3);
  // cards keep clear of the status line and loader along the top, the toolbar and the inset
  const TOP_BAND = 48;
  callouts.setAvoid(() => {
    const origin = layer.getBoundingClientRect();
    const rel = (r: DOMRect): Rect => ({ x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height });
    const out: Rect[] = [{ x: 0, y: 0, w: origin.width, h: TOP_BAND }, rel(tools.getBoundingClientRect())];
    if (!insetSlot.hidden) out.push(rel(insetSlot.getBoundingClientRect()));
    return out;
  });
  v3.onContext((lost) => {
    if (lost) { host.setMain('schematic'); status.notice('3D view paused; showing the schematic.'); }
    else { host.setMain('3d'); status.notice(''); }
    syncChrome();
  });
  syncChrome();
}

// taking over starts from what the bike was doing, so each control ramps back from there
driver.onModeChange((mode) => { if (mode === 'visitor') controls.seed(loop.lastInputs); });

const cameraKey = (e: KeyboardEvent): void => {
  if (view3d === null || host.main !== '3d') return;
  e.preventDefault();
  const action = CAMERA_KEYS[e.code];
  if (action === 'orbitLeft') view3d.orbit(ORBIT_STEP / 3, 0); // repeats while held
  else if (action === 'orbitRight') view3d.orbit(-ORBIT_STEP / 3, 0);
  else if (action === 'zoomIn') view3d.zoom(1 / Math.sqrt(ZOOM_STEP));
  else if (action === 'zoomOut') view3d.zoom(Math.sqrt(ZOOM_STEP));
  else if (!e.repeat) view3d.resetCamera();
};

window.addEventListener('keydown', (e) => {
  const target = describeTarget(e.target);
  if (shouldHandleCameraKey(e, target)) { cameraKey(e); return; } // the camera never takes over the ride
  if (!shouldHandleKey(e, target)) return;
  e.preventDefault(); // repeats too, so a held arrow never scrolls the page
  if (e.repeat) return;
  driver.takeOver();
  if (KEYMAP[e.code] === 'reset') sim.reset();
  controls.setKey(e.code, true);
});
window.addEventListener('keyup', (e) => { controls.setKey(e.code, false); });
window.addEventListener('blur', () => controls.releaseAll());

startAnimation(loop);

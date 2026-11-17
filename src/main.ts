import '@fontsource-variable/jetbrains-mono/index.css';
import './ui/styles.css'; // also declares the Archivo faces the page uses
import { applyTokens } from './ui/tokens';
import { CAMERA_KEYS, createControls, KEYMAP } from './app/controls';
import { createContextGuard } from './app/contextGuard';
import { createDriver } from './app/driver';
import { describeTarget, shouldHandleCameraKey, shouldHandleKey, trackFocusOrigin } from './app/keys';
import { createLoop, startAnimation } from './app/loop';
import { holdForReducedMotion } from './app/motion';
import { createStageHost, type ViewName } from './app/stageHost';
import { DRAG_PX, type View } from './app/view';
import { mountDeck } from './ui/deck';
import { createSimulation } from './sim/simulation';
import { shownPath, torquePath } from './model/torquePath';
import { createChoice } from './app/choices';
import { selection } from './app/selection';
import { createSchematic } from './view2d/schematic';
import { formatReading, mountCluster, type Reading } from './ui/readouts';
import { mountPanel, mountPartCard } from './ui/panel';
import { mountModeChip, mountStatus } from './ui/status';
import { mountLoader } from './ui/loader';
import { el } from './ui/dom';
import { load3d, webglAvailable } from './view3d/load';
import type { View3d } from './view3d/view';
import { mountCallouts, type Callouts, type Rect } from './ui/callouts';
import { mountToolbar, ORBIT_STEP, ZOOM_STEP, type Toolbar } from './ui/toolbar';
import { mountTouchHint, type TouchHint } from './ui/touchHint';

applyTokens(document.documentElement);

const sim = createSimulation();
const controls = createControls();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
// the autopilot starts after the arrival, or never by itself under reduced motion
const driver = createDriver(controls.source, { autoStart: false });
const ARRIVAL_MS = 900;
const TEXT_MS = 1000 / 15; // text readouts change at most 15 times a second

const statusEl = document.getElementById('status')!;
const status = mountStatus(statusEl);
const panelEl = document.getElementById('panel')!;
const panel = mountPanel(panelEl);
const chip = mountModeChip(document.getElementById('mode')!, driver);

// temporary until the drawer (Task 4): the panel opens over the right of the stage from a pill in the top bar
const panelToggle = el('button', 'panel-toggle', {
  type: 'button', 'aria-controls': 'panel', 'aria-expanded': 'false', 'data-press': '',
}, el('span', 'panel-toggle-icon', { 'aria-hidden': 'true' }), el('span', 'panel-toggle-text', {}, 'How it works'));
document.querySelector('.topbar')!.append(panelToggle);
let panelOpen = false;
panelEl.hidden = true;
const setPanelOpen = (open: boolean): void => {
  panelOpen = open;
  panelEl.hidden = !open;
  panelToggle.setAttribute('aria-expanded', String(open));
  if (open) panel.focusTab();
};
panelToggle.addEventListener('click', () => setPanelOpen(!panelOpen));
/** Reset leaves the bike at a standstill in neutral with the engine running, and the controls to match. */
const reset = (): void => { sim.reset(); controls.reset(); };
const deck = mountDeck(document.getElementById('deck')!, controls, {
  onTouch: () => driver.takeOver(),
  onReset: reset,
});

// the stage holds two slots; each view draws into its own container, which the host moves between them
const stage = document.getElementById('stage')!;
const mainSlot = el('div', 'stage-main', { id: 'stage-main' });
const insetSlot = el('button', 'stage-inset', { id: 'stage-inset', type: 'button', 'aria-label': 'Swap views', hidden: '' });
stage.prepend(mainSlot, insetSlot);
const host = createStageHost(mainSlot, insetSlot);

// the overlay layers; their stacking order is set once, in the :root block of styles.css
const tachLayer = el('div', 'layer-tach', { id: 'tach', 'aria-hidden': 'true' }); // the tachometer arc (Task 2)
const readingsLayer = el('div', 'layer-readings', { id: 'readings' }); // gear, speed and rpm (Task 2)
const clusterEl = el('div', 'cluster', { role: 'group', 'aria-label': 'Instruments' });
readingsLayer.append(clusterEl);
const cardEl = el('section', 'part-card', { id: 'part-card' });
insetSlot.after(tachLayer, readingsLayer, cardEl);
const cluster = mountCluster(clusterEl);

const wide = matchMedia('(min-width: 900px)');
const guard = createContextGuard(); // the 3D view's WebGL context: which view may be main
// the inset and the labels are on at 900px and wider until the visitor sets them; then their choice holds
const insetChoice = createChoice((isWide) => isWide); // phones get the whole stage for one view
const labelsChoice = createChoice((isWide) => isWide);
const applyInset = (): void => host.setInset(insetChoice.value(wide.matches) && !guard.lost); // never show a dead 3D canvas
applyInset();
// set once the 3D view has arrived
let view3d: View3d | null = null;
let toolbar: Toolbar | null = null;
let callouts: Callouts | null = null;
let leave3d: (() => void) | null = null;
let touchHint: TouchHint | null = null; // once the 3D view has arrived; it outlives a replaced view
/** Torque flow lights the path in both views; off, both draw the empty path. */
let torqueFlow = true;
const syncChrome = (): void => {
  toolbar?.sync({ view: host.main ?? 'schematic', inset: host.inset !== null, torqueFlow });
  callouts?.setVisible(labelsChoice.value(wide.matches) && host.main === '3d');
  callouts?.invalidate();
  stage.toggleAttribute('data-inset', host.inset !== null);
  touchHint?.sync({ narrow: !wide.matches, main3d: host.main === '3d' });
};
/** Makes `name` the main view, unless the 3D context is lost and it would put the dead canvas back. */
const showMain = (name: ViewName): void => {
  const to = guard.request(name);
  if (to !== null) host.setMain(to);
  syncChrome();
};
wide.addEventListener('change', () => {
  applyInset();
  toolbar?.sync({ labels: labelsChoice.value(wide.matches) });
  syncChrome();
});
insetSlot.addEventListener('click', () => { if (host.inset !== null) showMain(host.inset); });

mountPartCard(cardEl, {
  onClose: () => { if (panelOpen) panel.focusTab(); else panelToggle.focus(); },
  onChange: () => callouts?.invalidate(),
});

// the schematic; if this device cannot draw it the readings, panel and controls still work
let view: View | null = null;
try {
  const schematicBox = el('div', 'view');
  const canvas = el('canvas', 'view-canvas', {
    role: 'img', 'aria-label': 'Cutaway schematic of the clutch, gearbox and final drive, with the torque path in orange',
  });
  schematicBox.append(canvas);
  view = createSchematic(canvas);
  host.register('schematic', view, schematicBox);
} catch (err) {
  console.warn('Schematic not drawn:', err);
  status.notice('The schematic cannot be drawn on this device.');
}

let arrivalStart: number | null = reducedMotion || view === null ? null : performance.now();
if (arrivalStart !== null) view?.setReveal?.(0);
else chip.ready();

let reading: Reading | null = null;
let lastText = -Infinity;
const loop = createLoop(sim, () => driver.source(), (state) => {
  const now = performance.now();
  if (arrivalStart !== null) {
    const p = (now - arrivalStart) / ARRIVAL_MS;
    view?.setReveal?.(p);
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
  cluster.sync(reading, state);
  deck.sync(state, loop.lastInputs);
  host.render(state, shownPath(torquePath(state), torqueFlow));
  callouts?.sync();
  hold.frame();
});
// under reduced motion the idling engine is held still after the first frame until someone rides
const hold = holdForReducedMotion(loop, driver, reducedMotion);

// hover highlights a part, a click (not a drag) selects it
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
const PAUSED = '3D view paused; showing the schematic.';
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
  leave3d?.(); // a 3D view arriving again replaces everything the last one mounted
  view3d = v3;
  const tools = el('div', 'stage-tools');
  const layer = el('div', 'callout-layer');
  stage.insertBefore(layer, insetSlot); // its place in the stacking order comes from styles.css
  stage.append(tools);
  stage.toggleAttribute('data-tools', true); // on phones the main view makes room for it
  const bar = mountToolbar(tools, {
    onView: (v) => showMain(v),
    onInset: (on) => { insetChoice.choose(on); applyInset(); syncChrome(); },
    onTorqueFlow: (on) => { torqueFlow = on; },
    onLabels: (on) => { labelsChoice.choose(on); syncChrome(); },
    onResetCamera: () => v3.resetCamera(),
    onOrbit: (d) => v3.orbit(d, 0),
    onZoom: (f) => v3.zoom(f),
  }, { view: host.main ?? '3d', inset: host.inset !== null, labels: labelsChoice.value(wide.matches) });
  toolbar = bar;
  touchHint ??= mountTouchHint(stage);
  const cards = mountCallouts(layer, v3);
  callouts = cards;
  // cards keep clear of the loader along the top, the status line, the readings and part card, the toolbar and the inset
  const TOP_BAND = 48;
  cards.setAvoid(() => {
    const origin = layer.getBoundingClientRect();
    const rel = (r: DOMRect): Rect => ({ x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height });
    const out: Rect[] = [{ x: 0, y: 0, w: origin.width, h: TOP_BAND }, rel(tools.getBoundingClientRect()), rel(clusterEl.getBoundingClientRect())];
    if (!cardEl.hidden) out.push(rel(cardEl.getBoundingClientRect()));
    if (!insetSlot.hidden) out.push(rel(insetSlot.getBoundingClientRect()));
    if (statusEl.textContent !== '') out.push(rel(statusEl.getBoundingClientRect()));
    return out;
  });
  const onContext = (lost: boolean): void => {
    if (lost) {
      host.setMain(guard.lose(host.main));
      status.notice(PAUSED);
    } else {
      const to = guard.restore(host.main);
      if (to !== null) host.setMain(to);
      status.clear(PAUSED); // only its own notice: any other message stays
    }
    applyInset();
    bar.setAvailable3d(!guard.lost);
    syncChrome();
  };
  const unsubscribe = v3.onContextChange(onContext);
  if (v3.contextLost) onContext(true);
  leave3d = () => {
    unsubscribe();
    bar.dispose();
    cards.dispose();
    layer.remove();
    tools.remove();
    stage.toggleAttribute('data-tools', false);
    guard.reset(); // a lost context belonged to this view, not to the next one
    applyInset();
    toolbar = null; callouts = null; view3d = null; leave3d = null;
  };
  syncChrome();
}

// taking over starts from what the bike was doing, so each control ramps back from there
driver.onModeChange((mode) => {
  if (mode === 'visitor') controls.seed(loop.lastInputs);
  deck.setMode(mode);
});
deck.setMode(driver.mode);

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

trackFocusOrigin(window);
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && panelOpen) { setPanelOpen(false); panelToggle.focus(); return; }
  const target = describeTarget(e.target);
  if (shouldHandleCameraKey(e, target)) { cameraKey(e); return; } // the camera never takes over the ride
  if (!shouldHandleKey(e, target)) return;
  e.preventDefault(); // repeats too, so a held arrow never scrolls the page
  if (e.repeat) return;
  driver.takeOver();
  if (KEYMAP[e.code] === 'reset') reset();
  controls.setKey(e.code, true);
});
window.addEventListener('keyup', (e) => { controls.setKey(e.code, false); });
window.addEventListener('blur', () => controls.releaseAll());

startAnimation(loop);

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

applyTokens(document.documentElement);

const sim = createSimulation();
const controls = createControls();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const driver = createDriver(controls.source, { autoStart: !reducedMotion });

const deck = mountDeck(document.getElementById('deck')!, controls, {
  onTouch: () => driver.takeOver(),
  onReset: () => sim.reset(),
});
const loop = createLoop(sim, () => driver.source(), (state) => deck.sync(state, loop.lastInputs));

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

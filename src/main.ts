import '@fontsource-variable/archivo/wdth.css';
import '@fontsource-variable/jetbrains-mono/index.css';
import './ui/styles.css';
import { applyTokens } from './ui/tokens';
import { createControls, KEYMAP } from './app/controls';
import { createDriver } from './app/driver';
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

const isOurs = (code: string): boolean => Object.hasOwn(KEYMAP, code);
const isTyping = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT');

window.addEventListener('keydown', (e) => {
  // leave browser shortcuts (reload, copy, ...) and typing in form fields alone
  if (!isOurs(e.code) || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
  e.preventDefault();
  if (e.repeat) return;
  driver.takeOver();
  if (KEYMAP[e.code] === 'reset') sim.reset();
  controls.setKey(e.code, true);
});
window.addEventListener('keyup', (e) => {
  if (isOurs(e.code)) controls.setKey(e.code, false);
});
window.addEventListener('blur', () => controls.releaseAll());

startAnimation(loop);

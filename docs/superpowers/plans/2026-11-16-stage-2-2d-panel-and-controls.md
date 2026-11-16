# Stage 2: 2D Panel and Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A rideable web page: the stage 1 simulation driven by on-screen and keyboard controls, drawn as a live 2D cutaway schematic with torque flow and readouts.

**Architecture:** A Vite static site with no UI framework. `src/sim/` stays pure. `src/model/` holds view-independent facts both the 2D and the later 3D view need (part registry, gearbox geometry, torque path). `src/app/` owns the frame loop, the input driver and the controls. `src/view2d/` draws the schematic on a canvas behind a small `View` interface that stage 3's 3D view will also implement. `src/ui/` is DOM panels and styles.

**Tech Stack:** TypeScript, Vite, Vitest. Fonts from `@fontsource-variable/archivo` and `@fontsource-variable/jetbrains-mono` (free, SIL Open Font License, bundled locally so there is no network call).

**Spec:** `docs/superpowers/specs/2026-11-16-motorcycle-transmission-design.md`

## Global Constraints

- `src/sim/` and `src/model/` stay pure: no DOM, no network, no `Math.random`, no `Date`.
- No network call after the page loads; fonts and every asset are bundled.
- No manufacturer or model name anywhere. Ratios are described as "representative of a middleweight sport bike".
- New dependencies allowed in this stage: `vite`, `@fontsource-variable/archivo`, `@fontsource-variable/jetbrains-mono`. Nothing else.
- Colours come only from the tokens in `src/ui/tokens.ts`; no hex literal elsewhere in `src/`.
- The signal colour means one thing everywhere: this part is carrying torque. It is never used for decoration, focus rings or buttons.
- Every control works by keyboard and by pointer, has a visible focus state and an accessible name.
- Laptop first (tuned at 1440 × 900), usable at 390 × 844. Use `dvh`, never `vh`.
- After every task run `npm test`, `npm run typecheck` and `npm run build`; all three clean.
- Git: local commits only; never pass `-c user.name` or `-c user.email`.

## Design plan

1. **Lane.** One idea, drawn in code: *torque is the only colour.* The gearbox is graphite and steel; the path the torque takes from crank to rear wheel is the single orange thing on the page, and it re-routes as you shift. That re-routing line is what a visitor remembers.
2. **Palette as roles** (`src/ui/tokens.ts` is the source of truth; ratios computed by script on 2026-11-16):

   | Role | Token | Hex | Job |
   |---|---|---|---|
   | Ground | `--ground` | `#14161A` | Page background |
   | Surface | `--surface` | `#1E2228` | Panels, cards, control deck |
   | Ink | `--ink` | `#E8EAED` | Primary text (15.03 on ground, 13.25 on surface) |
   | Third | `--third` | `#8F99A8` | Secondary text, part outlines (6.29 on ground, 5.55 on surface) |
   | Signal | `--signal` | `#FF6A1A` | Carrying torque (6.32 on ground, 5.57 on surface) |

   Steel fills for parts, never used for text: `--steel-1 #2A3038`, `--steel-2 #3A424D`, `--steel-3 #566170`. Banned for text: ink on signal (2.38). Text placed on a signal fill uses ground (6.32).
3. **Type.** Display and text: Archivo Variable (weight and width axes; headings at width 112, tracking −0.02em at 32px and up). Numerals and technical labels: JetBrains Mono Variable with tabular figures, zero-padded where a reading has a fixed width (rpm as five digits). Sentence case labels.
4. **Reactive layer.** `data-press` on every button and control (scale 0.97 on pointerdown, 80 ms). `data-count` on live numerals (tabular, no tweening: they are real readings). No magnetic pull, tilt or cursor follower: this screen is an instrument.
5. **Chrome and arrival.** One arrival: the schematic's parts fade in along the torque path from crank to wheel over 900 ms, then the autopilot rider starts. The header carries the live reading: gear, engine rpm and road speed. No ambient motion; after arrival everything that moves is the simulation.
6. **Layout.** Desktop: header 56px; stage fills the remaining width and height; a 360px information panel on the right; a control deck 132px high along the bottom of the stage. 24px gutters. Below 900px wide: single column, stage on top at 46dvh, control deck fixed at the bottom in thumb reach, information panel between them and scrollable. 16px gutters.
7. **Fallbacks.** Reduced motion: no arrival animation, and the autopilot does not start by itself (a "Start the demo ride" button does it), because unrequested continuous motion is what the setting asks to avoid. No JavaScript: a `<noscript>` block explains what the page is and lists the gear ratios as a static table. Print: not applicable, it is an instrument.
8. **Ship gate.** `npm test` (includes the contrast test), `npm run typecheck`, `npm run build`, and `npm run size` reporting 60 kB or less of gzipped JavaScript. Browser checks at 1440 × 900 and 390 × 844, with reduced motion and with JavaScript off, are run by the controller with the browser tool and screenshots.

   **Ask the owner to check:** whether the orange reads as "torque" without being told; real-phone feel of the clutch lever and pedal.

## File Structure

| File | Responsibility |
|---|---|
| `index.html`, `src/main.ts` | Page shell, boot, wiring |
| `src/ui/tokens.ts`, `src/ui/styles.css` | Colour, type and spacing tokens; all CSS |
| `src/model/parts.ts` | Part registry: id, name, one-line role |
| `src/model/geometry.ts` | Gearbox dimensions and axial layout from tooth counts |
| `src/model/torquePath.ts` | Which parts carry torque for a given state |
| `src/app/loop.ts` | Frame loop: real time to fixed simulation steps, time scale, pause |
| `src/app/driver.ts` | Autopilot until the visitor touches a control |
| `src/app/controls.ts` | Keyboard and pointer state to `Inputs` |
| `src/view2d/schematic.ts` | Canvas drawing of the cutaway |
| `src/ui/deck.ts` | On-screen control deck widgets |
| `src/ui/readouts.ts`, `src/ui/panel.ts` | Header readings, tachometer, tabbed information panel |
| `scripts/size.mjs` | Reports gzipped JavaScript size of `dist/` |

---

### Task 1: Shaft angles in the simulation, part registry, geometry and torque path

**Files:**
- Modify: `src/sim/types.ts`, `src/sim/simulation.ts`
- Create: `src/model/parts.ts`, `src/model/geometry.ts`, `src/model/torquePath.ts`
- Test: `tests/sim/simulation.test.ts` (add), `tests/model/geometry.test.ts`, `tests/model/torquePath.test.ts`

**Interfaces:**
- Produces:

```ts
// SimState gains (integrated each step, unwrapped, radians):
angles: { crank: number; input: number; output: number };

// parts.ts
export type GearNo = 1 | 2 | 3 | 4 | 5 | 6;
export type PartId =
  | 'crank' | 'primaryDrive' | 'clutchBasket' | 'frictionPlates' | 'steelPlates' | 'clutchHub'
  | 'pressurePlate' | 'inputShaft' | 'outputShaft'
  | `gear${GearNo}in` | `gear${GearNo}out`
  | 'forkA' | 'forkB' | 'forkC' | 'shiftDrum' | 'starWheel' | 'detentArm' | 'shiftShaft' | 'pedal'
  | 'sprocket' | 'chain' | 'rearSprocket' | 'rearWheel';
export interface PartInfo { id: PartId; name: string; role: string }   // role: one sentence, plain words
export const PARTS: Record<PartId, PartInfo>;

// geometry.ts  (metres)
export const MODULE = 0.0025;                 // gear module; pitch radius = teeth * MODULE / 2
export const CENTRE_DISTANCE: number;         // 50 * MODULE / 2 = 0.0625
export const FACE_WIDTH = 0.014;
export const GEAR_ORDER: readonly GearNo[];   // axial order left to right: [1, 5, 3, 4, 6, 2]
export type GearKind = 'fixed' | 'free' | 'slider';
export const gearKind: (shaft: 'input' | 'output', g: GearNo) => GearKind;
export const sliderOfGear: (shaft: 'input' | 'output', g: GearNo) => SliderId | null;
export const pitchRadius: (shaft: 'input' | 'output', g: GearNo) => number;
// axial centre of each gear at rest, and how far a slider travels per unit x
export const gearAxialPosition: (g: GearNo) => number;
export const SLIDER_TRAVEL = 0.004;
// angle of any gear given the state's shaft angles (free gears follow their meshing partner)
export const gearAngle: (shaft: 'input' | 'output', g: GearNo, angles: SimState['angles']) => number;

// torquePath.ts
export interface TorquePath { parts: PartId[]; torque: number; slipping: boolean; reach: 'none' | 'clutch' | 'inputShaft' | 'wheel' }
export function torquePath(state: SimState): TorquePath;
```

Facts the implementer needs:
- Input shaft: gears 1 and 2 are fixed to it, 5 and 6 spin free on it, 3 and 4 are one sliding piece (slider C). Output shaft: 1, 2, 3 and 4 spin free, 5 is slider A, 6 is slider B. A sliding gear is splined to its shaft and always turns with it.
- A free gear turns with its meshing partner: a free output gear g is at `−angles.input / gearRatio(g)`, a free input gear g at `−angles.output × gearRatio(g)` (meshing gears turn in opposite senses). Fixed and sliding gears take their own shaft's angle.
- `torquePath`: torque magnitude is `|state.clutch.torque|`; below 0.5 N·m the path is `reach: 'none'` with no parts. Otherwise the path starts `crank, primaryDrive, clutchBasket, frictionPlates, steelPlates, clutchHub, inputShaft` (`reach: 'inputShaft'`). With a gear locked it continues `gear{g}in, gear{g}out, outputShaft, sprocket, chain, rearSprocket, rearWheel` (`reach: 'wheel'`). `slipping` is `!state.clutch.locked && |state.clutch.slip| > 0.5`. When the engine is being driven by the wheel (negative `dogTorque`) the same parts are listed; `torque` carries the sign of `dogTorque` when in gear.

- [ ] **Step 1: Write the failing tests.**

```ts
// simulation.test.ts
test('shaft angles advance with speed and keep the gear ratio', () => {
  const sim = inGear(3, 6000);
  const a0 = sim.getState().angles;
  const s = run(sim, inp({ throttle: 0.3 }), 0.5);
  expect(s.angles.crank).toBeGreaterThan(a0.crank);
  expect((s.angles.input - a0.input) / (s.angles.output - a0.output)).toBeCloseTo(gearRatio(3), 6);
});

// geometry.test.ts
test('axial order and kinds', () => {
  expect(GEAR_ORDER).toEqual([1, 5, 3, 4, 6, 2]);
  expect(gearKind('input', 1)).toBe('fixed');
  expect(gearKind('input', 3)).toBe('slider');
  expect(gearKind('input', 5)).toBe('free');
  expect(gearKind('output', 5)).toBe('slider');
  expect(gearKind('output', 1)).toBe('free');
  expect(sliderOfGear('output', 6)).toBe('B');
  expect(sliderOfGear('input', 4)).toBe('C');
  expect(sliderOfGear('input', 1)).toBeNull();
});
test('every pair meshes at one centre distance', () => {
  for (const g of [1, 2, 3, 4, 5, 6] as const)
    expect(pitchRadius('input', g) + pitchRadius('output', g)).toBeCloseTo(CENTRE_DISTANCE, 12);
});
test('positions increase along GEAR_ORDER with room for slider travel', () => {
  const xs = GEAR_ORDER.map(gearAxialPosition);
  for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(FACE_WIDTH + SLIDER_TRAVEL);
});
test('meshing gears counter-rotate at the tooth ratio', () => {
  const angles = { crank: 0, input: 1.3, output: 0 };
  expect(gearAngle('input', 1, angles)).toBe(1.3);
  expect(gearAngle('output', 1, angles)).toBeCloseTo(-1.3 / gearRatio(1), 12);
});

// torquePath.test.ts
test('no torque, no path', () => {
  expect(torquePath(stateWith({ clutchTorque: 0.1 }))).toMatchObject({ parts: [], reach: 'none' });
});
test('neutral: the path stops at the input shaft', () => {
  const p = torquePath(stateWith({ clutchTorque: 1.2, lockedGear: null }));
  expect(p.reach).toBe('inputShaft');
  expect(p.parts.at(-1)).toBe('inputShaft');
});
test('in fourth the path runs through the fourth gear pair to the wheel', () => {
  const p = torquePath(stateWith({ clutchTorque: 80, lockedGear: 4, dogTorque: 110 }));
  expect(p.reach).toBe('wheel');
  expect(p.parts).toContain('gear4in');
  expect(p.parts).toContain('gear4out');
  expect(p.parts).not.toContain('gear3in');
  expect(p.parts.at(-1)).toBe('rearWheel');
  expect(p.torque).toBeGreaterThan(0);
});
test('engine braking reverses the sign, slipping is flagged', () => {
  expect(torquePath(stateWith({ clutchTorque: -12, lockedGear: 2, dogTorque: -20 })).torque).toBeLessThan(0);
  expect(torquePath(stateWith({ clutchTorque: 60, lockedGear: 1, dogTorque: 150, slip: 40, clutchLocked: false })).slipping).toBe(true);
});
test('every part has a name and a one-sentence role', () => {
  for (const p of Object.values(PARTS)) { expect(p.name.length).toBeGreaterThan(2); expect(p.role).toMatch(/\.$/); }
});
```

`stateWith` is a test helper in `tests/model/helpers.ts` that takes a fresh `createSimulation().getState()` and overrides the named fields.

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** Reset sets all three angles to 0.
- [ ] **Step 4: Run `npm test` and `npm run typecheck`.** Expected: all pass.
- [ ] **Step 5: Commit:** `feat: shaft angles, part registry, gearbox geometry and torque path`

### Task 2: Vite shell, tokens, fonts, contrast test and size script

**Files:**
- Create: `index.html`, `src/main.ts`, `src/ui/tokens.ts`, `src/ui/styles.css`, `vite.config.ts`, `scripts/size.mjs`
- Modify: `package.json`, `tsconfig.json`
- Test: `tests/ui/tokens.test.ts`

**Interfaces:**
- Produces:

```ts
// tokens.ts
export const COLORS: { ground: string; surface: string; ink: string; third: string; signal: string; steel1: string; steel2: string; steel3: string };
export function contrast(a: string, b: string): number;        // WCAG 2 ratio
export function applyTokens(root: HTMLElement): void;          // writes every colour as a CSS custom property (--ground ...)
```

- `package.json` scripts: `dev` (`vite`), `build` (`tsc --noEmit && vite build`), `preview` (`vite preview`), `size` (`node scripts/size.mjs`). `vite.config.ts`: `base: './'` so the build works from any folder.
- `scripts/size.mjs` gzips every `.js` file in `dist/assets`, prints each and the total in kB, and exits 1 if the total is over 60.
- `index.html`: `<html lang="en">`, a descriptive `<title>` and meta description with no brand names, the layout landmarks from the Design plan part 6 (`<header>`, `<main>` holding `#stage`, `#deck`, `<aside id="panel">`), and the `<noscript>` block from part 7 with the six ratios as a table.
- `styles.css` defines the type scale, spacing scale (4px base), the grid from part 6 with its breakpoint at 900px, focus-visible ring in `--ink`, `[data-press]` behaviour, and a `prefers-reduced-motion` block that removes transitions. Fonts are imported from the two `@fontsource-variable` packages.

- [ ] **Step 1: Install** `vite`, `@fontsource-variable/archivo`, `@fontsource-variable/jetbrains-mono`.
- [ ] **Step 2: Write the failing test:**

```ts
test('palette matches the design plan', () => {
  expect(COLORS).toMatchObject({ ground: '#14161A', surface: '#1E2228', ink: '#E8EAED', third: '#8F99A8', signal: '#FF6A1A' });
});
test('every text pair passes 4.5', () => {
  for (const text of [COLORS.ink, COLORS.third, COLORS.signal])
    for (const bg of [COLORS.ground, COLORS.surface]) expect(contrast(text, bg)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(COLORS.ground, COLORS.signal)).toBeGreaterThanOrEqual(4.5);
});
test('ink on signal is banned for text', () => {
  expect(contrast(COLORS.ink, COLORS.signal)).toBeLessThan(4.5);
});
test('known ratio', () => {
  expect(contrast('#E8EAED', '#14161A')).toBeCloseTo(15.03, 1);
});
```

- [ ] **Step 3: Run it.** Expected: FAIL.
- [ ] **Step 4: Implement the files above.** `main.ts` applies tokens and renders the empty shell.
- [ ] **Step 5: Run `npm test`, `npm run typecheck`, `npm run build`, `npm run size`.** Expected: all clean; size well under 60 kB.
- [ ] **Step 6: Commit:** `feat: page shell, design tokens with contrast test, bundled fonts`

### Task 3: Frame loop and driver

**Files:** Create `src/app/loop.ts`, `src/app/driver.ts`. Test `tests/app/loop.test.ts`, `tests/app/driver.test.ts`.

**Interfaces:**
- Consumes: `Simulation`, `InputSource`, `createAutopilot`, `PARAMS.dt`.
- Produces:

```ts
// loop.ts
export interface Loop {
  tick(elapsedSeconds: number): void;   // called once per animation frame with real elapsed time
  stepOnce(): void;                     // exactly one simulation step, for pause-and-step
  setTimeScale(scale: number): void;    // clamped to 0.02..1
  setPaused(paused: boolean): void;
  readonly timeScale: number; readonly paused: boolean;
}
export function createLoop(sim: Simulation, getSource: () => InputSource, onFrame: (state: SimState) => void): Loop;
export function startAnimation(loop: Loop): () => void;   // requestAnimationFrame wrapper; returns a stop function

// driver.ts
export interface Driver {
  source(): InputSource;          // autopilot or the visitor's
  takeOver(): void;               // idempotent
  startDemo(): void;              // hands control back to a fresh autopilot
  readonly mode: 'idle' | 'demo' | 'visitor';
  onModeChange(fn: (mode: Driver['mode']) => void): void;
}
export function createDriver(visitor: InputSource, opts: { autoStart: boolean }): Driver;
```

Rules: `tick` adds `min(elapsed, 0.1) × timeScale` to an accumulator and runs whole `PARAMS.dt` steps from it, carrying the remainder; it calls `onFrame` once per tick even when paused. Each step calls the source with seconds since the loop was created and the current state. In `idle` mode the source returns `NEUTRAL_INPUTS` with ignition on. `autoStart: false` starts in `idle` (used under reduced motion). The script-relative time passed to a fresh autopilot restarts at 0 on `startDemo`.

- [ ] **Step 1: Write the failing tests:**

```ts
test('real time maps to fixed steps with the remainder carried', () => {
  const sim = createSimulation(); const loop = createLoop(sim, () => () => NEUTRAL_INPUTS, () => {});
  loop.tick(0.0163); expect(sim.getState().t).toBeCloseTo(0.016, 9);
  loop.tick(0.0163); expect(sim.getState().t).toBeCloseTo(0.0325, 9);
});
test('a long gap is capped, slow motion scales, pause holds, stepOnce steps', () => {
  const sim = createSimulation(); let frames = 0;
  const loop = createLoop(sim, () => () => NEUTRAL_INPUTS, () => { frames++; });
  loop.tick(30); expect(sim.getState().t).toBeCloseTo(0.1, 9);
  loop.setTimeScale(0.1); loop.tick(0.05); expect(sim.getState().t).toBeCloseTo(0.105, 9);
  loop.setPaused(true); loop.tick(0.05); expect(sim.getState().t).toBeCloseTo(0.105, 9);
  loop.stepOnce(); expect(sim.getState().t).toBeCloseTo(0.1055, 9);
  expect(frames).toBe(3);
  loop.setTimeScale(5); expect(loop.timeScale).toBe(1);
});
test('driver: demo until taken over, and back', () => {
  const visitor: InputSource = () => ({ ...NEUTRAL_INPUTS, throttle: 0.77 });
  const d = createDriver(visitor, { autoStart: true }); const modes: string[] = [];
  d.onModeChange((m) => modes.push(m));
  expect(d.mode).toBe('demo');
  d.takeOver(); d.takeOver();
  expect(d.mode).toBe('visitor');
  expect(d.source()(0, createSimulation().getState()).throttle).toBe(0.77);
  d.startDemo(); expect(modes).toEqual(['visitor', 'demo']);
  expect(createDriver(visitor, { autoStart: false }).mode).toBe('idle');
});
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `npm test`, `npm run typecheck`, `npm run build`.** Expected: all clean.
- [ ] **Step 5: Commit:** `feat: fixed-step frame loop and autopilot/visitor driver`

### Task 4: Controls

**Files:** Create `src/app/controls.ts`, `src/ui/deck.ts`. Test `tests/app/controls.test.ts`.

**Interfaces:**
- Consumes: `Inputs`, `Driver`.
- Produces:

```ts
// controls.ts (pure logic, no DOM)
export type Channel = 'throttle' | 'clutchLever' | 'brake' | 'pedalUp' | 'pedalDown';
export const KEYMAP: Record<string, Channel | 'starter' | 'ignition' | 'reset'>;
export interface Controls {
  setKey(code: string, down: boolean): boolean;      // returns true if the key is one of ours
  setPointer(channel: 'throttle' | 'clutchLever' | 'brake' | 'pedal', value: number | null): void; // null releases
  setStarter(down: boolean): void;
  toggleIgnition(): void;
  update(dtSeconds: number): void;                   // advances the ramps
  inputs(): Inputs;
  readonly source: InputSource;                      // calls update with the step's dt, then inputs()
}
export function createControls(): Controls;
// deck.ts (DOM)
export function mountDeck(el: HTMLElement, controls: Controls, hooks: { onTouch(): void; onReset(): void }): { sync(state: SimState, inputs: Inputs): void };
```

Rules:
- Keys: `ArrowUp` throttle, `ArrowDown` brake, `KeyC` and `ShiftLeft` clutch, `KeyW` pedal up, `KeyS` pedal down, `Enter` starter, `KeyI` ignition, `KeyR` reset.
- Ramps while a key is held: throttle to 1 in 0.40 s and back to 0 in 0.20 s; brake to 1 in 0.25 s, back in 0.10 s; clutch lever to 1 in 0.12 s, back to 0 in 0.60 s (so releasing the key feeds the clutch out); pedal toward ±1 in 0.08 s, back to 0 in 0.06 s. A pedal key tapped for 40 ms therefore peaks at half travel: the analog pedal the spec asks for.
- A pointer value overrides the key ramp for that channel until released with `null`.
- `deck.ts` builds: a throttle slider (vertical, springs back), a brake button, a clutch lever (horizontal drag, springs back to released), a shift pedal (vertical drag from centre, springs to centre, with up and down buttons beside it for single taps), ignition toggle, starter button, reset button. Each shows its key hint, has `data-press`, an accessible name, and is at least 44 × 44 CSS px. Any interaction calls `hooks.onTouch()`. `sync` moves the widgets to match the live inputs so the visitor sees what the autopilot is doing.

- [ ] **Step 1: Write the failing test:**

```ts
const hold = (c: Controls, seconds: number) => { for (let t = 0; t < seconds; t += 0.001) c.update(0.001); };
test('throttle ramps up while held and falls when released', () => {
  const c = createControls(); c.setKey('ArrowUp', true);
  hold(c, 0.2); expect(c.inputs().throttle).toBeCloseTo(0.5, 1);
  hold(c, 0.3); expect(c.inputs().throttle).toBe(1);
  c.setKey('ArrowUp', false); hold(c, 0.25); expect(c.inputs().throttle).toBe(0);
});
test('a quick pedal tap is a short stroke, a held key is a full one', () => {
  const c = createControls(); c.setKey('KeyW', true); hold(c, 0.04);
  expect(c.inputs().pedal).toBeGreaterThan(0.4); expect(c.inputs().pedal).toBeLessThan(0.6);
  hold(c, 0.1); expect(c.inputs().pedal).toBe(1);
  c.setKey('KeyW', false); hold(c, 0.1); expect(c.inputs().pedal).toBe(0);
  c.setKey('KeyS', true); hold(c, 0.2); expect(c.inputs().pedal).toBe(-1);
});
test('clutch pulls fast and feeds out slowly', () => {
  const c = createControls(); c.setKey('KeyC', true); hold(c, 0.13); expect(c.inputs().clutchLever).toBe(1);
  c.setKey('KeyC', false); hold(c, 0.3); expect(c.inputs().clutchLever).toBeCloseTo(0.5, 1);
});
test('pointer overrides keys until released; unknown keys are ignored', () => {
  const c = createControls(); c.setPointer('throttle', 0.33); c.setKey('ArrowUp', true); hold(c, 0.5);
  expect(c.inputs().throttle).toBe(0.33);
  c.setPointer('throttle', null); hold(c, 0.5); expect(c.inputs().throttle).toBe(1);
  expect(c.setKey('KeyQ', true)).toBe(false);
});
test('ignition toggles and starter holds', () => {
  const c = createControls(); expect(c.inputs().ignition).toBe(true);
  c.toggleIgnition(); expect(c.inputs().ignition).toBe(false);
  c.setStarter(true); expect(c.inputs().starter).toBe(true);
});
```

- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement `controls.ts`, then `deck.ts`, and wire both in `main.ts`** (keydown/keyup on `window`, ignoring repeats and keys typed into form fields; `preventDefault` only for our keys).
- [ ] **Step 4: Run `npm test`, `npm run typecheck`, `npm run build`.** Expected: all clean.
- [ ] **Step 5: Commit:** `feat: keyboard and pointer controls with analog ramps and control deck`

### Task 5: The 2D schematic

**Files:** Create `src/view2d/schematic.ts`, `src/app/view.ts`. Test `tests/view2d/schematic.test.ts`.

**Interfaces:**
- Consumes: `geometry.ts`, `parts.ts`, `TorquePath`, `SimState`, `COLORS`.
- Produces:

```ts
// view.ts — the contract stage 3's 3D view also implements
export interface View {
  render(state: SimState, path: TorquePath): void;
  resize(width: number, height: number, dpr: number): void;
  pick(x: number, y: number): PartId | null;       // CSS pixels relative to the view
  setHighlight(part: PartId | null): void;
  dispose(): void;
}
// schematic.ts
export interface PartShape { id: PartId; x: number; y: number; w: number; h: number }  // model metres, schematic plane
export function schematicShapes(state: SimState): PartShape[];   // pure: where every part is drawn for this state
export function createSchematic(canvas: HTMLCanvasElement): View;
```

What it draws, as a cutaway seen from the side with both shafts horizontal (input above, output below), left to right in `GEAR_ORDER`:
- The clutch at the left end of the input shaft: basket, alternating friction and steel plates, pressure plate. Plate gaps open as `state.inputs`-driven capacity falls: use `1 − clutch.capacity / clutchCapacityMax` as the separation, up to 0.6 mm per gap. Primary drive gear and crank above the basket.
- Each gear as a rectangle whose half-height is its pitch radius and width is `FACE_WIDTH`, centred on its shaft; meshing pairs touch at the pitch line. Sliders are drawn displaced by `x × SLIDER_TRAVEL`, with their dog teeth as small lugs on the faces, and the matching slots on the neighbouring free gears; an engaged dog visibly sits inside its slot.
- Rotation shown by tick marks that travel across each gear's face at a rate set by `gearAngle` (a mark at angle θ sits at `radius × sin θ` and is drawn only when `cos θ > 0`), so faster gears visibly sweep faster and meshing gears sweep in opposite directions.
- Free gears use `--steel-1`, fixed and sliding gears `--steel-2`, shafts `--steel-3`, outlines `--third`.
- The shift drum below the output shaft as a developed (unrolled) track: three grooves drawn as their `grooveCommand` profile against drum angle, a cursor at the current angle, detent marks labelled 1 N 2 3 4 5 6, and three forks rising from the grooves to their sliders.
- Final drive at the right end of the output shaft: sprocket, chain as a short run, rear sprocket and wheel as a simplified end view.
- Torque flow: every part in `path.parts` is filled `--signal` at an opacity from 0.35 to 1 scaled by `|path.torque|` over 150 N·m, and a continuous signal line is drawn through the centres of those parts in order. When `path.slipping`, the clutch plates' fill is hatched instead of solid. Under engine braking (`path.torque < 0`) the line is dashed.
- A part under the pointer or set by `setHighlight` gets a 2px `--ink` outline.

`schematicShapes` is the single source of positions for both drawing and `pick`.

- [ ] **Step 1: Write the failing test:**

```ts
const base = () => createSimulation().getState();
test('every drawable part has a shape and none are degenerate', () => {
  const ids = new Set(schematicShapes(base()).map((s) => s.id));
  for (const id of ['clutchBasket', 'inputShaft', 'outputShaft', 'gear1in', 'gear6out', 'shiftDrum', 'forkA', 'rearWheel'] as const) expect(ids.has(id)).toBe(true);
  for (const s of schematicShapes(base())) { expect(s.w).toBeGreaterThan(0); expect(s.h).toBeGreaterThan(0); }
});
test('meshing gears touch at the pitch line', () => {
  const shapes = schematicShapes(base()); const get = (id: PartId) => shapes.find((s) => s.id === id)!;
  for (const g of [1, 2, 3, 4, 5, 6] as const) {
    const a = get(`gear${g}in`), b = get(`gear${g}out`);
    expect(a.y + a.h).toBeCloseTo(b.y, 9);                       // bottom of the input gear meets the top of the output gear
    expect(a.x).toBeCloseTo(b.x, 9);
  }
});
test('a slider moves with its x and nothing else does', () => {
  const s0 = base(); const s1 = base(); s1.sliders.A.x = -1;
  const x = (st: SimState, id: PartId) => schematicShapes(st).find((s) => s.id === id)!.x;
  expect(x(s1, 'gear5out') - x(s0, 'gear5out')).toBeCloseTo(-SLIDER_TRAVEL, 9);
  expect(x(s1, 'gear1out')).toBe(x(s0, 'gear1out'));
  expect(x(s1, 'gear5in')).toBe(x(s0, 'gear5in'));
});
test('slider C carries both third and fourth on the input shaft', () => {
  const s0 = base(); const s1 = base(); s1.sliders.C.x = 1;
  const x = (st: SimState, id: PartId) => schematicShapes(st).find((s) => s.id === id)!.x;
  expect(x(s1, 'gear3in') - x(s0, 'gear3in')).toBeCloseTo(SLIDER_TRAVEL, 9);
  expect(x(s1, 'gear4in') - x(s0, 'gear4in')).toBeCloseTo(SLIDER_TRAVEL, 9);
});
```

- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement `view.ts` and `schematic.ts`; mount the schematic in `#stage` from `main.ts`, with a `ResizeObserver` calling `resize`, the loop's `onFrame` calling `render(state, torquePath(state))`, and pointer move/click calling `pick` and `setHighlight`.**
- [ ] **Step 4: Run `npm test`, `npm run typecheck`, `npm run build`, `npm run size`.** Expected: all clean.
- [ ] **Step 5: Commit:** `feat: live 2D cutaway schematic with torque flow`

### Task 6: Readouts, information panel and page assembly

**Files:** Create `src/ui/readouts.ts`, `src/ui/panel.ts`. Modify `src/main.ts`, `src/ui/styles.css`, `index.html`. Test `tests/ui/readouts.test.ts`.

**Interfaces:**
- Produces:

```ts
// readouts.ts
export interface Reading { gear: string; rpm: string; speedKmh: string; inputRpm: string; outputRpm: string; ratio: string; slipRpm: string; torqueNm: string; clutch: 'locked' | 'slipping' | 'open'; engine: 'running' | 'stalled' | 'off' }
export function formatReading(state: SimState, inputs: Inputs): Reading;   // pure
export function mountReadouts(header: HTMLElement, live: HTMLElement): { sync(r: Reading, state: SimState): void };
// panel.ts
export function mountPanel(el: HTMLElement): { showPart(id: PartId | null): void; syncLive(r: Reading): void };
```

Rules:
- `gear`: `'1'`..`'6'` when locked; `'N'` when nothing is locked and the drum is within 3° of the N detent; `'–'` otherwise (a false neutral). `rpm` is five digits zero-padded; `speedKmh` three digits; `ratio` is the overall ratio to two decimals or `'—'` out of gear. `clutch` is `'open'` when capacity is 0, `'locked'` when `state.clutch.locked`, else `'slipping'`. `engine` is `'off'` when ignition is off, `'stalled'` when ignition is on and it is not running, else `'running'`.
- Header shows gear (large), rpm and km/h. Text readouts update at most 15 times a second; a tachometer bar (0 to 15 000 rpm, the last 1 000 marked) updates every frame.
- Panel tabs, using the ARIA tabs pattern with arrow-key navigation: **Overview** (what this is, in three short paragraphs, and how to ride it: the key list), **Ratios** (table of six gears: teeth, ratio, overall ratio, km/h per 1 000 rpm, and top speed at the limiter, all computed from `kinematics.ts`, with the current gear's row marked), **Live data** (every field of `Reading`), **Specifications** (primary and final drive teeth, wheel radius, mass, clutch plate count and capacity, labelled "representative of a middleweight sport bike"). When a part is picked in the stage, a card above the tabs shows its name and role from `PARTS`, with a close button.
- A mode chip in the header reads "Demo ride" while the autopilot drives, with the hint "touch any control to take over"; after takeover it becomes a "Watch the demo" button calling `driver.startDemo()`. Under `prefers-reduced-motion` the driver starts `idle` and the chip is a "Start the demo ride" button.
- Arrival per the Design plan part 5, skipped under reduced motion.
- Stall hint: when `engine` is `'stalled'`, a line under the header reads "Stalled. Pull the clutch and press Enter to restart."

- [ ] **Step 1: Write the failing test:**

```ts
test('formats a riding state', () => {
  const sim = inGear(3, 6000); const r = formatReading(sim.getState(), NEUTRAL_INPUTS);
  expect(r.gear).toBe('3'); expect(r.rpm).toBe('06000'); expect(r.clutch).toBe('locked'); expect(r.engine).toBe('running');
  expect(r.ratio).toBe((primaryRatio * gearRatio(3) * finalRatio).toFixed(2));
  expect(r.speedKmh).toMatch(/^\d{3}$/);
});
test('neutral, false neutral, clutch open, stalled and off', () => {
  const s = createSimulation().getState();
  expect(formatReading(s, NEUTRAL_INPUTS).gear).toBe('N');
  s.drum.angle = deg(90); expect(formatReading(s, NEUTRAL_INPUTS).gear).toBe('–');
  s.clutch.capacity = 0; expect(formatReading(s, NEUTRAL_INPUTS).clutch).toBe('open');
  s.engine.running = false; expect(formatReading(s, NEUTRAL_INPUTS).engine).toBe('stalled');
  expect(formatReading(s, { ...NEUTRAL_INPUTS, ignition: false }).engine).toBe('off');
  expect(formatReading(s, NEUTRAL_INPUTS).ratio).toBe('—');
});
```

- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement and assemble the page.**
- [ ] **Step 4: Run `npm test`, `npm run typecheck`, `npm run build`, `npm run size`.** Expected: all clean, 60 kB or less.
- [ ] **Step 5: Commit:** `feat: readouts, tabbed information panel and page assembly`

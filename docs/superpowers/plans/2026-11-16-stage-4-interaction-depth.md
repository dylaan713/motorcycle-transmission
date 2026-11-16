# Stage 4: Interaction Depth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a visitor take the gearbox apart with their eyes and hands: slow time down, explode the assembly, see through it, focus on one part, and turn the mechanism by hand with the engine off.

**Architecture:** Each feature is a small pure core with tests, wired to the existing toolbar, 3D view and controls. Explode and x-ray are extra inputs to `poseAssembly` (a `ViewOptions` record), so the 3D view stays a function of simulation state plus view options. Hand manipulation goes through the simulation's existing hand-torque inputs: the visitor applies torque and the physics does the rest.

**Tech Stack:** As stage 3. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-16-motorcycle-transmission-design.md`

## Global Constraints

- No new dependencies. Colours only from tokens; the signal colour means only "carrying torque".
- Every new control is reachable by keyboard and pointer, has an accessible name, a visible focus state and a 44 × 44 CSS px target.
- View-only actions (camera, explode, x-ray, time scale, part focus) never take over the ride from the autopilot. Hand manipulation and pause do.
- Animated view transitions (explode, camera moves) take 450 ms with an ease-out curve and are instant under `prefers-reduced-motion`.
- Initial JavaScript stays at 60 kB gzipped or less and the 3D chunk at 220 kB or less.
- After every task: `npm test`, `npm run typecheck`, `npm run build`, `npm run size` clean.

## Review Focus

1. **Time control while a key is held:** slowing time must not strand a held key or a half-finished pedal stroke. Test in Task 1.
2. **Explode while riding:** exploded parts keep rotating and sliding correctly; nothing snaps when explode returns to 0. Test in Task 2.
3. **Hand torque with the engine running:** refused with a clear message, never applied. Test in Task 4.
4. **Pointer released outside the stage during a hand drag:** the torque returns to zero. Test in Task 4.
5. **Focusing a part that is hidden or off-screen (rear wheel):** the camera still frames it. Test in Task 5.

---

### Task 1: Time control

**Files:** Modify `src/ui/toolbar.ts`, `src/main.ts`, `src/app/keys.ts`, `src/ui/styles.css`. Create `src/app/timeControl.ts`. Test `tests/app/timeControl.test.ts`.

**Interfaces:**
- Consumes: `Loop` (`setTimeScale`, `setPaused`, `stepOnce`).
- Produces:

```ts
export const TIME_SCALES = [1, 0.25, 0.05] as const;
export interface TimeControl {
  readonly scale: number; readonly paused: boolean;
  cycleScale(): void;                 // 1 -> 0.25 -> 0.05 -> 1
  setScale(scale: number): void;      // must be one of TIME_SCALES
  togglePause(): void;
  step(count?: number): void;         // only while paused; default 20 simulation steps (10 ms)
  label(): string;                    // '1×', '¼×', '1/20×', or 'Paused'
  onChange(fn: () => void): void;
}
export function createTimeControl(loop: Loop): TimeControl;
```

Rules: keys `KeyT` cycles the scale, `KeyP` toggles pause, `Period` steps while paused. Toolbar gains a time group: a scale button showing the label, a pause/play toggle, a step button (enabled only while paused). While slow or paused, a mono-font chip on the stage reads the label so a screenshot is self-explanatory. Pausing takes over from the autopilot; changing the scale does not.

- [ ] **Step 1: Write the failing test:**

```ts
test('scale cycles, pause holds time, step advances exactly', () => {
  const sim = createSimulation(); const loop = createLoop(sim, () => () => NEUTRAL_INPUTS, () => {}); const tc = createTimeControl(loop);
  expect(tc.label()).toBe('1×'); tc.cycleScale(); expect(tc.scale).toBe(0.25); expect(tc.label()).toBe('¼×');
  tc.cycleScale(); expect(tc.scale).toBe(0.05); tc.cycleScale(); expect(tc.scale).toBe(1);
  tc.togglePause(); expect(tc.label()).toBe('Paused'); const t0 = sim.getState().t;
  loop.tick(0.05); expect(sim.getState().t).toBe(t0);
  tc.step(); expect(sim.getState().t).toBeCloseTo(t0 + 0.01, 9);
  tc.togglePause(); tc.step(); expect(sim.getState().t).toBeCloseTo(t0 + 0.01, 9);   // step does nothing when running
});
test('a held control keeps ramping in simulation time when slowed', () => {
  const sim = createSimulation(); const controls = createControls(); const loop = createLoop(sim, () => controls.source, () => {}); const tc = createTimeControl(loop);
  tc.setScale(0.05); controls.setKey('ArrowUp', true);
  for (let i = 0; i < 60; i++) loop.tick(1 / 60);          // 1 s real = 0.05 s simulated
  expect(controls.inputs().throttle).toBeCloseTo(0.125, 1);  // 0.05 s of a 0.40 s ramp
});
```

- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement and wire.**
- [ ] **Step 4: Run the full gate.**
- [ ] **Step 5: Commit:** `feat: slow motion, pause and single-step`

### Task 2: Exploded view

**Files:** Create `src/view3d/explode.ts`. Modify `src/view3d/pose.ts`, `src/view3d/view.ts`, `src/ui/toolbar.ts`, `src/main.ts`. Test `tests/view3d/explode.test.ts`.

**Interfaces:**
- Produces:

```ts
export interface ViewOptions { explode: number; xray: boolean; torqueFlow: boolean }   // explode 0..1
export const DEFAULT_VIEW_OPTIONS: ViewOptions;
export function explodeOffset(id: PartId, amount: number): THREE.Vector3;   // displacement added to the part's assembled position
// poseAssembly gains a fourth parameter: poseAssembly(a, state, path, options: ViewOptions)
// View3d gains: setOptions(patch: Partial<ViewOptions>): void; readonly options: ViewOptions
```

Rules for `explodeOffset` at amount 1 (scaled linearly by amount):
- The two shafts separate radially: everything on the output shaft moves 60 mm further from the input shaft along the line joining the axes; the crank and primary drive move 50 mm away along their own joining line; the drum, forks, rods, star wheel, detent arm, shift shaft and pedal move 70 mm away from the shafts along the drum's joining line.
- Along each shaft, gears spread axially from the gear train's centre: the gear at position i of `GEAR_ORDER` (0..5) moves `(i − 2.5) × 18 mm`. A sliding gear's own travel is added on top as usual.
- The clutch pack spreads along x away from the gear train: basket 0, then each plate a further 6 mm, hub 110 mm, pressure plate 125 mm (all toward −x).
- Final drive: sprocket 40 mm toward +x; chain, rear sprocket and wheel stay.
- Forks stay aligned in x with the slider they move, so the fork-to-gear relationship remains readable.

Toolbar gets an "Explode" toggle (`KeyG`); the amount eases between 0 and 1 per the global constraint. Rotation and sliding continue normally while exploded.

- [ ] **Step 1: Write the failing test:**

```ts
test('amount 0 is the assembled position, exactly', () => {
  for (const id of Object.keys(PARTS) as PartId[]) expect(explodeOffset(id, 0).length()).toBe(0);
});
test('exploded gears on one shaft no longer overlap axially, and forks follow their sliders', async () => {
  const a = await buildAssembly(() => {}); const s = createSimulation().getState();
  poseAssembly(a, s, torquePath(s), { ...DEFAULT_VIEW_OPTIONS, explode: 1 }); a.root.updateMatrixWorld(true);
  const x = (id: PartId) => a.node(id).getWorldPosition(new THREE.Vector3()).x;
  const order = GEAR_ORDER.map((g) => x(`gear${g}in` as PartId));
  for (let i = 1; i < order.length; i++) expect(order[i] - order[i - 1]).toBeGreaterThanOrEqual(0.021 + 0.018 - 1e-9);
  expect(x('forkA')).toBeCloseTo(x('gear5out'), 9); expect(x('forkC')).toBeCloseTo((x('gear3in') + x('gear4in')) / 2, 9);
});
test('exploding does not change any rotation', async () => {
  const a = await buildAssembly(() => {}); const s = run(inGear(2, 5000), inp({ throttle: 0.4 }), 0.3); const p = torquePath(s);
  poseAssembly(a, s, p, DEFAULT_VIEW_OPTIONS); const r0 = a.node('gear2out').rotation.x;
  poseAssembly(a, s, p, { ...DEFAULT_VIEW_OPTIONS, explode: 1 }); expect(a.node('gear2out').rotation.x).toBe(r0);
  poseAssembly(a, s, p, DEFAULT_VIEW_OPTIONS); a.root.updateMatrixWorld(true);
});
```

- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement.** Update existing `poseAssembly` callers and tests to pass `DEFAULT_VIEW_OPTIONS`; fold the stage 3 torque-flow toggle into `options.torqueFlow`.
- [ ] **Step 4: Run the full gate.**
- [ ] **Step 5: Commit:** `feat: exploded view`

### Task 3: Crankcase and x-ray

**Files:** Create `src/geo/case.ts`. Modify `src/model/parts.ts` (add `'case'`), `src/view3d/assembly.ts`, `src/view3d/pose.ts`, `src/view3d/materials.ts`, `src/view2d/schematic.ts` (ignore `'case'`), `src/ui/toolbar.ts`. Test `tests/geo/case.test.ts`, `tests/view3d/xray.test.ts`.

**Interfaces:**
- Produces:

```ts
// case.ts — the rear half of a crankcase: a tray the mechanism sits in, open toward the camera
export function crankcaseHalf(o: { outline: THREE.Vector2[]; depth: number; wall: number }): THREE.BufferGeometry;
export function caseOutline(): THREE.Vector2[];      // rounded outline in the y-z plane enclosing both shafts, the drum and the clutch, from layout3d
// materials.ts
export function setGhost(group: THREE.Group, ghost: boolean): void;   // ghost: opacity 0.14, depthWrite off, edge lines at 0.35 opacity
```

Rules:
- New part `case` in `PARTS` ("Crankcase", "Holds the shafts and drum in line and keeps the oil in."). The case is drawn as a back half only, behind the mechanism (on the −z side), in `--steel-1` with edge lines, with bearing bosses where the shafts and drum pass through. It is never pickable through a part in front of it.
- X-ray toggle (`KeyV`): the case and every part not in the torque path become ghosts; parts in the path stay solid. With no torque flowing, only the case ghosts. The 2D schematic has no case and ignores the option.
- In exploded view the case moves 90 mm toward −z.

- [ ] **Step 1: Write the failing test:**

```ts
test('the case tray encloses the shafts and is open on the camera side', () => {
  const outline = caseOutline(); const g = crankcaseHalf({ outline, depth: 0.09, wall: 0.004 }); g.computeBoundingBox();
  const b = g.boundingBox!; for (const axis of [inputAxis(), outputAxis(), drumAxis()]) { expect(axis.y).toBeGreaterThan(b.min.y); expect(axis.y).toBeLessThan(b.max.y); expect(axis.z).toBeGreaterThan(b.min.z); expect(axis.z).toBeLessThan(b.max.z); }
});
test('x-ray ghosts everything except the torque path', async () => {
  const a = await buildAssembly(() => {}); const s = run(inGear(4, 7000), inp({ throttle: 0.8 }), 0.2); const p = torquePath(s);
  poseAssembly(a, s, p, { ...DEFAULT_VIEW_OPTIONS, xray: true });
  expect(isGhost(a.node('case'))).toBe(true); expect(isGhost(a.node('gear3out'))).toBe(true);
  expect(isGhost(a.node('gear4in'))).toBe(false); expect(isGhost(a.node('inputShaft'))).toBe(false);
  poseAssembly(a, s, p, DEFAULT_VIEW_OPTIONS); expect(isGhost(a.node('gear3out'))).toBe(false);
});
```

`inputAxis`, `outputAxis`, `drumAxis` come from `layout3d.ts`; `isGhost` is a test helper reading `userData.ghost`.

- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the full gate.**
- [ ] **Step 5: Commit:** `feat: crankcase half and x-ray mode`

### Task 4: Turning parts by hand

**Files:** Create `src/app/handDrag.ts`. Modify `src/app/controls.ts`, `src/view3d/view.ts`, `src/view2d/schematic.ts`, `src/main.ts`, `src/ui/styles.css`. Test `tests/app/handDrag.test.ts`.

**Interfaces:**
- Produces:

```ts
export type HandTarget = 'drum' | 'wheel' | 'inputShaft';
export function handTargetOf(part: PartId): HandTarget | null;   // shiftDrum, starWheel -> drum; rearWheel, rearSprocket, chain, sprocket -> wheel; inputShaft, clutchHub, gear1in, gear2in -> inputShaft
export function dragTorque(target: HandTarget, dragPx: number): number;  // signed, saturating
export interface HandDrag { begin(part: PartId, state: SimState): 'ok' | 'engine-running' | 'not-draggable'; move(dragPx: number): void; end(): void; readonly active: HandTarget | null }
export function createHandDrag(controls: Controls): HandDrag;
// Controls gains: setHand(target: HandTarget, torque: number): void  — feeds handDrumTorque / handWheelTorque / handInputShaftTorque; cleared by releaseAll()
```

Rules: `dragTorque` is `gain × dragPx` clamped to a maximum: drum 0.06 N·m/px up to 4 N·m; wheel 0.8 N·m/px up to 60 N·m; input shaft 0.04 N·m/px up to 3 N·m. Dragging vertically on a draggable part with the engine stopped applies that torque while held; release returns it to zero. With the engine running `begin` returns `'engine-running'` and a status line says "Stop the engine to turn parts by hand (press I)." Draggable parts show a grab cursor when the engine is stopped. A hand drag takes over the ride and suppresses camera orbit for that gesture. Works in both views.

- [ ] **Step 1: Write the failing test:**

```ts
test('targets and saturating torque', () => {
  expect(handTargetOf('shiftDrum')).toBe('drum'); expect(handTargetOf('rearWheel')).toBe('wheel'); expect(handTargetOf('gear1in')).toBe('inputShaft'); expect(handTargetOf('forkA')).toBeNull();
  expect(dragTorque('drum', 10)).toBeCloseTo(0.6, 9); expect(dragTorque('drum', 500)).toBe(4); expect(dragTorque('wheel', -500)).toBe(-60);
});
test('refused while the engine runs; applied and released when stopped', () => {
  const controls = createControls(); const hd = createHandDrag(controls); const running = createSimulation().getState();
  expect(hd.begin('shiftDrum', running)).toBe('engine-running'); expect(controls.inputs().handDrumTorque).toBe(0);
  const stopped = createSimulation().getState(); stopped.engine.running = false; stopped.engine.omega = 0;
  expect(hd.begin('shiftDrum', stopped)).toBe('ok'); hd.move(30); expect(controls.inputs().handDrumTorque).toBeCloseTo(1.8, 9);
  hd.end(); expect(controls.inputs().handDrumTorque).toBe(0); expect(hd.active).toBeNull();
  expect(hd.begin('forkA', stopped)).toBe('not-draggable');
});
test('releaseAll clears a hand torque', () => {
  const controls = createControls(); controls.setHand('wheel', 40); controls.releaseAll(); expect(controls.inputs().handWheelTorque).toBe(0);
});
test('by hand, with the engine off, the drum can be walked from neutral into second', () => {
  const sim = createSimulation(); sim.setState({ engine: { omega: 0, running: false }, inputShaftOmega: 0 });
  const controls = createControls(); controls.toggleIgnition(); const hd = createHandDrag(controls);
  hd.begin('shiftDrum', sim.getState()); hd.move(60);
  for (let i = 0; i < 1200; i++) sim.step(controls.source(0, sim.getState()));
  hd.end(); for (let i = 0; i < 1000; i++) sim.step(controls.source(0, sim.getState()));
  expect(sim.getState().drum.detent === 2 || sim.getState().sliders.B.blocked).toBe(true);
});
```

- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement.** `pointercancel`, `lostpointercapture` and window `blur` all call `end()`.
- [ ] **Step 4: Run the full gate.**
- [ ] **Step 5: Commit:** `feat: turn the drum, wheel and input shaft by hand with the engine off`

### Task 5: Part focus and live part facts

**Files:** Create `src/model/partFacts.ts`. Modify `src/view3d/view.ts`, `src/ui/panel.ts`, `src/main.ts`. Test `tests/model/partFacts.test.ts`, `tests/view3d/focus.test.ts`.

**Interfaces:**
- Produces:

```ts
export interface PartFact { label: string; value: string }
export function partFacts(id: PartId, state: SimState): PartFact[];     // pure; 2 to 5 facts per part
// View3d gains: focusPart(id: PartId | null): void   — eases the camera to frame that part (null returns to the default framing)
export function framingFor(a: Assembly, id: PartId): { centre: THREE.Vector3; radius: number };   // world-space bounding sphere of the part's meshes, radius at least 0.03
```

Rules for `partFacts`:
- A gear: "Teeth", "On" (input or output shaft), "Mounting" ("Fixed to its shaft" / "Spins free until a dog locks it" / "Slides on splines to engage its neighbours"), "Speed" (rpm now, from the shaft speeds), and for a free gear "Locked" yes or no.
- Shafts: speed, and what drives them. Clutch parts: "Clutch" (Locked / Slipping / Open), "Slip" in rpm, "Torque capacity" in N·m now. Shift drum: "Angle" in degrees, "Position" (1 to 6, N, or "Between gears"). Forks: which slider and which two gears it selects, and its travel in mm now. Final drive parts: teeth where relevant, speed, and the reduction. Crank and primary drive: engine rpm, primary reduction.
- Selecting a part (click in either view, or the Parts tab) calls `focusPart` and shows the facts under the part's role in the panel card, updating at the text-readout rate. Closing the card returns the camera.

- [ ] **Step 1: Write the failing test:**

```ts
test('gear facts tell fixed, free and sliding apart', () => {
  const s = inGear(1, 4000).getState(); const f = (id: PartId) => Object.fromEntries(partFacts(id, s).map((x) => [x.label, x.value]));
  expect(f('gear1in')).toMatchObject({ Teeth: '13', On: 'Input shaft', Mounting: 'Fixed to its shaft' });
  expect(f('gear1out')).toMatchObject({ Teeth: '37', On: 'Output shaft', Locked: 'Yes' });
  expect(f('gear3out').Locked).toBe('No');
  expect(f('gear5out').Mounting).toMatch(/Slides/);
  expect(f('gear1in').Speed).toMatch(/rpm$/);
});
test('every part has between two and five facts and no empty values', () => {
  const s = createSimulation().getState();
  for (const id of Object.keys(PARTS) as PartId[]) { const facts = partFacts(id, s); expect(facts.length, id).toBeGreaterThanOrEqual(2); expect(facts.length, id).toBeLessThanOrEqual(5); for (const x of facts) expect(x.value.length).toBeGreaterThan(0); }
});
test('drum position reads the false neutral', () => {
  const s = createSimulation().getState(); s.drum.angle = deg(90); s.drum.detent = null;
  expect(partFacts('shiftDrum', s).find((x) => x.label === 'Position')!.value).toBe('Between gears');
});
test('framing: a small part gets a sensible minimum, the wheel gets its own size', async () => {
  const a = await buildAssembly(() => {});
  expect(framingFor(a, 'detentArm').radius).toBeGreaterThanOrEqual(0.03);
  expect(framingFor(a, 'rearWheel').radius).toBeGreaterThan(0.3);
});
```

- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the full gate.**
- [ ] **Step 5: Commit:** `feat: part focus with live facts`

# Stage 5: Teaching Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the page explain itself: guided lessons that set up and play each interesting situation, a "How it works" section that explains the mechanism and the simulation honestly, a glossary, and a model document the owner can read before showing the project.

**Architecture:** Lessons are data (`src/lessons/lessons.ts`): each step has text, an optional starting state, an optional scripted input, view settings and a checkable outcome. A small runner plays them through the existing driver as a third input source. Every lesson step is executed headlessly in tests and must produce the outcome its text claims, so the page can never explain something the simulation does not do. Explanatory copy lives in `src/content/` as typed data so tests can check it for coverage and banned wording.

**Tech Stack:** As before. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-16-motorcycle-transmission-design.md` (see "Owner requirement added during the build").

## Global Constraints

- Nothing on the page claims more than the model does. The words "simplified model" appear in the How it works section and in the Overview. Numbers are described as "representative of a middleweight sport bike", never as measured, never tied to a brand or model.
- Plain language: every technical term is either explained where it first appears or is in the glossary; sentences are short; no hype words ("revolutionary", "cutting-edge", "seamless", "powerful").
- Every figure quoted in copy is computed from `PARAMS` or `kinematics.ts` at render time, or is covered by a test that fails if `PARAMS` changes.
- No saved data: lesson progress lives in memory for the session only (the spec's non-goal).
- Lessons never trap the visitor: Exit is always available, Escape exits, and any ride control ends the scripted part of a step and hands over.
- Keyboard and screen-reader access for everything; step text is announced through a polite live region.
- No new dependencies. Colours from tokens; signal means only "carrying torque".
- After every task: `npm test`, `npm run typecheck`, `npm run build`, `npm run size` clean.

## Review Focus

1. **A lesson started while the visitor is mid-ride at speed:** the step's starting state replaces the simulation state cleanly; nothing carries over (held keys released). Test in Task 2.
2. **A step whose scripted event does not happen in time:** the runner times out, says so in the step card, and offers Retry rather than waiting forever. Test in Task 2.
3. **Leaving a lesson that changed view settings (x-ray, explode, slow motion, camera):** every setting returns to what it was. Test in Task 2.
4. **Copy drift:** a number in the explanation that no longer matches `PARAMS`. Test in Task 4.
5. **Reduced motion:** lessons still work; scripted steps play only after the visitor presses Play. Test in Task 3.

---

### Task 1: Lesson data and headless verification

**Files:** Create `src/lessons/types.ts`, `src/lessons/lessons.ts`. Test `tests/lessons/lessons.test.ts`.

**Interfaces:**
- Produces:

```ts
export interface LessonStep {
  id: string;
  title: string;                       // 2 to 5 words
  text: string;                        // 1 to 3 short sentences; what to watch for and why it happens
  start?: 'reset' | 'keep' | { gear: GearId; rpm: number } | { engineOff: true; drumDeg?: number; misaligned?: SliderId };
  script?: InputSource;                // scripted rider for this step; built with keyframes()/pedalStroke()
  seconds?: number;                    // how long the script runs before handing over (default 4)
  timeScale?: 1 | 0.25 | 0.05;
  view?: { xray?: boolean; explode?: boolean; schematic?: boolean; focus?: PartId; highlight?: PartId[] };
  outcome?: (final: SimState, trace: SimState[]) => boolean;   // must hold after the script; trace sampled every 5 ms
  tryIt?: string;                      // what the visitor should now try, one sentence
}
export interface Lesson { id: string; number: number; title: string; summary: string; steps: LessonStep[] }
export const LESSONS: Lesson[];
export function startState(step: LessonStep): DeepPartial<SimState> | 'reset' | 'keep';   // resolves `start` to a setState patch
```

The nine lessons, each with 3 to 6 steps. The implementer writes the step text from these outlines, in the voice of the constraints; every scripted step has an `outcome`:

1. **Meet the gearbox.** No script. Steps focus and highlight in turn: the clutch, the input shaft and its gears, the output shaft, the dogs (exploded), the forks and drum, the final drive. Text says what each does.
2. **Pull the clutch.** Engine idling in neutral. Script pulls the lever, holds, releases. Outcome: capacity reaches 0 while held, and the input shaft keeps turning from drag. Text: plates separate, the engine is disconnected, but oil drag still spins the shaft a little.
3. **First gear and the clunk.** Script: lever in, pedal down. Slow motion ¼×, x-ray. Outcome: gear 1 locks and the input shaft speed drops to near zero in under 50 ms. Text: the spinning input shaft is stopped dead by the dogs; that is the clunk.
4. **Pulling away.** From first with the lever in. Script: feed the clutch out with some throttle. Outcome: slip is observed, then the clutch locks, the engine never stalls, the bike is moving. Text: slip lets a spinning engine meet a stationary wheel.
5. **Up through the gears.** From second at 6,000 rpm. Script: three clutched upshifts. Outcome: reaches fifth, and the torque path lists a different gear pair each time. Text: every pair is always meshed; only the dogs choose which one carries torque.
6. **Why you can shift without the clutch.** From second at 8,000 rpm, full throttle. Script: preload the pedal (refused), then dip the throttle (shift goes through). Slow motion ¼×. Outcome: gear stays 2 while loaded, becomes 3 within 0.3 s of the throttle dip. Text: loaded dogs are pinched; unload them for an instant and they slide free.
7. **A missed shift.** From second with the lever in. Script: a short pedal stroke that leaves the drum between detents. Outcome: no gear locked and `drum.detent` is null; then a full stroke finds third. Text: the drum stopped between positions, so no dog is engaged: a false neutral.
8. **How the drum picks a gear.** Engine off, exploded, schematic shown. No script. Text tells the visitor to drag the drum and watch each groove move one fork; then to turn the rear wheel when a dog is blocked. `tryIt` steps only.
9. **Stalling and restarting.** Idling in first, lever in. Script: dump the clutch with no throttle. Outcome: engine not running. Then text on restarting: lever in, starter. Second scripted step restarts. Outcome: running again.

- [ ] **Step 1: Write the failing test:**

```ts
test('nine lessons, numbered in order, each with three to six steps', () => {
  expect(LESSONS.map((l) => l.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  for (const l of LESSONS) { expect(l.steps.length).toBeGreaterThanOrEqual(3); expect(l.steps.length).toBeLessThanOrEqual(6); }
});
test('step text is short, plain and complete', () => {
  const banned = /\b(revolutionary|cutting-edge|seamless|powerful|simply|just)\b/i;
  for (const l of LESSONS) for (const s of l.steps) {
    expect(s.text.split(/[.!?]\s/).length, `${l.id}/${s.id}`).toBeLessThanOrEqual(3);
    expect(s.text.length).toBeLessThanOrEqual(260); expect(s.text).not.toMatch(banned);
    if (s.script) expect(s.outcome, `${l.id}/${s.id} has a script but no outcome`).toBeDefined();
  }
});
test('every scripted step does what its text claims', () => {
  for (const l of LESSONS) for (const s of l.steps) {
    if (!s.script) continue;
    const sim = createSimulation(); const st = startState(s);
    if (st !== 'keep' && st !== 'reset') sim.setState(st);
    const trace: SimState[] = []; let n = 0;
    const final = runSource(sim, s.script, s.seconds ?? 4, (x) => { if (n++ % 10 === 0) trace.push(structuredClone(x)); });
    expect(s.outcome!(final, trace), `${l.id}/${s.id}`).toBe(true);
  }
});
```

- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement.** Steps with `start: 'keep'` are run in the test after the previous step of the same lesson; structure the test loop accordingly so chained steps share one simulation.
- [ ] **Step 4: Run the full gate.**
- [ ] **Step 5: Commit:** `feat: nine lessons as data, each verified against the simulation`

### Task 2: Lesson runner

**Files:** Create `src/lessons/runner.ts`. Modify `src/app/driver.ts` (a `'lesson'` mode). Test `tests/lessons/runner.test.ts`.

**Interfaces:**
- Produces:

```ts
export type RunnerPhase = 'idle' | 'ready' | 'playing' | 'handover' | 'timed-out';
export interface LessonRunner {
  start(lessonId: string): void; next(): void; prev(): void; exit(): void; play(): void; retry(): void;
  readonly lesson: Lesson | null; readonly stepIndex: number; readonly phase: RunnerPhase;
  readonly completed: ReadonlySet<string>;          // lesson ids finished this session
  onChange(fn: () => void): void;
  tick(state: SimState): void;                       // called each frame; advances playing -> handover or timed-out
}
export interface RunnerHooks {
  setState(patch: DeepPartial<SimState> | 'reset'): void;
  setSource(source: InputSource | null): void;       // null returns control to the visitor
  releaseControls(): void;
  applyView(view: LessonStep['view'] | null, timeScale: number | null): void;   // null restores what the visitor had
}
export function createLessonRunner(hooks: RunnerHooks, opts: { autoPlay: boolean }): LessonRunner;
```

Rules: entering a step releases held controls, applies its start state and view, and is `ready`; with `autoPlay` it moves straight to `playing`, otherwise it waits for `play()`. A scripted step plays for `seconds`, then checks `outcome`: true gives `handover` (visitor in control, `tryIt` shown), false gives `timed-out` (with Retry). Steps without a script go straight to `handover`. Finishing the last step marks the lesson completed. `exit()` from any phase restores the visitor's view settings and time scale and returns control. The driver gains mode `'lesson'`; the mode chip reads "Lesson" during it.

- [ ] **Step 1: Write the failing test** (fake hooks record calls; a real simulation drives `tick`):

```ts
test('a scripted step plays, verifies and hands over', () => { /* start lesson 3; phase ready -> play() -> playing; run the sim with the hooked source for the step's seconds while calling tick; expect phase 'handover' and setSource(null) called last */ });
test('starting a lesson releases held controls and replaces the state', () => { /* expect releaseControls then setState called before any setSource */ });
test('a step whose outcome fails times out and can be retried', () => { /* inject a lesson with outcome () => false; expect 'timed-out'; retry() -> 'ready' with the start state applied again */ });
test('exit restores view settings and time scale', () => { /* applyView(step.view, 0.25) on enter; applyView(null, null) on exit; phase 'idle' */ });
test('next past the last step completes the lesson; prev at the first step stays', () => { /* completed has the id */ });
test('without autoPlay nothing plays until play() is called', () => { /* phase stays 'ready' across ticks */ });
```

Write these as real tests with assertions; the comments state what each must check.

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the full gate.**
- [ ] **Step 5: Commit:** `feat: lesson runner with verification, hand-over and clean exit`

### Task 3: Lesson strip and step card

**Files:** Create `src/ui/lessons.ts`. Modify `index.html`, `src/main.ts`, `src/ui/styles.css`, `src/ui/panel.ts`, `src/app/keys.ts`. Test `tests/ui/lessonsView.test.ts` (pure view-model only).

**Interfaces:**
- Produces:

```ts
export interface StepCardModel { heading: string; counter: string; text: string; tryIt: string | null; primary: { label: string; action: 'play' | 'next' | 'retry' | 'finish' }; canGoBack: boolean; status: string | null }
export function stepCardModel(runner: Pick<LessonRunner, 'lesson' | 'stepIndex' | 'phase'>): StepCardModel | null;   // pure
export function mountLessons(strip: HTMLElement, card: HTMLElement, runner: LessonRunner): void;
```

Rules:
- A strip of nine numbered lesson buttons along the bottom of the page, under the control deck, at 900px and wider (each: number, title, a tick when completed this session; the current one marked with `aria-current`). Below 900px the strip is a "Lessons" tab in the information panel.
- The step card sits at the top-left of the stage: lesson title and "Step 2 of 5", the text, the `tryIt` line when in hand-over, Back and the primary button (Play / Next / Try again / Finish), and Exit. `Escape` exits. `KeyN` is Next.
- `status`: "Playing…" while a script runs; on time-out: "That did not go as planned. Try again."
- Step text changes are announced through the polite live region.
- Under reduced motion the runner is created with `autoPlay: false`.
- The first-time hint in the Overview tab points at lesson 1.

- [ ] **Step 1: Write the failing test:**

```ts
test('card model follows the runner phase', () => {
  const L = LESSONS[2];
  expect(stepCardModel({ lesson: null, stepIndex: 0, phase: 'idle' })).toBeNull();
  expect(stepCardModel({ lesson: L, stepIndex: 0, phase: 'ready' })!.primary).toEqual({ label: 'Play', action: 'play' });
  expect(stepCardModel({ lesson: L, stepIndex: 0, phase: 'playing' })!.status).toBe('Playing…');
  expect(stepCardModel({ lesson: L, stepIndex: 0, phase: 'timed-out' })!.primary.action).toBe('retry');
  const last = stepCardModel({ lesson: L, stepIndex: L.steps.length - 1, phase: 'handover' })!;
  expect(last.primary.action).toBe('finish'); expect(last.counter).toBe(`Step ${L.steps.length} of ${L.steps.length}`); expect(last.canGoBack).toBe(L.steps.length > 1);
});
```

- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement and wire** (`RunnerHooks` implemented in `main.ts` over the simulation, driver, controls, time control and view options).
- [ ] **Step 4: Run the full gate.**
- [ ] **Step 5: Commit:** `feat: lesson strip and step card`

### Task 4: How it works, glossary and the model document

**Files:** Create `src/content/howItWorks.ts`, `src/content/glossary.ts`, `docs/MODEL.md`. Modify `src/ui/panel.ts`, `index.html` (noscript), `src/ui/styles.css`. Test `tests/content/content.test.ts`.

**Interfaces:**
- Produces:

```ts
export interface Section { id: string; heading: string; blocks: Array<{ kind: 'p'; text: string } | { kind: 'list'; items: string[] } | { kind: 'formula'; label: string; expr: string; where: string } | { kind: 'table'; head: string[]; rows: string[][] }> }
export function howItWorks(): Section[];           // built from PARAMS so figures cannot drift
export interface Term { term: string; definition: string }   // one sentence
export const GLOSSARY: Term[];
```

`howItWorks()` sections, in order, written for a reader who has never seen a gearbox and for the owner who did not write the code:

1. **What you are looking at.** A wet multi-plate clutch and a six-speed sequential constant-mesh gearbox. Says plainly: "This is a simplified model."
2. **The parts, in the order torque flows.** One line each, crank to rear wheel.
3. **Constant mesh, in one paragraph.** Every gear pair is always meshed; on each pair one gear is fixed to its shaft and the other spins free; a shift locks a free gear to its shaft with dogs.
4. **What happens in one shift,** as numbered steps: pedal turns the drum one step; a groove moves a fork; the fork slides a gear; its dogs meet the next gear's dogs; if they line up they drop in, otherwise they wait until rotation lines them up; the shaft speeds snap to the new ratio.
5. **The clutch.** Capacity formula with the numbers; locked, slipping and open; why there is drag when open.
6. **What the simulation computes.** The state it tracks; that it advances 2,000 times a second; engine torque map, clutch stick-slip, rigid ratios, dog alignment and blocking, the drum as a force balance, the bike as a mass with rolling and air resistance. Each with its formula block and a "where" line naming the symbols.
7. **What is simplified or left out.** A list: no engine internals; no tyre slip, lean, wheelies or suspension; gears and shafts rigid, no backlash dynamics or chain lash; a single friction coefficient with no heat or wear; standard involute teeth without profile shift; dog engagement as an instantaneous speed match; oil drag as a simple viscous term.
8. **Where the numbers come from.** A table of the main parameters with value and source. Source is one of: "Chosen as representative of a middleweight sport bike", "Derived from the values above", or "Tuned so the modelled shift behaves correctly" (drum friction, stiction, detent strength, damping, idle and autopilot constants). Followed by: "None of these are measurements of a real gearbox, and the model has not been checked by someone who rebuilds them."
9. **How it was checked.** The tests in plain words: ratios exact, road speed against hand calculation, a locked clutch has zero slip, never two gears at once, momentum conserved across an engagement, the shift pattern, and every lesson replayed against the simulation.

The panel gains a **How it works** tab rendering these sections (formulas in the mono font) and a **Glossary** section at its end; the `<noscript>` block gains sections 1 to 4 as static text. `docs/MODEL.md` contains the same nine sections in fuller form, plus: every tuned value with its before and after and why; known limits a sharp reviewer might probe; and "Questions you may be asked", at least twelve, each with a short honest answer (for example: why is neutral between first and second; why can it shift without the clutch; what would you measure to validate this; what is the timestep and why; how is the clutch's stick-slip handled numerically; what breaks if the dogs had no backlash).

- [ ] **Step 1: Write the failing test:**

```ts
test('the nine sections are present, in order, and say it is a simplified model', () => {
  const s = howItWorks(); expect(s.map((x) => x.id)).toEqual(['what', 'parts', 'constant-mesh', 'one-shift', 'clutch', 'computes', 'simplified', 'numbers', 'checked']);
  expect(JSON.stringify(s[0])).toMatch(/simplified model/i); expect(JSON.stringify(s[7])).toMatch(/not been checked|None of these are measurements/);
});
test('figures in the copy come from PARAMS', () => {
  const text = JSON.stringify(howItWorks());
  expect(text).toContain(clutchCapacityMax.toFixed(0)); expect(text).toContain(String(PARAMS.engine.limiterRpm.toLocaleString('en-US')));
  for (const [a, b] of Object.values(PARAMS.gears)) expect(text).toContain(`${a}:${b}`);
});
test('the numbers table labels every tuned drum value as tuned', () => {
  const rows = (howItWorks()[7].blocks.find((b) => b.kind === 'table') as { rows: string[][] }).rows;
  for (const name of ['Drum sliding friction', 'Drum static friction', 'Detent strength']) expect(rows.find((r) => r[0] === name)![2]).toMatch(/^Tuned/);
});
test('glossary covers the terms the page uses, one sentence each, no brands', () => {
  const terms = GLOSSARY.map((t) => t.term.toLowerCase());
  for (const need of ['constant mesh', 'dog', 'shift drum', 'shift fork', 'detent', 'false neutral', 'clutch slip', 'primary drive', 'final drive', 'torque', 'gear ratio', 'involute', 'spline', 'rev limiter', 'engine braking']) expect(terms).toContain(need);
  for (const t of GLOSSARY) expect(t.definition.trim().endsWith('.')).toBe(true);
});
test('no hype and no brand names anywhere in the content or the lessons', () => {
  const all = JSON.stringify([howItWorks(), GLOSSARY, LESSONS.map((l) => [l.title, l.summary, l.steps.map((s) => [s.title, s.text, s.tryIt])])]);
  expect(all).not.toMatch(/\b(revolutionary|cutting-edge|seamless|state-of-the-art)\b/i);
});
```

- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement the content, the tab and `docs/MODEL.md`.**
- [ ] **Step 4: Run the full gate.**
- [ ] **Step 5: Commit:** `feat: how it works, glossary and the model document`

# Stage 1: Simulation Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A headless, tested simulation of a motorcycle clutch and six-speed sequential gearbox that later stages draw.

**Architecture:** Pure TypeScript modules with no DOM or graphics imports. One `Simulation` object advances a fixed 0.5 ms timestep from an `Inputs` record and exposes a plain `SimState` snapshot; a visitor or a script supplies the inputs through the same interface. Each physical subsystem (engine, clutch, drum, dogs) is a file of pure functions that `simulation.ts` composes.

**Tech Stack:** TypeScript 5, Vitest. Nothing else in this stage (Vite and Three.js arrive in stages 2 and 3).

**Spec:** `docs/superpowers/specs/2026-11-16-motorcycle-transmission-design.md`

**Scope:** This plan covers stage 1 of the spec's six stages only. Each later stage gets its own plan after the previous one has been shown to the owner.

## Global Constraints

- No network calls, no DOM, no `Math.random`, no `Date` inside `src/sim/`. The simulation is deterministic.
- SI units throughout: rad, rad/s, N·m, kg·m², m, s. Degrees and rpm appear only through the `deg()` and `rpm()` helpers.
- No manufacturer or model name anywhere in code, comments or data.
- Dependencies: `typescript` and `vitest` as dev dependencies, from npm. Installing them needs the owner's approval by name before Task 1 runs.
- Git: the folder is not a repository. `git init` and every commit need the owner's go-ahead; never pass `-c user.name` or `-c user.email`.
- After every task run `npx vitest run` and `npx tsc --noEmit` and show the output.
- Every value in `params.ts` marked *tunable* may be changed to make this plan's tests pass; tooth counts, the drum angles and the shift pattern may not.

## Review Focus

1. **Out-of-range or non-finite inputs** (throttle 2, pedal NaN): clamped to range, NaN treated as 0, state stays finite. Test in Task 7.
2. **Pedal held down after a shift:** one stroke gives one shift; holding it does not keep shifting. Test in Task 5.
3. **A long gap between frames** (hidden tab, 30 s elapsed): `advance()` simulates at most 0.1 s per call. Test in Task 7.
4. **Brake and resistance at standstill:** braking or rolling resistance never pushes the bike backwards or makes speed oscillate about zero. Test in Task 7.
5. **Starter pressed in gear with the clutch out:** the bike lurches, state stays finite, no second gear locks. Test in Task 8.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/sim/params.ts` | Every physical constant, in one object |
| `src/sim/types.ts` | `Inputs`, `SimState`, `GearId`, `SliderId` |
| `src/sim/units.ts` | `deg`, `rpm`, `toRpm`, `toDeg`, `clamp`, `wrap` |
| `src/sim/kinematics.ts` | Ratios and speed relations from tooth counts |
| `src/sim/engine.ts` | Torque map, idle, limiter, start and stall |
| `src/sim/clutch.ts` | Capacity from lever, stick-slip torque |
| `src/sim/shiftDrum.ts` | Detent torque, groove profile, pedal ratchet |
| `src/sim/dogs.ts` | Alignment, engagement, withdrawal resistance |
| `src/sim/simulation.ts` | Composes the above; `createSimulation`, `step`, `advance` |
| `src/sim/inputScript.ts` | `InputSource`, scripted strokes, the autopilot rider |
| `tests/sim/*.test.ts` | One test file per source file, plus `scenarios.test.ts` |

---

### Task 1: Scaffold, units, parameters and types

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`, `src/sim/units.ts`, `src/sim/params.ts`, `src/sim/types.ts`
- Test: `tests/sim/units.test.ts`

**Interfaces:**
- Produces:

```ts
// units.ts
export const deg: (d: number) => number;      // degrees -> rad
export const toDeg: (r: number) => number;
export const rpm: (n: number) => number;      // rev/min -> rad/s
export const toRpm: (w: number) => number;
export const clamp: (x: number, lo: number, hi: number) => number; // NaN -> lo
export const wrap: (x: number, period: number) => number;          // into [0, period)

// types.ts
export type GearId = 1 | 2 | 3 | 4 | 5 | 6;
export type SliderId = 'A' | 'B' | 'C';
export interface Inputs {
  throttle: number;      // 0..1
  clutchLever: number;   // 0 released .. 1 fully pulled
  pedal: number;         // -1 full down .. +1 full up, 0 at rest
  brake: number;         // 0..1
  ignition: boolean;
  starter: boolean;
  handDrumTorque: number;       // N·m, for direct manipulation
  handWheelTorque: number;      // N·m at the rear wheel
  handInputShaftTorque: number; // N·m
}
export const NEUTRAL_INPUTS: Inputs; // all zero, ignition true, starter false
export interface SliderState { x: number; phi: number; locked: GearId | null; blocked: boolean; }
export interface SimState {
  t: number;
  engine: { omega: number; running: boolean; torque: number };
  clutch: { capacity: number; torque: number; slip: number; locked: boolean };
  inputShaftOmega: number;
  outputShaftOmega: number;
  roadSpeed: number;                 // m/s
  drum: { angle: number; omega: number };
  pedal: { armed: boolean; strokeStartAngle: number };
  sliders: Record<SliderId, SliderState>;
  lockedGear: GearId | null;         // null = neutral or false neutral
  dogTorque: number;                 // N·m through the locked dog, signed
}
```

`params.ts` exports `PARAMS` with exactly these values:

```ts
export const PARAMS = {
  dt: 1 / 2000,
  primary: { drive: 36, driven: 76 },
  // [teeth on input shaft, teeth on output shaft]; every pair sums to 50
  gears: { 1: [13, 37], 2: [17, 33], 3: [19, 31], 4: [21, 29], 5: [23, 27], 6: [24, 26] },
  final: { front: 16, rear: 45 },
  wheelRadius: 0.31,
  mass: 270,                     // bike plus rider, kg
  wheelInertia: 1.0,             // both wheels, kg·m²
  cdA: 0.35, crr: 0.015, airDensity: 1.225, g: 9.81,
  brakeMaxTorque: 600,           // N·m at the rear wheel
  engine: {
    inertia: 0.012,              // at the crank
    // [rpm, N·m] at full throttle, linear between points
    torqueCurve: [[1000, 30], [4000, 42], [8000, 55], [11000, 60], [13500, 56], [15000, 48]],
    closedThrottle: { base: -4, perRpm: -0.0012 }, // N·m = base + perRpm * rpm
    idleRpm: 1300, idleMaxThrottle: 0.4,          // tunable
    limiterRpm: 15000,
    stallRpm: 400, startRpm: 600, starterTorque: 15,
  },
  clutch: {
    surfaces: 16, mu: 0.12, clampForce: 1800, meanRadius: 0.058, // capacity ≈ 200 N·m
    leverFullRelease: 0.7,       // capacity is zero at and beyond this lever position
    dragCoeff: 0.004, dragMax: 1.5,               // tunable
  },
  inputShaft: { inertia: 0.004, friction: 0.05 },  // tunable
  drum: {
    // detent angles in degrees
    detents: { 1: 0, N: 30, 2: 60, 3: 120, 4: 180, 5: 240, 6: 300 },
    inertia: 2e-4, friction: 0.25, damping: 0.5,   // kg·m², N·m, N·m·s/rad; tunable
    detentPeak: 2.5, neutralDetentPeak: 0.8,       // N·m, tunable
    grooveFullDeg: 8, grooveZeroDeg: 22,
    strokeDeg: 62, strokeFromNeutralDeg: 32,
    pawlStiffness: 3, footTorqueMax: 8,            // N·m/deg and N·m at the drum, tunable
  },
  // which gear each slider locks when moved negative / positive
  sliders: {
    A: { shaft: 'output', neg: 1, pos: 3 },
    B: { shaft: 'output', neg: 4, pos: 2 },
    C: { shaft: 'input',  neg: 5, pos: 6 },
  },
  dogs: {
    count: 5, windowDeg: 16,     // 72° pitch; a dog can enter over 16° of it
    contactX: 0.5,               // |x| at which dog faces meet
    radius: 0.03, mu: 0.15,
    // a fork can lag its groove by forkCompliance (in x units) before the drum goes solid
    forkCompliance: 0.25, forkForceMax: 400, sliderRate: 40, // x units, N, 1/s; tunable
  },
} as const;
```

- [ ] **Step 1: With the owner's approval, run `git init`, `npm init -y`, `npm i -D typescript vitest`.** `tsconfig.json`: `strict`, `target` and `module` ES2022, `moduleResolution` bundler, `noEmit`, include `src` and `tests`. `.gitignore`: `node_modules`, `dist`. `package.json` scripts: `"test": "vitest run"`, `"typecheck": "tsc --noEmit"`.
- [ ] **Step 2: Write the failing test** `tests/sim/units.test.ts`:

```ts
test('unit helpers', () => {
  expect(deg(180)).toBeCloseTo(Math.PI, 12);
  expect(toRpm(rpm(1300))).toBeCloseTo(1300, 9);
  expect(clamp(2, 0, 1)).toBe(1);
  expect(clamp(NaN, 0, 1)).toBe(0);
  expect(wrap(deg(-10), deg(72))).toBeCloseTo(deg(62), 12);
});
test('every gear pair shares one centre distance', () => {
  for (const [a, b] of Object.values(PARAMS.gears)) expect(a + b).toBe(50);
});
```

- [ ] **Step 3: Run `npx vitest run tests/sim/units.test.ts`.** Expected: FAIL, modules not found.
- [ ] **Step 4: Create `units.ts`, `params.ts` and `types.ts` as specified above.**
- [ ] **Step 5: Run `npx vitest run` and `npx tsc --noEmit`.** Expected: 2 passed, no type errors.
- [ ] **Step 6: Commit** (with go-ahead): `chore: scaffold simulation core with parameters and types`

### Task 2: Kinematics

**Files:** Create `src/sim/kinematics.ts`. Test `tests/sim/kinematics.test.ts`.

**Interfaces:**
- Consumes: `PARAMS`, `GearId`.
- Produces:

```ts
export const primaryRatio: number;                    // 76/36
export const finalRatio: number;                      // 45/16
export const gearRatio: (g: GearId) => number;        // output teeth / input teeth
export const overallRatio: (g: GearId) => number;     // crank rev per wheel rev
export const roadSpeed: (outputOmega: number) => number;        // m/s
export const outputOmegaFromRoad: (v: number) => number;
// speed of the free-spinning gear of pair g, given both shaft speeds
export const freeGearOmega: (g: GearId, inputOmega: number, outputOmega: number) => number;
export const reflectedVehicleInertia: number;         // (m r² + wheelInertia) / finalRatio², at the output shaft
```

`freeGearOmega`: for gears 1 to 4 the free gear is on the output shaft and turns at `inputOmega / gearRatio(g)`; for 5 and 6 it is on the input shaft and turns at `outputOmega * gearRatio(g)`.

- [ ] **Step 1: Write the failing test:**

```ts
test('ratios come from tooth counts', () => {
  expect(gearRatio(1)).toBeCloseTo(37 / 13, 12);
  expect(gearRatio(6)).toBeCloseTo(26 / 24, 12);
  expect(overallRatio(1)).toBeCloseTo(16.8990, 3);
  expect(overallRatio(6)).toBeCloseTo(6.4323, 3);
});
test('road speed at 10 000 rpm matches the hand calculation', () => {
  const v = (g: GearId) => roadSpeed(rpm(10000) / primaryRatio / gearRatio(g));
  expect(v(1)).toBeCloseTo(19.21, 2);
  expect(v(6)).toBeCloseTo(50.47, 2);
});
test('ratios fall monotonically from first to sixth', () => {
  for (const g of [1, 2, 3, 4, 5] as const) expect(gearRatio(g)).toBeGreaterThan(gearRatio((g + 1) as GearId));
});
test('the free gear of the locked pair turns with its shaft', () => {
  const wOut = 40;
  expect(freeGearOmega(3, wOut * gearRatio(3), wOut)).toBeCloseTo(wOut, 9);   // on the output shaft
  expect(freeGearOmega(5, wOut * gearRatio(5), wOut)).toBeCloseTo(wOut * gearRatio(5), 9); // on the input shaft
});
test('reflected vehicle inertia', () => {
  expect(reflectedVehicleInertia).toBeCloseTo((270 * 0.31 ** 2 + 1.0) / (45 / 16) ** 2, 9);
});
```

- [ ] **Step 2: Run it.** Expected: FAIL, module not found.
- [ ] **Step 3: Implement `kinematics.ts`.**
- [ ] **Step 4: Run `npx vitest run` and `npx tsc --noEmit`.** Expected: all pass.
- [ ] **Step 5: Commit:** `feat: gearbox kinematics from tooth counts`

### Task 3: Engine

**Files:** Create `src/sim/engine.ts`. Test `tests/sim/engine.test.ts`.

**Interfaces:**
- Produces:

```ts
export const fullThrottleTorque: (omega: number) => number;  // interpolated curve; curve end values held outside its range; 0 above the limiter
export const closedThrottleTorque: (omega: number) => number; // negative
// net crank torque before the clutch load; includes idle control, limiter and starter
export function engineTorque(omega: number, running: boolean, throttle: number, ignition: boolean, starter: boolean): number;
// start/stall transition
export function nextRunning(omega: number, running: boolean, ignition: boolean): boolean;
```

Rules: when running, torque = closed + effectiveThrottle × (full − closed), where effectiveThrottle is the larger of the rider's throttle and an idle term that rises linearly from 0 at `idleRpm` to `idleMaxThrottle` at `idleRpm − 300`. When not running, torque = closed-throttle torque, plus `starterTorque` if `starter` and `ignition`, and never negative at zero speed. `nextRunning`: becomes true above `startRpm` with ignition on; becomes false below `stallRpm` or when ignition is off.

- [ ] **Step 1: Write the failing test:**

```ts
test('torque curve', () => {
  expect(fullThrottleTorque(rpm(11000))).toBeCloseTo(60, 9);
  expect(fullThrottleTorque(rpm(6000))).toBeCloseTo(48.5, 9);
  expect(fullThrottleTorque(rpm(15001))).toBe(0);
});
test('closed throttle brakes the engine', () => {
  expect(closedThrottleTorque(rpm(10000))).toBeCloseTo(-16, 9);
});
test('idle control holds the engine up below idle speed', () => {
  expect(engineTorque(rpm(1000), true, 0, true, false)).toBeGreaterThan(0);
  expect(engineTorque(rpm(3000), true, 0, true, false)).toBeLessThan(0);
});
test('start and stall', () => {
  expect(nextRunning(rpm(650), false, true)).toBe(true);
  expect(nextRunning(rpm(650), false, false)).toBe(false);
  expect(nextRunning(rpm(350), true, true)).toBe(false);
  expect(nextRunning(rpm(3000), true, false)).toBe(false);
  expect(engineTorque(0, false, 0, true, true)).toBeCloseTo(15, 9);
  expect(engineTorque(0, false, 1, true, false)).toBe(0);
});
```

- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement `engine.ts`.**
- [ ] **Step 4: Run `npx vitest run` and `npx tsc --noEmit`.** Expected: all pass.
- [ ] **Step 5: Commit:** `feat: engine torque, idle, limiter, start and stall`

### Task 4: Clutch

**Files:** Create `src/sim/clutch.ts`. Test `tests/sim/clutch.test.ts`.

**Interfaces:**
- Produces:

```ts
export const clutchCapacityMax: number; // surfaces * mu * clampForce * meanRadius
export const clutchCapacity: (lever: number) => number; // falls linearly to 0 at leverFullRelease
export const clutchDrag: (slip: number) => number;      // viscous, sign of slip, capped at dragMax
// Torque the clutch applies to the input shaft (and the opposite to the basket).
// slip = basket speed - input shaft speed; lockTorque = torque that would hold slip at zero this step.
export function clutchTorque(slip: number, lockTorque: number, capacity: number): { torque: number; locked: boolean };
```

`clutchTorque`: with |slip| under 0.05 rad/s and |lockTorque| ≤ capacity it returns `lockTorque` and `locked: true`; otherwise it returns `sign(slip) × capacity + clutchDrag(slip)` (using `sign(lockTorque)` when slip is exactly zero) and `locked: false`.

- [ ] **Step 1: Write the failing test:**

```ts
test('capacity', () => {
  expect(clutchCapacityMax).toBeCloseTo(200.448, 3);
  expect(clutchCapacity(0)).toBeCloseTo(clutchCapacityMax, 9);
  expect(clutchCapacity(0.35)).toBeCloseTo(clutchCapacityMax / 2, 9);
  expect(clutchCapacity(0.7)).toBe(0);
  expect(clutchCapacity(1)).toBe(0);
});
test('a locked clutch carries exactly the load, with no slip', () => {
  expect(clutchTorque(0, 80, 200)).toEqual({ torque: 80, locked: true });
});
test('a slipping clutch transmits exactly its capacity plus drag', () => {
  const r = clutchTorque(50, 300, 120);
  expect(r.locked).toBe(false);
  expect(r.torque).toBeCloseTo(120 + clutchDrag(50), 9);
  expect(clutchTorque(-50, -300, 120).torque).toBeCloseTo(-120 + clutchDrag(-50), 9);
});
test('an open clutch still drags', () => {
  expect(clutchTorque(60, 0, 0).torque).toBeCloseTo(0.24, 9);
  expect(clutchDrag(10000)).toBe(1.5);
});
```

- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement `clutch.ts`.**
- [ ] **Step 4: Run `npx vitest run` and `npx tsc --noEmit`.** Expected: all pass.
- [ ] **Step 5: Commit:** `feat: wet clutch capacity, stick-slip and drag`

### Task 5: Shift drum, detent, grooves and pedal ratchet

**Files:** Create `src/sim/shiftDrum.ts`. Test `tests/sim/shiftDrum.test.ts`.

**Interfaces:**
- Produces:

```ts
export const DRUM_MIN: number;  // deg(0)
export const DRUM_MAX: number;  // deg(300)
export const detentTorque: (angle: number) => number;  // restoring torque from the star wheel
export const nearestDetent: (angle: number) => { name: 1 | 2 | 3 | 4 | 5 | 6 | 'N'; angle: number; error: number };
// commanded slider position in [-1, 1] for a drum angle
export const grooveCommand: (slider: SliderId, angle: number) => number;
// pedal ratchet: returns the torque the pawl puts on the drum and the updated ratchet state
export function pawlTorque(
  pedal: number, drumAngle: number, ratchet: { armed: boolean; strokeStartAngle: number },
): { torque: number; ratchet: { armed: boolean; strokeStartAngle: number } };
// one timestep of drum motion under pawl, detent, friction and hand torque, with hard stops
export function stepDrum(
  drum: { angle: number; omega: number }, appliedTorque: number, dt: number,
): { angle: number; omega: number };
```

Rules:
- **Detent:** zero torque at every detent angle and at the peak between neighbours. Between gear detents 60° apart it is `−detentPeak × sin(2π(θ − θd)/60°)`. Between 0° and 60° there are three wells (1st, N, 2nd) 30° apart; the half-wells that belong to N use `neutralDetentPeak` and period 30°, the half-wells belonging to 1st and 2nd use `detentPeak` and period 30°.
- **Groove:** a slider is commanded fully toward a gear within `grooveFullDeg` of that gear's detent, zero beyond `grooveZeroDeg`, linear between. Sign is negative for the slider's `neg` gear and positive for its `pos` gear.
- **Pawl:** while `|pedal| < 0.05` the ratchet is armed and records the current drum angle as `strokeStartAngle`; the torque is 0. Once `|pedal| ≥ 0.05` it disarms and stays disarmed until the pedal returns under 0.05. While disarmed the target angle is `strokeStartAngle + sign(pedal) × |pedal| × stroke`, where stroke is `strokeFromNeutralDeg` if the stroke started within 5° of the N detent, else `strokeDeg`; the target is clamped to the drum stops. Torque is `pawlStiffness × (target − angle)`, capped at `footTorqueMax`, and only ever in the direction of the stroke (the pawl pushes, never pulls back).
- **stepDrum:** viscous `damping` opposes velocity; its time constant (inertia / damping) is shorter than `dt`, so integrate the damping term implicitly. Coulomb friction of `friction` N·m opposes motion and holds the drum still when the applied torque is below it. Angle is limited to [0°, 300°] with velocity zeroed at a stop. The implementer may sub-step internally for stability.

- [ ] **Step 1: Write the failing test:**

```ts
const settle = (startDeg: number, pedalTrace: (t: number) => number, seconds = 1) => {
  // integrates pawl + detent only (no forks): returns the final drum angle in degrees
  let drum = { angle: deg(startDeg), omega: 0 };
  let ratchet = { armed: true, strokeStartAngle: drum.angle };
  for (let t = 0; t < seconds; t += PARAMS.dt) {
    const p = pawlTorque(pedalTrace(t), drum.angle, ratchet);
    ratchet = p.ratchet;
    drum = stepDrum(drum, p.torque + detentTorque(drum.angle), PARAMS.dt);
  }
  return toDeg(drum.angle);
};
const stroke = (amount: number) => (t: number) => (t < 0.15 ? amount : 0);

test('detent pulls toward each gear and neutral is the weakest', () => {
  for (const a of [0, 30, 60, 120, 180, 240, 300]) expect(detentTorque(deg(a))).toBeCloseTo(0, 9);
  expect(detentTorque(deg(125))).toBeLessThan(0);
  expect(detentTorque(deg(115))).toBeGreaterThan(0);
  expect(Math.abs(detentTorque(deg(33)))).toBeLessThan(Math.abs(detentTorque(deg(123))));
});
test('grooves command one slider per gear', () => {
  const at = (a: number) => (['A', 'B', 'C'] as const).map((s) => grooveCommand(s, deg(a)));
  expect(at(0)).toEqual([-1, 0, 0]);
  expect(at(30)).toEqual([0, 0, 0]);
  expect(at(60)).toEqual([0, 1, 0]);
  expect(at(120)).toEqual([1, 0, 0]);
  expect(at(180)).toEqual([0, -1, 0]);
  expect(at(240)).toEqual([0, 0, -1]);
  expect(at(300)).toEqual([0, 0, 1]);
  expect(at(90)).toEqual([0, 0, 0]);          // between gears nothing is commanded
  expect(grooveCommand('A', deg(15))).toBeCloseTo(-0.5, 9);
});
test('at no drum angle are two sliders commanded at once', () => {
  for (let a = 0; a <= 300; a += 0.5) {
    const n = (['A', 'B', 'C'] as const).filter((s) => grooveCommand(s, deg(a)) !== 0).length;
    expect(n).toBeLessThanOrEqual(1);
  }
});
test('full strokes walk the pattern 1-N-2-3-4-5-6 and stop at both ends', () => {
  expect(settle(0, stroke(+1))).toBeCloseTo(60, 0);    // 1st -> 2nd, past neutral
  expect(settle(0, stroke(+0.5))).toBeCloseTo(30, 0);  // half stroke finds neutral
  expect(settle(30, stroke(+1))).toBeCloseTo(60, 0);
  expect(settle(30, stroke(-1))).toBeCloseTo(0, 0);
  expect(settle(60, stroke(+1))).toBeCloseTo(120, 0);
  expect(settle(240, stroke(+1))).toBeCloseTo(300, 0);
  expect(settle(300, stroke(+1))).toBeCloseTo(300, 0);
  expect(settle(0, stroke(-1))).toBeCloseTo(0, 0);
  expect(settle(180, stroke(-1))).toBeCloseTo(120, 0);
});
test('a short stroke does not change gear', () => {
  expect(settle(120, stroke(+0.3))).toBeCloseTo(120, 0);
});
test('holding the pedal gives one shift, not several', () => {
  expect(settle(60, () => +1, 2)).toBeLessThan(125);
});
test('the drum can rest between detents', () => {
  expect(toDeg(stepDrum({ angle: deg(90), omega: 0 }, detentTorque(deg(90)), PARAMS.dt).angle)).toBeCloseTo(90, 6);
});
```

- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement `shiftDrum.ts`.** Tune only the values marked tunable.
- [ ] **Step 4: Run `npx vitest run` and `npx tsc --noEmit`.** Expected: all pass.
- [ ] **Step 5: Commit:** `feat: shift drum detent, grooves and pedal ratchet`

### Task 6: Dogs

**Files:** Create `src/sim/dogs.ts`. Test `tests/sim/dogs.test.ts`.

**Interfaces:**
- Consumes: `SliderState`, `grooveCommand`, kinematics.
- Produces:

```ts
export const dogAligned: (phi: number) => boolean;   // wrap(phi, 2π/count) < deg(windowDeg)
// which gear a slider is heading for at position x, or null near centre
export const targetGear: (slider: SliderId, x: number) => GearId | null;
// speeds after a dog locks pair g, from inertias on each side
export function engageSpeeds(
  g: GearId, inputOmega: number, outputOmega: number, inputInertia: number, outputInertia: number,
): { inputOmega: number; outputOmega: number };
// axial force needed to pull a loaded dog out
export const withdrawalForce: (dogTorque: number) => number; // mu * |T| / radius
// one timestep for one slider
export function stepSlider(
  slider: SliderId, s: SliderState, command: number, relativeOmega: number, dogTorque: number, dt: number,
): { state: SliderState; justLocked: GearId | null; forkForce: number };
```

Rules for `stepSlider`:
- `phi` advances by `relativeOmega × dt` (slider speed minus the speed of the free gear it is heading for).
- Fork force is `forkForceMax × clamp((command − x) / forkCompliance, −1, 1)`. The slider moves toward the command at up to `sliderRate` per second.
- **Engaging:** moving outward, the slider stops at `|x| = contactX` with `blocked: true` unless `dogAligned(phi)`; once aligned it passes, `locked` becomes the target gear and `justLocked` reports it for that step only.
- **Withdrawing:** a locked slider moves back toward centre only when `|forkForce| > withdrawalForce(dogTorque)`. `locked` clears when `|x|` falls under `contactX`.
- `engageSpeeds` conserves `g × Jin × ωin + Jout × ωout` and ends with `ωin = g × ωout`, where g is `gearRatio(g)`.

- [ ] **Step 1: Write the failing test:**

```ts
const free = (): SliderState => ({ x: 0, phi: 0, locked: null, blocked: false });
const run = (s: SliderState, command: number, relOmega: number, torque: number, seconds: number) => {
  let locked: GearId | null = null;
  for (let t = 0; t < seconds; t += PARAMS.dt) {
    const r = stepSlider('A', s, command, relOmega, torque, PARAMS.dt);
    s = r.state; locked = r.justLocked ?? locked;
  }
  return { s, locked };
};

test('alignment window is 16 of every 72 degrees', () => {
  expect(dogAligned(deg(5))).toBe(true);
  expect(dogAligned(deg(20))).toBe(false);
  expect(dogAligned(deg(72 + 5))).toBe(true);
  expect(dogAligned(deg(-60))).toBe(true);
});
test('aligned dogs drop straight in', () => {
  const { s } = run({ ...free(), phi: deg(5) }, -1, 0, 0, 0.2);
  expect(s.locked).toBe(1);
  expect(s.x).toBeCloseTo(-1, 3);
});
test('face-to-face dogs wait at contact until rotation lines them up', () => {
  const stuck = run({ ...free(), phi: deg(40) }, -1, 0, 0, 0.2).s;
  expect(stuck.locked).toBeNull();
  expect(stuck.blocked).toBe(true);
  expect(stuck.x).toBeCloseTo(-0.5, 6);
  expect(run(stuck, -1, deg(200), 0, 0.5).s.locked).toBe(1);
});
test('a loaded dog will not withdraw; an unloaded one will', () => {
  const engaged: SliderState = { x: -1, phi: deg(5), locked: 1, blocked: false };
  expect(withdrawalForce(360)).toBeCloseTo(1800, 9);
  expect(run(engaged, 0, 0, 360, 0.3).s.locked).toBe(1);
  expect(run(engaged, 0, 0, 20, 0.3).s.locked).toBeNull();
});
test('engagement matches speeds and conserves momentum', () => {
  const g = gearRatio(2), Jin = 0.004, Jout = reflectedVehicleInertia;
  const r = engageSpeeds(2, 400, 30, Jin, Jout);
  expect(r.inputOmega).toBeCloseTo(g * r.outputOmega, 9);
  expect(g * Jin * r.inputOmega + Jout * r.outputOmega).toBeCloseTo(g * Jin * 400 + Jout * 30, 9);
});
test('slider sign picks the gear', () => {
  expect(targetGear('A', -0.6)).toBe(1);
  expect(targetGear('A', 0.6)).toBe(3);
  expect(targetGear('B', 0.6)).toBe(2);
  expect(targetGear('C', -0.6)).toBe(5);
  expect(targetGear('C', 0)).toBeNull();
});
```

- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement `dogs.ts`.**
- [ ] **Step 4: Run `npx vitest run` and `npx tsc --noEmit`.** Expected: all pass.
- [ ] **Step 5: Commit:** `feat: dog engagement, blocking and loaded withdrawal`

### Task 7: The simulation

**Files:** Create `src/sim/simulation.ts`. Test `tests/sim/simulation.test.ts`.

**Interfaces:**
- Consumes: everything from Tasks 1 to 6.
- Produces:

```ts
export interface Simulation {
  getState(): SimState;                    // a fresh copy each call
  setState(patch: DeepPartial<SimState>): void; // for scenarios and tests
  step(inputs: Inputs): void;              // exactly one PARAMS.dt
  advance(inputs: Inputs, seconds: number): number; // steps for min(seconds, 0.1); returns seconds simulated
  reset(): void;                           // standstill, neutral, engine running at idle
}
export function createSimulation(): Simulation;
export function sanitizeInputs(raw: Partial<Inputs>): Inputs; // clamps ranges, NaN -> 0, missing -> NEUTRAL_INPUTS
```

Order of work inside `step`, which the tests below do not fully determine:

1. Sanitise inputs. Update `engine.running` with `nextRunning`.
2. Drum: sum pawl torque, detent torque and `handDrumTorque`, then `stepDrum`. Then apply the fork block: if at the new angle any slider's `|grooveCommand − x|` exceeds `forkCompliance` and is larger than it was at the old angle, the drum goes solid, so keep the old angle and zero its velocity. This is what stops a loaded or face-blocked dog from being overridden, and it is why two gears can never lock at once.
3. Sliders: for each, `stepSlider` with its groove command, its relative speed and the previous step's `dogTorque`. If one reports `justLocked`, apply `engageSpeeds` using the input shaft inertia alone on the input side (the clutch is treated as free to slip at that instant) and `reflectedVehicleInertia` on the output side.
4. Torques: engine torque at the crank; road load at the output shaft (rolling resistance, aerodynamic drag, brake, `handWheelTorque`, all through the final drive); input shaft friction and `handInputShaftTorque`.
5. Clutch: work in input-shaft coordinates, where the basket turns at `engine.omega / primaryRatio` and the engine's inertia is `engine.inertia × primaryRatio²`. Compute the torque that would keep slip at zero given the inertias on each side (the downstream inertia is the input shaft alone in neutral, or the input shaft plus `reflectedVehicleInertia / gearRatio²` in gear), then call `clutchTorque`.
6. Integrate the engine, the input shaft and the output shaft. In gear the two shafts are one body with `inputShaftOmega = gearRatio × outputShaftOmega`. When the clutch reports locked, set basket and input shaft to their common momentum-weighted speed.
7. Resistive torques (brake, rolling resistance, friction) must not reverse the sign of a speed within a step; they bring it to zero and hold it.
8. Record `dogTorque` (the torque carried from input shaft to output shaft through the locked pair, at the shaft the dog is on), `roadSpeed`, and the clutch values in the state.

- [ ] **Step 1: Write the failing test:**

```ts
const inp = (o: Partial<Inputs> = {}): Inputs => ({ ...NEUTRAL_INPUTS, ...o });
const run = (sim: Simulation, inputs: Inputs, seconds: number) => {
  for (let t = 0; t < seconds; t += PARAMS.dt) sim.step(inputs);
  return sim.getState();
};
const inGear = (g: GearId, engineRpm: number) => {   // locked clutch, steady, in gear g
  const sim = createSimulation();
  const wOut = rpm(engineRpm) / primaryRatio / gearRatio(g);
  const drumDeg = PARAMS.drum.detents[g];
  sim.setState({ /* drum at drumDeg, the right slider at ±1 and locked: g, lockedGear: g,
                    engine at engineRpm and running, input shaft at wOut*gearRatio(g), output at wOut */ });
  return sim;
};

test('reset state idles in neutral at a standstill', () => {
  const s = run(createSimulation(), inp(), 2);
  expect(s.lockedGear).toBeNull();
  expect(s.roadSpeed).toBe(0);
  expect(toRpm(s.engine.omega)).toBeGreaterThan(1100);
  expect(toRpm(s.engine.omega)).toBeLessThan(1500);
});
test('in neutral, clutch drag keeps the input shaft turning with the lever pulled', () => {
  const s = run(createSimulation(), inp({ clutchLever: 1 }), 3);
  expect(s.inputShaftOmega).toBeGreaterThan(5);
  expect(s.clutch.slip).toBeGreaterThan(0);
});
test('shaft speeds match the ratio exactly in every gear', () => {
  for (const g of [1, 2, 3, 4, 5, 6] as const) {
    const s = run(inGear(g, 6000), inp({ throttle: 0.4 }), 1);
    expect(s.lockedGear).toBe(g);
    expect(s.inputShaftOmega).toBeCloseTo(gearRatio(g) * s.outputShaftOmega, 6);
    expect(s.clutch.locked).toBe(true);
    expect(s.engine.omega / primaryRatio).toBeCloseTo(s.inputShaftOmega, 3);
  }
});
test('full throttle accelerates and the limiter holds', () => {
  const s = run(inGear(1, 6000), inp({ throttle: 1 }), 6);
  expect(toRpm(s.engine.omega)).toBeLessThan(15300);
  expect(s.roadSpeed).toBeGreaterThan(19.21);
});
test('closed throttle in gear slows the bike by engine braking', () => {
  const sim = inGear(3, 9000);
  const v0 = sim.getState().roadSpeed;
  const s = run(sim, inp(), 2);
  expect(s.roadSpeed).toBeLessThan(v0);
  expect(s.dogTorque).toBeLessThan(0);
});
test('revving in neutral does not move the bike', () => {
  expect(run(createSimulation(), inp({ throttle: 1 }), 2).roadSpeed).toBe(0);
});
test('brake stops the bike and never reverses it', () => {
  const sim = inGear(2, 5000);
  const s = run(sim, inp({ brake: 1, clutchLever: 1 }), 8);
  expect(s.roadSpeed).toBe(0);
  expect(run(sim, inp({ brake: 1, clutchLever: 1 }), 1).outputShaftOmega).toBe(0);
});
test('bad inputs are sanitised', () => {
  expect(sanitizeInputs({ throttle: 2, pedal: NaN, brake: -1 })).toMatchObject({ throttle: 1, pedal: 0, brake: 0 });
  const s = run(createSimulation(), { ...inp(), throttle: Infinity, clutchLever: NaN } as Inputs, 1);
  expect(Number.isFinite(s.engine.omega)).toBe(true);
});
test('advance caps a long frame gap', () => {
  const sim = createSimulation();
  expect(sim.advance(inp(), 30)).toBeCloseTo(0.1, 6);
  expect(sim.getState().t).toBeCloseTo(0.1, 6);
});
test('getState returns a copy', () => {
  const sim = createSimulation();
  const a = sim.getState(); a.engine.omega = -1;
  expect(sim.getState().engine.omega).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement `simulation.ts`**, completing the `inGear` helper's `setState` call in the test file from the comment in it.
- [ ] **Step 4: Run `npx vitest run` and `npx tsc --noEmit`.** Expected: all pass.
- [ ] **Step 5: Commit:** `feat: compose drivetrain simulation with fixed timestep`

### Task 8: Input scripts, the autopilot rider and whole-system scenarios

**Files:** Create `src/sim/inputScript.ts`. Test `tests/sim/scenarios.test.ts`.

**Interfaces:**
- Consumes: `Simulation`, `Inputs`, `SimState`.
- Produces:

```ts
export type InputSource = (t: number, state: SimState) => Inputs;
export function runSource(sim: Simulation, source: InputSource, seconds: number, onStep?: (s: SimState) => void): SimState;
// build a source from keyframed channels, linearly interpolated; unspecified channels hold NEUTRAL_INPUTS values
export function keyframes(channels: Partial<Record<keyof Inputs, Array<[t: number, value: number | boolean]>>>): InputSource;
// a pedal stroke: ramps to `amount` over 60 ms, holds 60 ms, returns over 60 ms, starting at t0
export function pedalStroke(t0: number, amount: number): Array<[number, number]>;
// the rider that runs until the visitor touches a control
export function createAutopilot(): InputSource;
```

Autopilot behaviour: starts the engine if it is not running, selects first, launches by feeding the clutch out over about 1.5 s at part throttle, upshifts with the clutch at about 9000 rpm through to sixth, then closes the throttle and downshifts with the clutch as revs fall below about 5000 rpm, brakes to a stop in first, selects neutral, and repeats. It reads `state` to decide; it holds no hidden randomness.

- [ ] **Step 1: Write the failing test:**

```ts
const fresh = () => createSimulation();

test('launch: the clutch slips, then locks, and the engine survives', () => {
  const sim = fresh();
  let slipped = false;
  const s = runSource(sim, keyframes({
    clutchLever: [[0, 1], [0.6, 1], [2.4, 0]],
    pedal: pedalStroke(0.2, -1),
    throttle: [[0.6, 0.1], [1.2, 0.35]],
  }), 5, (st) => { if (st.lockedGear === 1 && st.clutch.slip > 5) slipped = true; });
  expect(s.lockedGear).toBe(1);
  expect(slipped).toBe(true);
  expect(s.clutch.locked).toBe(true);
  expect(s.engine.running).toBe(true);
  expect(s.roadSpeed).toBeGreaterThan(3);
});
test('dumping the clutch at idle in first stalls the engine', () => {
  const s = runSource(fresh(), keyframes({
    clutchLever: [[0, 1], [0.8, 1], [0.82, 0]],
    pedal: pedalStroke(0.2, -1),
  }), 3);
  expect(s.engine.running).toBe(false);
});
test('first gear clunks in from neutral: the input shaft is snapped to rest', () => {
  const sim = fresh();
  let before = 0;
  runSource(sim, keyframes({ clutchLever: [[0, 1]] }), 1, (st) => { before = st.inputShaftOmega; });
  const s = runSource(sim, keyframes({ clutchLever: [[0, 1]], pedal: pedalStroke(0, -1) }), 0.6);
  expect(before).toBeGreaterThan(5);
  expect(s.lockedGear).toBe(1);
  expect(s.inputShaftOmega).toBeCloseTo(0, 1);
});
test('an upshift under full throttle is refused; easing the throttle lets it through', () => {
  const loaded = inGear(2, 8000);   // helper from Task 7, moved to tests/sim/helpers.ts
  const a = runSource(loaded, keyframes({ throttle: [[0, 1]], pedal: pedalStroke(0.3, +1) }), 1);
  expect(a.lockedGear).toBe(2);
  expect(toDeg(a.drum.angle)).toBeCloseTo(60, 0);   // the drum went solid, then the detent took it back
  const eased = inGear(2, 8000);
  const b = runSource(eased, keyframes({
    throttle: [[0, 1], [0.3, 1], [0.32, 0.12], [0.5, 0.12], [0.52, 1]],
    pedal: pedalStroke(0.3, +1),
  }), 1.2);
  expect(b.lockedGear).toBe(3);
});
test('a clutched downshift raises engine speed to the lower gear', () => {
  const sim = inGear(4, 6000);
  const s = runSource(sim, keyframes({
    clutchLever: [[0, 0], [0.2, 1], [0.5, 1], [0.9, 0]],
    pedal: pedalStroke(0.3, -1),
  }), 2);
  expect(s.lockedGear).toBe(3);
  expect(toRpm(s.engine.omega)).toBeGreaterThan(6000);
});
test('engine off, nothing turning: blocked dogs give a false neutral until the wheel is rocked', () => {
  const sim = fresh();
  sim.setState({ engine: { omega: 0, running: false }, inputShaftOmega: 0, sliders: { A: { phi: deg(40) } } });
  const off = { ignition: [[0, false]] as Array<[number, boolean]> };
  const a = runSource(sim, keyframes({ ...off, pedal: pedalStroke(0, -1) }), 1);
  expect(a.lockedGear).toBeNull();
  expect(a.sliders.A.blocked).toBe(true);
  const b = runSource(sim, keyframes({ ...off, handWheelTorque: [[0, 40], [0.5, 40], [0.51, 0]] }), 1.5);
  expect(b.lockedGear).toBe(1);
});
test('turning the drum by hand with the engine off selects a gear', () => {
  const sim = fresh();
  sim.setState({ engine: { omega: 0, running: false }, inputShaftOmega: 0, sliders: { B: { phi: deg(5) } } });
  const s = runSource(sim, keyframes({ ignition: [[0, false]], handDrumTorque: [[0, 3], [0.4, 3], [0.41, 0]] }), 1);
  expect(s.lockedGear).toBe(2);
});
test('a weak stroke can leave the box between gears', () => {
  const outcomes = [];
  for (let amount = 0.3; amount <= 1.0001; amount += 0.01) {
    const s = runSource(inGear(2, 5000), keyframes({ clutchLever: [[0, 1]], pedal: pedalStroke(0.2, amount) }), 1.2);
    outcomes.push(s.lockedGear);
  }
  expect(outcomes.at(-1)).toBe(3);        // a full stroke shifts
  expect(outcomes[0]).toBe(2);            // a feeble one does not
  expect(outcomes).toContain(null);       // somewhere between, a false neutral
});
test('starter in gear with the clutch out lurches the bike but stays sane', () => {
  const sim = fresh();
  sim.setState({ engine: { omega: 0, running: false }, inputShaftOmega: 0 });
  runSource(sim, keyframes({ ignition: [[0, false]], pedal: pedalStroke(0, -1), handWheelTorque: [[0, 40], [0.4, 40], [0.41, 0]] }), 1);
  const s = runSource(sim, keyframes({ starter: [[0, true]] }), 1);
  expect(Number.isFinite(s.roadSpeed)).toBe(true);
  expect(s.lockedGear).toBe(1);
});
test('autopilot visits every gear and comes back to rest without stalling', () => {
  const seen = new Set<number>();
  let stalled = false, stoppedAfterSixth = false;
  runSource(fresh(), createAutopilot(), 120, (st) => {
    if (st.lockedGear) seen.add(st.lockedGear);
    if (st.t > 2 && !st.engine.running) stalled = true;
    if (seen.has(6) && st.roadSpeed === 0) stoppedAfterSixth = true;
  });
  expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  expect(stalled).toBe(false);
  expect(stoppedAfterSixth).toBe(true);
});
test('invariants hold under 60 s of seeded random inputs', () => {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  let held: Inputs = NEUTRAL_INPUTS;
  runSource(fresh(), (t) => {
    if (Math.floor(t * 4) !== Math.floor((t - PARAMS.dt) * 4)) {
      held = { ...NEUTRAL_INPUTS, throttle: rnd(), clutchLever: rnd(), pedal: rnd() * 2 - 1, brake: rnd() < 0.2 ? rnd() : 0, starter: rnd() < 0.1 };
    }
    return held;
  }, 60, (st) => {
    const locked = (['A', 'B', 'C'] as const).filter((k) => st.sliders[k].locked !== null).length;
    expect(locked).toBeLessThanOrEqual(1);
    expect(st.drum.angle).toBeGreaterThanOrEqual(DRUM_MIN - 1e-9);
    expect(st.drum.angle).toBeLessThanOrEqual(DRUM_MAX + 1e-9);
    expect(st.outputShaftOmega).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(st.engine.omega + st.inputShaftOmega + st.outputShaftOmega)).toBe(true);
    if (st.lockedGear) expect(st.inputShaftOmega).toBeCloseTo(gearRatio(st.lockedGear) * st.outputShaftOmega, 5);
  });
});
```

- [ ] **Step 2: Move `inp`, `run` and `inGear` from `simulation.test.ts` into `tests/sim/helpers.ts` and import them in both files. Run the scenarios.** Expected: FAIL, `inputScript` not found.
- [ ] **Step 3: Implement `inputScript.ts`.**
- [ ] **Step 4: Run the scenarios. Where one fails on behaviour rather than on a bug, adjust only values marked tunable in `params.ts`, then re-run the whole suite.** If the same scenario fails twice after tuning, stop and report rather than loosening the test.
- [ ] **Step 5: Run `npx vitest run` and `npx tsc --noEmit`.** Expected: all pass, no type errors.
- [ ] **Step 6: Commit:** `feat: input scripts, autopilot rider and drivetrain scenarios`
- [ ] **Step 7: Write the two-line State Update to `HANDOFF.md`** (done: stage 1 simulation core with its test count; next: plan stage 2, the 2D panel and controls) and show it to the owner.

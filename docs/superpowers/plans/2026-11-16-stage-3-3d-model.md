# Stage 3: 3D Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A rotatable 3D model of the whole clutch and gearbox, generated in code and driven by the same simulation as the 2D schematic, as the page's main view.

**Architecture:** `src/geo/` holds pure geometry generators that return Three.js `BufferGeometry` (no renderer, testable in Node). `src/view3d/assembly.ts` builds one `Object3D` tree with a named node per part, and `pose.ts` moves that tree from a `SimState`; both are renderer-free and tested. `src/view3d/view.ts` owns the WebGL renderer, camera, lighting, picking and torque highlighting and implements the existing `View` interface. Three.js is loaded as a separate lazy chunk behind a visible loader; without WebGL the schematic stays as the main view.

**Tech Stack:** TypeScript, Vite, Vitest, `three` and `@types/three` (already approved). `OrbitControls` from `three/examples/jsm`.

**Spec:** `docs/superpowers/specs/2026-11-16-motorcycle-transmission-design.md`

## Global Constraints

- All geometry is generated in code. No model, texture or image files.
- `src/sim/`, `src/model/` and `src/geo/` stay free of DOM access; `src/geo/` may import `three` core classes only (no renderer, no `examples/jsm`).
- Colours only from `src/ui/tokens.ts`. The signal colour means only "carrying torque".
- The initial JavaScript (everything needed before the 3D chunk) stays at 60 kB gzipped or less; the 3D chunk is reported separately by `npm run size` and must be 220 kB gzipped or less.
- Device pixel ratio is capped at 2. Rendering stops while the tab is hidden.
- Dimensions come from `src/model/geometry.ts` and `src/geo/dimensions.ts`; no dimension literal inside a generator call site.
- No manufacturer or model name anywhere.
- After every task: `npm test`, `npm run typecheck`, `npm run build`, `npm run size` clean.

## Look

A technical illustration that moves: flat-shaded parts in the steel tokens with crisp edge lines in `--third`, on the graphite ground, lit by one key light and a soft fill so faces separate by tone. No reflections, no textures, no shadows on the ground. Parts carrying torque shift toward `--signal` and glow slightly. Two steel tokens are added for 3D tone separation, never used for text: `--steel-4 #7C8796`, `--steel-5 #A9B4C2`.

Tone by role, so the mechanism reads at a glance:

| Parts | Fill |
|---|---|
| Shafts, fork rods, shift shaft | `--steel-5` |
| Gears fixed to or sliding on their shaft | `--steel-4` |
| Gears spinning free on their shaft | `--steel-3` |
| Clutch basket, drum, star wheel | `--steel-3` |
| Friction plates | `--steel-2`; steel plates `--steel-5` |
| Forks, detent arm, pawl, pedal | `--steel-4` |
| Chain, sprockets | `--steel-4`; tyre `--steel-1`, rim `--steel-3` |

## Dimensions (`src/geo/dimensions.ts`, metres)

```ts
export const DIM = {
  pressureAngleDeg: 20, addendum: 1.0, dedendum: 1.25,       // in modules
  inputShaftRadius: 0.011, outputShaftRadius: 0.0125,
  gearPitch: 0.021,                 // axial distance between neighbouring gear centres
  dogHeight: 0.0025, dogInnerRadius: 0.016, dogOuterRadius: 0.023, dogWidthDeg: 28,  // 5 dogs, 72° pitch
  clutch: { basketOuterRadius: 0.078, basketDepth: 0.046, plateOuterRadius: 0.070, plateInnerRadius: 0.046,
            frictionThickness: 0.003, steelThickness: 0.0016, plates: 8, gapOpen: 0.0006,
            hubRadius: 0.044, springCount: 5, springRadius: 0.007 },
  primary: { faceWidth: 0.016 },    // 36T on the crank, 76T ring on the basket, same MODULE
  drum: { radius: 0.022, grooveDepth: 0.004, grooveWidth: 0.006 },
  fork: { thickness: 0.005, rodRadius: 0.006, pinRadius: 0.0028 },
  starWheel: { radius: 0.020, thickness: 0.006 },
  chain: { pitch: 0.015875, rollerRadius: 0.005, plateHeight: 0.012, width: 0.016, centreDistance: 0.56 },
  wheel: { radius: 0.31, tyreSection: 0.09, rimRadius: 0.215, hubRadius: 0.04, width: 0.14 },
} as const;
```

`gearAxialPosition` in `src/model/geometry.ts` is updated so neighbouring gears sit `DIM.gearPitch` apart (its existing tests still hold: 0.021 ≥ 0.014 + 0.004). With 2.5 mm dogs on both faces, the gap between facing dog tips at rest is 2 mm, which is `contactX × SLIDER_TRAVEL`: dog faces meet exactly when the simulation says they do.

## Placement (`src/view3d/layout3d.ts`)

- x runs along the shafts; the clutch is at the −x end of the input shaft and the countershaft sprocket at the +x end of the output shaft, matching the schematic's left and right.
- Input shaft axis at (y, z) = (0, 0). Output shaft axis at `CENTRE_DISTANCE` from it, 35° below horizontal toward −z.
- Crank axis above the clutch at the primary centre distance (`(36 + 76) × MODULE / 2`), 50° above horizontal toward +z.
- Shift drum axis below and in front (+z) of the shafts, placed so each fork reaches its slider; two fork rods parallel to it.
- Rear wheel axis at `DIM.chain.centreDistance` behind the output shaft (−z), on the sprocket's plane.

---

### Task 1: Three.js as a lazy chunk, loader, materials and view host

**Files:**
- Create: `src/view3d/load.ts`, `src/view3d/materials.ts`, `src/app/stageHost.ts`
- Modify: `package.json`, `scripts/size.mjs`, `src/ui/tokens.ts`, `src/ui/styles.css`, `src/main.ts`
- Test: `tests/ui/tokens.test.ts` (extend), `tests/app/stageHost.test.ts`

**Interfaces:**
- Produces:

```ts
// stageHost.ts — owns which view is the main one and which is the inset
export type ViewName = '3d' | 'schematic';
export interface StageHost {
  register(name: ViewName, view: View): void;
  setMain(name: ViewName): void;            // the other registered view becomes the inset if insets are on
  setInset(on: boolean): void;
  readonly main: ViewName | null; readonly inset: ViewName | null;
  render(state: SimState, path: TorquePath): void;   // renders main and, if on, inset
  pick(x: number, y: number): PartId | null;         // main view only
  setHighlight(part: PartId | null): void;           // both views
}
export function createStageHost(): StageHost;
// load.ts
export function webglAvailable(): boolean;
export function load3d(onProgress: (done: number, total: number, label: string) => void): Promise<View>;  // dynamic import of the 3D chunk
// materials.ts (inside the 3D chunk)
export type Tone = 'steel1' | 'steel2' | 'steel3' | 'steel4' | 'steel5';
export function partMaterial(tone: Tone): THREE.MeshLambertMaterial;   // flatShading: true
export function edgeMaterial(): THREE.LineBasicMaterial;               // COLORS.third
export function withEdges(geometry: THREE.BufferGeometry, tone: Tone, thresholdDeg?: number): THREE.Group; // mesh + EdgesGeometry lines, default 28°
export function setTorque(group: THREE.Group, amount: number): void;   // 0..1: lerps the mesh colour toward COLORS.signal and sets emissive
```

Rules: `stageHost` with only the schematic registered has it as main and no inset. Registering `'3d'` later makes it main and the schematic the inset (insets default on at 900px and wider, off below). `scripts/size.mjs` treats chunks whose file name starts with `view3d` as the 3D chunk (configure `build.rollupOptions.output.chunkFileNames` or `manualChunks` so that holds), enforces 60 kB on the rest and 220 kB on the 3D chunk, and prints both. The loader is a bar with a percentage and the current label over the stage, in the mono font; it reports real steps (chunk loaded, then one step per geometry group built in later tasks).

- [ ] **Step 1: Install `three` and `@types/three`.**
- [ ] **Step 2: Write the failing tests:**

```ts
// tokens.test.ts
test('3D steels exist and are never text colours', () => {
  expect(COLORS).toMatchObject({ steel4: '#7C8796', steel5: '#A9B4C2' });
});
// stageHost.test.ts — fake views record calls
test('schematic alone is main; 3D takes over and the schematic becomes the inset', () => {
  const host = createStageHost(); const a = fakeView(), b = fakeView();
  host.register('schematic', a); expect(host.main).toBe('schematic'); expect(host.inset).toBeNull();
  host.register('3d', b); expect(host.main).toBe('3d'); expect(host.inset).toBe('schematic');
  host.render(STATE, PATH); expect(a.renders).toBe(1); expect(b.renders).toBe(1);
  host.setInset(false); host.render(STATE, PATH); expect(a.renders).toBe(1); expect(b.renders).toBe(2);
  host.setMain('schematic'); expect(host.main).toBe('schematic'); expect(host.inset).toBeNull();
  host.setHighlight('shiftDrum'); expect(a.highlight).toBe('shiftDrum'); expect(b.highlight).toBe('shiftDrum');
});
```

- [ ] **Step 3: Run them.** Expected: FAIL.
- [ ] **Step 4: Implement.** `main.ts` registers the schematic at once, then, if `webglAvailable()`, calls `load3d` with the loader UI; at this task `load3d` resolves to a placeholder `View` that renders a lit, slowly turning test gear blank (a plain cylinder) so the chunk, renderer and materials are proven end to end.
- [ ] **Step 5: Run `npm test`, `npm run typecheck`, `npm run build`, `npm run size`.** Expected: clean, both budgets met.
- [ ] **Step 6: Commit:** `feat: lazy 3D chunk with loader, illustration materials and stage host`

### Task 2: Gear, dog, shaft and sprocket geometry

**Files:** Create `src/geo/dimensions.ts`, `src/geo/gear.ts`, `src/geo/shaft.ts`, `src/geo/sprocket.ts`. Modify `src/model/geometry.ts` (gear pitch). Test `tests/geo/gear.test.ts`, `tests/geo/shaft.test.ts`.

**Interfaces:**
- Produces:

```ts
// gear.ts — every geometry is centred on the origin with its axis along +x
export function gearProfile(teeth: number, module: number): THREE.Vector2[];   // closed involute outline, one full gear
export function spurGear(o: { teeth: number; module: number; faceWidth: number; boreRadius: number }): THREE.BufferGeometry;
export function dogRing(o: { count: number; widthDeg: number; innerRadius: number; outerRadius: number; height: number }): THREE.BufferGeometry; // lugs standing on the plane x = 0, pointing +x; lug 0 centred at angle 0
export function internalRing(o: { teeth: number; module: number; faceWidth: number; outerRadius: number }): THREE.BufferGeometry; // not used for meshing; reserved
// shaft.ts
export function splinedShaft(o: { radius: number; length: number; splines: number; splineDepth: number }): THREE.BufferGeometry;
export function plainShaft(o: { radius: number; length: number }): THREE.BufferGeometry;
// sprocket.ts
export function sprocketPitchRadius(teeth: number, pitch: number): number;   // pitch / (2 sin(π / teeth))
export function sprocket(o: { teeth: number; pitch: number; rollerRadius: number; thickness: number; boreRadius: number }): THREE.BufferGeometry;
```

Rules for `gearProfile`: pitch radius `r = teeth × module / 2`; base radius `r cos 20°`; tip radius `r + module`; root radius `r − 1.25 × module`; each flank is a true involute of the base circle sampled at 6 points from the base (or root, if the root is above the base) to the tip; tooth thickness at the pitch circle is half the circular pitch; tooth 0 is centred on angle 0. `internalRing` may be left out if nothing uses it. Expose `meshPhase(zA: number, zB: number, psi: number): number`: the static rotation gear B needs so that it meshes with gear A when A has tooth 0 on angle 0 and B's centre lies at angle `psi` from A's centre (`psi(1 + zA/zB) + π − π/zB`, wrapped to one B tooth pitch); when A turns by `a`, B turns to `phase − a·zA/zB`. (Corrected after review: the original one-argument rule was wrong for this box's same-parity pairs.)

- [ ] **Step 1: Write the failing tests:**

```ts
const radii = (g: THREE.BufferGeometry) => { const p = g.getAttribute('position'); const out: number[] = [];
  for (let i = 0; i < p.count; i++) out.push(Math.hypot(p.getY(i), p.getZ(i))); return out; };
test('gear outline has the right tip, root and tooth count', () => {
  const pts = gearProfile(37, 0.0025); const rs = pts.map((p) => p.length());
  expect(Math.max(...rs)).toBeCloseTo(37 * 0.00125 + 0.0025, 6);
  expect(Math.min(...rs)).toBeCloseTo(37 * 0.00125 - 0.003125, 6);
  let tips = 0; const tip = Math.max(...rs);                       // count runs of tip-radius points
  for (let i = 0; i < rs.length; i++) if (rs[i] > tip - 1e-9 && !(rs[(i + rs.length - 1) % rs.length] > tip - 1e-9)) tips++;
  expect(tips).toBe(37);
});
test('tooth thickness at the pitch circle is half the circular pitch', () => {
  // angular width of tooth 0 at r: 2 × (angle where the right flank crosses the pitch radius)
  expect(toothAngularWidthAtPitch(gearProfile(24, 0.0025), 24 * 0.00125)).toBeCloseTo(Math.PI / 24, 3);
});
test('spur gear solid: face width along x, bore respected, no NaN', () => {
  const g = spurGear({ teeth: 13, module: 0.0025, faceWidth: 0.014, boreRadius: 0.011 }); g.computeBoundingBox();
  expect(g.boundingBox!.max.x - g.boundingBox!.min.x).toBeCloseTo(0.014, 9);
  expect(Math.min(...radii(g))).toBeGreaterThanOrEqual(0.011 - 1e-9);
  expect(radii(g).every(Number.isFinite)).toBe(true);
  expect(g.getAttribute('normal')).toBeDefined();
});
test('dog ring: five lugs of 28°, standing 2.5 mm proud of x = 0', () => {
  const g = dogRing({ count: 5, widthDeg: 28, innerRadius: 0.016, outerRadius: 0.023, height: 0.0025 }); g.computeBoundingBox();
  expect(g.boundingBox!.min.x).toBeCloseTo(0, 9); expect(g.boundingBox!.max.x).toBeCloseTo(0.0025, 9);
  const p = g.getAttribute('position'); let outside = 0;
  for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getZ(i), p.getY(i)); const w = ((a % (2 * Math.PI / 5)) + 2 * Math.PI / 5) % (2 * Math.PI / 5);
    if (Math.min(w, 2 * Math.PI / 5 - w) > (14 * Math.PI) / 180 + 1e-6) outside++; }
  expect(outside).toBe(0);
});
test('sprocket pitch radius', () => {
  expect(sprocketPitchRadius(16, 0.015875)).toBeCloseTo(0.04069, 4);
  expect(sprocketPitchRadius(45, 0.015875)).toBeCloseTo(0.11380, 4);
});
test('shafts lie along x with the stated length', () => {
  const s = splinedShaft({ radius: 0.011, length: 0.2, splines: 6, splineDepth: 0.001 }); s.computeBoundingBox();
  expect(s.boundingBox!.max.x - s.boundingBox!.min.x).toBeCloseTo(0.2, 9);
  expect(Math.max(...radii(s))).toBeCloseTo(0.011, 6);
});
```

`toothAngularWidthAtPitch` is a helper in the test file that interpolates along the outline.

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** Solids are built from the 2D outline with `THREE.Shape` and `ExtrudeGeometry` (bevel off), then rotated so the axis is x.
- [ ] **Step 4: Run the full gate.** Expected: clean.
- [ ] **Step 5: Commit:** `feat: involute gear, dog ring, shaft and sprocket geometry`

### Task 3: Clutch, shift mechanism and final drive geometry

**Files:** Create `src/geo/clutch.ts`, `src/geo/shift.ts`, `src/geo/finalDrive.ts`. Test `tests/geo/clutch.test.ts`, `tests/geo/shift.test.ts`, `tests/geo/finalDrive.test.ts`.

**Interfaces:**
- Produces (every geometry centred on its own axis along +x unless stated):

```ts
// clutch.ts
export function clutchBasket(): THREE.BufferGeometry;        // cup with 12 finger slots; open face toward +x; carries the 76T primary ring gear on its back
export function frictionPlate(): THREE.BufferGeometry;       // ring with 12 outer tabs that sit in the basket slots
export function steelPlate(): THREE.BufferGeometry;          // ring with inner teeth that sit on the hub splines
export function clutchHub(): THREE.BufferGeometry;           // splined inner hub with spring posts
export function pressurePlate(): THREE.BufferGeometry;
export function clutchSpring(length: number): THREE.BufferGeometry;   // helix tube, 5 turns
export function plateStackOffsets(separation: number): { friction: number[]; steel: number[]; pressurePlate: number }; // x positions of each plate for separation 0..1
// shift.ts
export function shiftDrum(length: number, grooveCentres: Record<SliderId, number>): THREE.BufferGeometry;  // grooves follow grooveCommand
export function grooveAxialOffset(slider: SliderId, drumAngle: number): number;   // grooveCommand × SLIDER_TRAVEL
export function shiftFork(o: { reach: number; collarRadius: number }): THREE.BufferGeometry;  // boss on its rod at the origin, C-shaped claw at `reach`, guide pin opposite
export function starWheel(): THREE.BufferGeometry;           // index cam: a notch at each detent angle, the neutral notch shallower
export function detentArm(): THREE.BufferGeometry;           // arm with a roller, pivot at the origin
export function shiftPawl(): THREE.BufferGeometry;
export function pedalLever(): THREE.BufferGeometry;
// finalDrive.ts
export function chainPath(o: { frontRadius: number; rearRadius: number; centreDistance: number }): { length: number; pointAt(s: number): { z: number; y: number; tangent: number } }; // closed loop in the y-z plane, s in metres, wraps
export function chainLinkCount(pathLength: number, pitch: number): number;      // nearest even count
export function chainLink(inner: boolean): THREE.BufferGeometry;                 // one link: two side plates and a roller
export function rearWheel(): THREE.BufferGeometry[];                             // [tyre, rim+spokes, hub]
```

Rules:
- Drum surface: a (angle, x) grid, 240 × 80, where the radius drops by `grooveDepth` wherever `|x − (grooveCentres[s] + grooveAxialOffset(s, angle))| < grooveWidth / 2` for any slider. The angle around the drum is the drum angle itself, 0° to 300° used, 300° to 360° plain.
- Star wheel radius at angle θ: `radius − depth(θ)`, where depth is a smooth notch 3 mm deep and 12° wide centred on each gear detent and 1.5 mm deep and 8° wide at N.
- `plateStackOffsets(0)` has every plate touching (pitch = friction + steel thickness); `plateStackOffsets(1)` adds `gapOpen` between each neighbouring pair, growing away from the hub's back wall, and moves the pressure plate by the total.
- Chain path: two arcs and two tangent lines for an open belt drive.

- [ ] **Step 1: Write the failing tests:**

```ts
test('plate stack closes solid and opens by the gap', () => {
  const closed = plateStackOffsets(0), open = plateStackOffsets(1); const pitch = 0.003 + 0.0016;
  expect(closed.friction.length).toBe(8); expect(closed.steel.length).toBe(7);
  expect(closed.steel[0] - closed.friction[0]).toBeCloseTo(pitch / 2, 9);
  expect(open.steel[0] - open.friction[0]).toBeCloseTo(pitch / 2 + 0.0006, 9);
  expect(open.pressurePlate - closed.pressurePlate).toBeCloseTo(15 * 0.0006, 9);
});
test('friction plate tabs reach the basket, steel plates do not', () => {
  const r = (g: THREE.BufferGeometry) => { g.computeBoundingSphere(); return g.boundingSphere!.radius; };
  expect(r(frictionPlate())).toBeGreaterThan(0.070); expect(r(frictionPlate())).toBeLessThanOrEqual(0.078);
  expect(r(steelPlate())).toBeLessThanOrEqual(0.0701);
});
test('drum grooves sit where the forks are commanded', () => {
  expect(grooveAxialOffset('A', deg(0))).toBeCloseTo(-SLIDER_TRAVEL, 9);
  expect(grooveAxialOffset('A', deg(120))).toBeCloseTo(SLIDER_TRAVEL, 9);
  expect(grooveAxialOffset('B', deg(90))).toBe(0);
  const g = shiftDrum(0.12, { A: -0.03, B: 0.0, C: 0.03 }); const p = g.getAttribute('position'); let grooved = 0;
  for (let i = 0; i < p.count; i++) if (Math.hypot(p.getY(i), p.getZ(i)) < 0.022 - 0.0039) grooved++;
  expect(grooved).toBeGreaterThan(100);
});
test('star wheel has seven notches and neutral is the shallow one', () => {
  expect(starWheelRadiusAt(deg(120))).toBeCloseTo(0.020 - 0.003, 6);
  expect(starWheelRadiusAt(deg(30))).toBeCloseTo(0.020 - 0.0015, 6);
  expect(starWheelRadiusAt(deg(90))).toBeCloseTo(0.020, 6);
});
test('chain path is a closed belt and the link count is even', () => {
  const p = chainPath({ frontRadius: 0.0407, rearRadius: 0.1138, centreDistance: 0.56 });
  expect(p.length).toBeGreaterThan(2 * 0.56); expect(p.length).toBeLessThan(2 * 0.56 + 2 * Math.PI * 0.1138);
  const a = p.pointAt(0), b = p.pointAt(p.length); expect(b.y).toBeCloseTo(a.y, 9); expect(b.z).toBeCloseTo(a.z, 9);
  expect(chainLinkCount(p.length, 0.015875) % 2).toBe(0);
});
```

`starWheelRadiusAt` is exported from `shift.ts`.

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the full gate.** Expected: clean.
- [ ] **Step 5: Commit:** `feat: clutch, shift mechanism and final drive geometry`

### Task 4: Assembly and pose

**Files:** Create `src/view3d/layout3d.ts`, `src/view3d/assembly.ts`, `src/view3d/pose.ts`. Test `tests/view3d/assembly.test.ts`, `tests/view3d/pose.test.ts`.

**Interfaces:**
- Consumes: all of `src/geo/`, `src/model/geometry.ts`, `src/model/parts.ts`, `materials.ts`.
- Produces:

```ts
export interface Assembly {
  root: THREE.Group;
  node(id: PartId): THREE.Object3D;                 // the moving node for a part; throws if missing
  anchors: Record<'clutch' | 'inputShaft' | 'outputShaft' | 'shiftDrum' | 'forks' | 'finalDrive', THREE.Vector3>; // world-space callout anchors
  chain: { mesh: THREE.InstancedMesh; innerCount: number };
  framing: { centre: THREE.Vector3; radius: number };      // sphere around the gearbox and clutch, excluding the wheel
}
export async function buildAssembly(onProgress: (done: number, total: number, label: string) => void): Promise<Assembly>;
export function poseAssembly(a: Assembly, state: SimState, path: TorquePath): void;
```

Rules:
- Every mesh under a part's node has `userData.partId` set, for picking.
- Rotation convention: every rotation comes from `src/model/geometry.ts`, never from raw `state.angles`, because meshing parts counter-rotate. Gears use `gearAngle(shaft, g, angles)`. Everything else uses `drawnAngles(state)`: `crank` for the crank and primary drive gear, `basket` for the clutch basket and friction plates, `input` for the input shaft, hub, steel plates and pressure plate, `output` for the output shaft and countershaft sprocket, `wheel` for the rear sprocket and wheel. A part's rotation about its own x axis equals that drawn angle. Gears are built with a static phase so meshing teeth interleave at angle 0 (use `meshPhase(zA, zB, psi)` with the layout's line-of-centres angle).
- Sliding gears move along x by `x × SLIDER_TRAVEL`; their forks move with them; the drum turns to `drum.angle`; star wheel turns with the drum; the detent arm swings so its roller rides the star wheel profile at the arm's angular position.
- Dog phase: each free gear's dog ring is rotated so that the relative angle between its lugs and the facing slider's lugs equals `drawnDogPhase(slider, side, state)` from `src/model/geometry.ts` (the drawn-frame relative angle; not `dogPhase`, which is in the simulation's frame); engaged dogs therefore sit in the gaps and blocked dogs face each other.
- Clutch plates take `plateStackOffsets(1 − clutch.capacity / clutchCapacityMax)`; springs stretch to match the pressure plate.
- Pedal lever angle is ±12° × `inputs`-equivalent pedal travel inferred from the pawl state; if the state does not carry the pedal position, add `pedal.travel` to `SimState` in this task (set in `step` from the sanitised input).
- Chain: link i sits at `s = i × pitch + drawnAngles(state).output × sprocketPitchRadius(16)` along `chainPath`, alternating inner and outer links.
- `poseAssembly` sets `setTorque` on each part node: `amount = clamp(|path.torque| / 150, 0.35, 1)` for parts in `path.parts`, 0 otherwise.
- `buildAssembly` reports progress once per group (shafts, input gears, output gears, clutch, shift mechanism, final drive) and yields to the event loop between groups.

- [ ] **Step 1: Write the failing tests:**

```ts
test('every part in the registry has a node with pickable meshes', async () => {
  const a = await buildAssembly(() => {});
  for (const id of Object.keys(PARTS) as PartId[]) {
    let meshes = 0; a.node(id).traverse((o) => { if ((o as THREE.Mesh).isMesh && o.userData.partId === id) meshes++; });
    expect(meshes, id).toBeGreaterThan(0);
  }
});
test('shaft axes are a centre distance apart and gears sit on their shafts', async () => {
  const a = await buildAssembly(() => {}); a.root.updateMatrixWorld(true);
  const w = (id: PartId) => a.node(id).getWorldPosition(new THREE.Vector3());
  const i = w('gear1in'), o = w('gear1out');
  expect(Math.hypot(i.y - o.y, i.z - o.z)).toBeCloseTo(CENTRE_DISTANCE, 9);
  expect(i.x).toBeCloseTo(o.x, 9);
  expect(w('gear5in').x - w('gear1in').x).toBeCloseTo(0.021, 9);
});
test('pose: rotations follow the simulation and meshing gears counter-rotate', async () => {
  const a = await buildAssembly(() => {}); const sim = inGear(3, 6000); const s = run(sim, inp({ throttle: 0.3 }), 0.2);
  poseAssembly(a, s, torquePath(s));
  expect(relAngle(a.node('gear1in'))).toBeCloseTo(wrapPi(gearAngle('input', 1, s.angles)), 6);
  expect(relAngle(a.node('gear1out'))).toBeCloseTo(wrapPi(gearAngle('output', 1, s.angles)), 6);
});
test('pose: sliders, forks and drum move; nothing else shifts axially', async () => {
  const a = await buildAssembly(() => {}); const s0 = createSimulation().getState();
  poseAssembly(a, s0, torquePath(s0)); a.root.updateMatrixWorld(true);
  const x0 = a.node('gear5out').getWorldPosition(new THREE.Vector3()).x, f0 = a.node('forkA').getWorldPosition(new THREE.Vector3()).x;
  const fixed0 = a.node('gear1out').getWorldPosition(new THREE.Vector3()).x;
  const s1 = createSimulation().getState(); s1.sliders.A.x = -1; s1.drum.angle = 0;
  poseAssembly(a, s1, torquePath(s1)); a.root.updateMatrixWorld(true);
  expect(a.node('gear5out').getWorldPosition(new THREE.Vector3()).x - x0).toBeCloseTo(-SLIDER_TRAVEL, 9);
  expect(a.node('forkA').getWorldPosition(new THREE.Vector3()).x - f0).toBeCloseTo(-SLIDER_TRAVEL, 9);
  expect(a.node('gear1out').getWorldPosition(new THREE.Vector3()).x).toBeCloseTo(fixed0, 12);
});
test('pose: the torque path lights exactly its parts', async () => {
  const a = await buildAssembly(() => {}); const s = run(inGear(4, 7000), inp({ throttle: 0.8 }), 0.2); const p = torquePath(s);
  poseAssembly(a, s, p);
  expect(torqueAmount(a.node('gear4in'))).toBeGreaterThan(0.3);
  expect(torqueAmount(a.node('gear3in'))).toBe(0);
});
```

`relAngle`, `wrapPi` and `torqueAmount` are test helpers (`torqueAmount` reads the value `setTorque` stores in `userData.torque`).

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the full gate.** Expected: clean.
- [ ] **Step 5: Commit:** `feat: 3D assembly of every part, posed from the simulation`

### Task 5: The 3D view, toolbar, inset and callouts

**Files:** Create `src/view3d/view.ts`, `src/view3d/index.ts`, `src/ui/toolbar.ts`, `src/ui/callouts.ts`. Modify `src/view3d/load.ts`, `src/main.ts`, `src/ui/styles.css`, `src/app/controls.ts` (camera keys). Test `tests/ui/callouts.test.ts`.

**Interfaces:**
- Produces:

```ts
// view.ts
export interface View3d extends View {
  resetCamera(): void; orbit(dAzimuth: number, dPolar: number): void; zoom(factor: number): void;
  project(world: THREE.Vector3): { x: number; y: number; visible: boolean };   // CSS px in the view
  readonly anchors: Assembly['anchors'];
}
export function create3dView(container: HTMLElement, assembly: Assembly): View3d;
// callouts.ts
export interface CalloutSpec { anchor: keyof Assembly['anchors']; title: string; text: string; side: 'left' | 'right' }
export const CALLOUTS: CalloutSpec[];
export function layoutCallouts(specs: CalloutSpec[], projected: Record<string, { x: number; y: number; visible: boolean }>, size: { w: number; h: number }): Array<{ spec: CalloutSpec; card: { x: number; y: number }; line: { x1: number; y1: number; x2: number; y2: number } | null }>; // pure
export function mountCallouts(el: HTMLElement, view: View3d): { sync(): void; setVisible(on: boolean): void };
// toolbar.ts
export function mountToolbar(el: HTMLElement, hooks: { onView(v: ViewName): void; onInset(on: boolean): void; onTorqueFlow(on: boolean): void; onLabels(on: boolean): void; onResetCamera(): void; onOrbit(d: number): void; onZoom(f: number): void }): void;
```

Rules:
- Renderer: antialias on, `setPixelRatio(min(devicePixelRatio, 2))`, clear colour `COLORS.ground`, no shadows. Lights: hemisphere (soft) plus one directional key from upper front-left. Perspective camera, 32° field of view, default pose a three-quarter view from the front-left and slightly above, framed on `assembly.framing` so the gearbox and clutch fill about 70% of the stage height; the rear wheel is off-frame until the visitor zooms out.
- `OrbitControls` with damping, zoom limits from 0.6× to 6× the framing radius, pan off; the target stays at the framing centre. Drag on the stage orbits and counts as camera use, not as taking over the ride.
- Camera keys: `KeyQ` and `KeyE` orbit left and right, `KeyZ` and `KeyX` zoom in and out, `Digit0` resets. They never take over the ride.
- `pick` uses a raycaster and returns the nearest mesh's `userData.partId`. Hover sets the highlight (an `--ink` edge colour on that part's edge lines); click selects the part into the panel card, as the schematic does.
- Torque flow toggle off: `poseAssembly` is passed an empty path.
- Callouts (toggle "Labels", default on at 900px and wider, off below): six cards with one-line text, left or right of the stage in fixed vertical slots, each joined to its projected anchor by a 1px `--third` leader line ending in a small ring. A card whose anchor is off-screen hides its line. Positions update every frame; cards never overlap the control deck.

  | Anchor | Title | Text |
  |---|---|---|
  | clutch | Clutch | Connects the engine to the gearbox, and lets it slip or let go. |
  | inputShaft | Input shaft | Driven by the clutch. Its gears turn whenever the clutch does. |
  | outputShaft | Output shaft | Drives the chain. It turns only with the rear wheel. |
  | forks | Shift forks | Slide a gear sideways to lock its neighbour to the shaft. |
  | shiftDrum | Shift drum | Each click of the pedal turns it one step and moves a fork. |
  | finalDrive | Final drive | Sprockets and chain carry the output to the rear wheel. |

- Toolbar on the stage, bottom centre above the deck: view switch (3D / Schematic), inset toggle, torque-flow toggle (pressed by default), labels toggle, orbit left and right, zoom out and in, reset view. Buttons are icon buttons drawn as inline SVG with accessible names and `aria-pressed` on toggles; a hint line shows the camera keys.
- Inset: the non-main view in a 34%-wide panel at the stage's bottom-left with a 1px `--third` border; clicking it swaps main and inset.
- Rendering stops while `document.hidden`; `dispose()` frees geometries, materials and the renderer.
- `load3d` now resolves to the real view: chunk, then `buildAssembly` with progress, then `create3dView`.

- [ ] **Step 1: Write the failing test:**

```ts
test('callouts take fixed slots on their side and lines join card to anchor', () => {
  const projected = Object.fromEntries(CALLOUTS.map((c, i) => [c.anchor, { x: 400 + i * 40, y: 200 + i * 30, visible: i !== 2 }]));
  const out = layoutCallouts(CALLOUTS, projected, { w: 1000, h: 700 });
  const left = out.filter((o) => o.spec.side === 'left'), right = out.filter((o) => o.spec.side === 'right');
  expect(left.length).toBeGreaterThan(0); expect(right.length).toBeGreaterThan(0);
  for (const o of left) expect(o.card.x).toBeLessThan(300);
  for (const o of right) expect(o.card.x).toBeGreaterThan(700);
  for (const side of [left, right]) for (let i = 1; i < side.length; i++) expect(side[i].card.y - side[i - 1].card.y).toBeGreaterThanOrEqual(84);
  expect(out[2].line).toBeNull();
  expect(out[0].line).toMatchObject({ x2: 400, y2: 200 });
});
test('six callouts, none naming a brand, each one sentence or two', () => {
  expect(CALLOUTS.length).toBe(6);
  for (const c of CALLOUTS) expect(c.text.length).toBeLessThanOrEqual(80);
});
```

- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement and wire into `main.ts`.**
- [ ] **Step 4: Run the full gate.** Expected: clean; initial JavaScript 60 kB or less, 3D chunk 220 kB or less.
- [ ] **Step 5: Commit:** `feat: 3D view with picking, torque flow, toolbar, schematic inset and callouts`

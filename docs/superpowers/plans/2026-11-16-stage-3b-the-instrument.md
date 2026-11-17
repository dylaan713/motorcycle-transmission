# Stage 3b: The Instrument (visual redesign) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the page's look and layout as direction B, "The instrument", which the owner chose: the motorcycle's own instrument cluster wrapped around its gearbox.

**Architecture:** No change to the simulation, the model geometry or the view contracts. This stage replaces tokens, layout and chrome: the stage becomes full-bleed; the permanent information column becomes a drawer; the readings become a large tachometer arc, gear numeral and figures drawn over the stage; the deck becomes handlebar switchgear; the 3D render gets theatrical lighting. Every existing behaviour, key, accessible name and test of logic is kept.

**Tech Stack:** As before. No new dependencies: the one typeface is Archivo Variable (already installed), using its weight, width and italic axes.

**Spec:** `docs/superpowers/specs/2026-11-16-motorcycle-transmission-design.md`, section "Visual direction chosen by the owner".

**Visual reference (binding for look, not for code):** `docs/design-options/option-b-desktop.png`, `option-b-phone.png`, `option-b-panel-open.png`; the mockup's source and design notes are in `docs/design-options/b-source/` (`index.html`, `NOTES.md`). The mockup is a still with a hand-painted torque path and frozen values; the build drives everything from the live simulation and the real 3D model.

## Global Constraints

- The accent means exactly one thing: "this part is carrying torque". It never appears on controls, focus rings, the tachometer or decoration. The tachometer and its redline band are white and steel.
- Palette roles and values come from `b-source/NOTES.md` and live in `src/tokens.ts`: ground `#060708`, surface `#121519`, edge `#2A2F36`, steel `#5B636D` (strokes only), ink `#F2F4F6`, ink-2 `#A3ACB7`, ink-3 `#7D8692` (on ground and surface only), torque `#FF7A1A`. The steel part tones for the 3D model and schematic are retuned to sit on the new ground and are never used for text. Every text pair is covered by the contrast test at 4.5:1 or better (3:1 for text 24 px and larger and for non-text graphics).
- One typeface, Archivo Variable: expanded bold for the title; condensed heavy italic for everything that moves (gear, speed, rpm, tach numerals, lesson numbers, callout names); normal width for body text. Tabular figures on every reading. Mono (JetBrains Mono) is kept only for key hints.
- Nothing about behaviour regresses: every key, control, toggle, tab of content, status message, fallback (no JavaScript, no WebGL, context loss, reduced motion) and accessible name that exists today still exists and still passes its tests. Logic tests are not weakened; tests that assert old colours or layout numbers are updated to the new values with the reason stated.
- Keyboard and pointer access for everything; visible focus (ink, 2 px); targets at least 44 × 44 CSS px; the page never scrolls; `dvh` units.
- Motion answers input. One arrival, skipped under reduced motion; under reduced motion every change is an instant state change and nothing moves until asked.
- Budgets: initial JavaScript 60 kB gzipped or less, 3D chunk 220 kB or less, a frame at 1440 × 900 under 8 ms on the development machine.
- No brand or model names. No new dependencies. Nothing that costs money.
- After every task: `npm test`, `npm run typecheck`, `npm run build`, `npm run size` clean.

## Layout (desktop, 1440 × 900 reference)

- **Stage:** the whole viewport under a slim top bar. The 3D model is centred slightly left of centre, sized so the gear train is the subject and the tachometer arc has headroom.
- **Top bar (about 72 px, no background box):** title in expanded bold with "live simulation · simplified model" beneath it at the left; the mode chip ("Demo ride · touch any control to take over") centre-right; a "How it works" pill at the right that opens the drawer.
- **View toolbar:** a short row at the stage's top-left under the title: 3D / 2D switch, torque flow, labels, and (when stage 4 adds them) exploded, x-ray, slow motion, pause. Camera buttons (orbit, zoom, reset) sit bottom-left near the tachometer's zero.
- **Tachometer arc:** a large white arc sweeping around the left and top of the model from 0 at the lower left to 15 at the right, with condensed italic numerals 0 to 15, minor ticks, a live band that follows engine speed, a needle, and the last 1,000 rpm as a white-hatched block. Drawn in SVG over the stage; it does not intercept pointer events.
- **Readings, right edge:** a gear indicator row "N 1 2 3 4 5 6" with the current one marked, the gear numeral about 420 px tall in condensed heavy italic, then road speed and engine speed beneath it.
- **Callouts:** frameless annotations with thin leader lines and a dot at the anchor, names in condensed italic, one line of description on a near-ground plate for contrast. Numbered balloons may be used.
- **Lesson row:** nine numbered lap markers on a hairline across the stage's lower edge, above the deck (built for real in stage 5; this stage reserves and styles the row and shows the titles).
- **Switchgear deck (bottom, about 130 px):** arranged like the handlebar: clutch lever and shift rocker (Up, Down) at the left, Reset centred, then ignition toggle, start button, brake lever and throttle (a horizontal grip bar showing percent open) at the right. Each with its key hint.
- **Drawer:** slides over the right of the stage from the "How it works" pill; holds the existing tabs (Overview, Ratios, Live data, Specs, Parts) and later How it works; closes with Escape, the pill, or a click outside; focus is trapped inside while open and returns to the pill on close. The selected-part card appears at the stage's lower right, not in the drawer.
- **Inset:** the non-main view stays available as a small inset at the lower left above the deck, restyled to the new palette.

**Phone (390 × 844):** top: title and chip; stage with the model and a compact tachometer arc; a strip with gear numeral, speed and rpm; callouts reduced to name tags (description on tap); deck as two rows with clutch far left and throttle far right; the drawer is full-height.

---

### Task 1: Tokens, type and the page skeleton

**Files:** `src/tokens.ts`, `src/ui/tokens.ts`, `src/ui/styles.css`, `index.html`, `src/main.ts`, `tests/ui/tokens.test.ts`, `tests/ui/sources.test.ts`.

- [ ] **Step 1: Update the token tests first** to the new roles and values and the new contrast pairs (ink, ink-2, ink-3 on ground and surface; ink-3 banned on anything lighter than surface; steel and edge as non-text at 3:1 where they carry meaning; torque never as text).
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** the palette, the Archivo axis utilities (CSS classes or custom properties for expanded, condensed-italic and normal settings), and the new page skeleton: full-bleed stage, top bar, deck band, lesson-row band, overlay layers (tachometer, readings, callouts, toolbar, part card, inset, loader, drawer) with one documented stacking order. The old header readings and the permanent panel column are removed; their content moves in later tasks, so at the end of this task the page still works with the readings temporarily in a plain overlay and the panel reachable through a temporary button.
- [ ] **Step 4: Run the full gate.**
- [ ] **Step 5: Commit:** `feat(look): instrument palette, type and full-bleed skeleton`

### Task 2: Tachometer arc, gear numeral and readings

**Files:** create `src/ui/cluster/arc.ts` (pure geometry), `src/ui/cluster/cluster.ts` (DOM and SVG), update `src/ui/readouts.ts`, `src/ui/styles.css`, `src/main.ts`; tests `tests/ui/arc.test.ts`, update `tests/ui/readouts.test.ts`.

- Pure `arc.ts`: maps rpm (0 to 15,000) to an angle and a point on the arc for a given stage size; returns tick positions, numeral positions and the redline block's polygon; clamps above the scale; the arc's centre and radius are chosen from the stage rectangle so the arc frames the model and never leaves the stage.
- The needle and live band follow a stiff critically damped spring toward the true rpm (the displayed number stays exact); under reduced motion they jump.
- The gear numeral changes with a slide along its slant and a short overshoot (instant under reduced motion); "N" in neutral and an en dash in a false neutral, as today.
- The readings' width axis tightens slightly as revs climb into the last 3,000 rpm.

- [ ] **Step 1: Write failing tests** for `arc.ts`: 0 rpm and 15,000 rpm map to the arc's ends; 7,500 to the middle; values above 15,000 clamp; every numeral and tick lies inside the stage rectangle for 1440 × 900, 1024 × 768 and 390 × 844 stage sizes; the redline block spans 14,000 to 15,000; the spring's step function converges without overshooting past 2% and is frame-rate independent.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the full gate.**
- [ ] **Step 5: Commit:** `feat(look): tachometer arc, gear numeral and readings`

### Task 3: Switchgear deck, toolbar, callouts, chip and lesson row

**Files:** `src/ui/deck.ts`, `src/ui/toolbar.ts`, `src/ui/callouts.ts`, `src/ui/status.ts`, `src/ui/view3d.css`, `src/ui/styles.css`, create `src/ui/lapRow.ts`; tests alongside.

- Deck: the handlebar arrangement above, each control keeping its channel, key, ARIA role, description and spring-back behaviour; the clutch and brake are drawn levers that rotate about their pivots; the throttle is a grip bar with a knurl that scrolls as it opens; the shift rocker depresses. No orange anywhere.
- Toolbar, callouts and chip restyled per the layout; callout layout keeps its tested non-overlap rules and gains the tachometer arc and the readings column as reserved regions.
- Lesson row: nine titles from a small static list in `lapRow.ts` for now (stage 5 replaces the list with the real lessons and behaviour); the row is not interactive yet and says so to assistive technology (`aria-hidden` until stage 5 wires it).

- [ ] **Step 1: Update or add tests first** where logic changes (callout reserved regions; deck order and names; any pure layout function).
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the full gate.**
- [ ] **Step 5: Commit:** `feat(look): switchgear deck, annotations and lesson row`

### Task 4: The drawer

**Files:** `src/ui/panel.ts`, create `src/ui/drawer.ts`, `src/ui/styles.css`, `src/app/keys.ts`, `index.html`; tests `tests/ui/drawer.test.ts`.

- Pure drawer state machine: closed, opening, open, closing; open and close requests; Escape; which element gets focus on open and on close; whether ride keys are handled while open (they are not: with the drawer open, arrow keys scroll it and the ride is not taken over; W, S and C still ride).
- The existing tabs move inside unchanged. The no-JavaScript fallback still shows the explanation and ratios.

- [ ] **Step 1: Write failing tests** for the state machine and the key rule.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the full gate.**
- [ ] **Step 5: Commit:** `feat(look): content drawer over the stage`

### Task 5: Lighting, materials and framing for the instrument

**Files:** `src/view3d/view.ts`, `materials.ts`, `camera.ts`, `src/view2d/paint.ts` and draw modules for palette only; tests alongside.

- Render: pure ground background; one hard key light from the upper right and a cold rim light from behind; lower-left faces fall nearly to black; edge lines are reduced to silhouette and crease emphasis (drop the faint ghost ellipses on large flat faces); the ghosted wheel stays faint.
- Torque: emissive orange faces with full-signal edges, in the two tiers already defined (engaged pair, its slider and both shafts brightest; the rest of the path quieter); the orange holds the token hue within 3° on lit and unlit faces (tested on the colour function).
- Camera: pulled back so nothing of the clutch or primary gear is cropped at 1440 × 900 and the arc has headroom; a pose per stage width as now; the model sits in the region the layout reserves for it (between the arc and the readings column).
- Schematic: same drawing, new palette.

- [ ] **Step 1: Write failing tests** for the colour rule (hue within 3° of the token across the amount range and both tiers) and the pose choice and framing (the model's projected bounds fall inside the reserved model region at the three reference sizes, computed with a camera-only projection in Node).
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the full gate.**
- [ ] **Step 5: Commit:** `feat(look): theatrical lighting, emissive torque and framed model`

### Task 6: Arrival, motion and the phone layout

**Files:** `src/main.ts`, `src/ui/cluster/cluster.ts`, `src/ui/styles.css`, `src/view3d/view.ts`; tests alongside.

- Arrival, once: the tachometer sweeps 0 to 15 and back over about 900 ms while its numerals light in sequence and the model fades up from black with the key light sliding in; the gear numeral drops from N to 1 as the demo rider selects first; the torque path appears as torque first flows. Skipped under reduced motion.
- The phone layout from the section above, checked at 390 × 844 and 360 × 740.
- Under reduced motion: no arrival, no camera drift, no springs, nothing moves until asked (the existing motion hold stays in force).

- [ ] **Step 1: Write failing tests** for the arrival timeline as a pure function of elapsed time (which elements are lit at t; total duration; a no-op under reduced motion).
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the full gate.**
- [ ] **Step 5: Commit:** `feat(look): arrival sweep, motion and phone layout`

### Task 7: Side-by-side check against the mockup

- [ ] **Step 1: Render the built page** with headless Chrome at 1440 × 900 and 390 × 844 (in neutral, and with torque flowing using the real demo ride in a real browser session), and compare by eye with `docs/design-options/option-b-desktop.png` and `option-b-phone.png`: hierarchy, scale of the gear numeral, the arc, type settings, spacing, the deck. List every difference that makes the build weaker than the mockup, and every place the build is better.
- [ ] **Step 2: Fix the differences that matter; re-render.**
- [ ] **Step 3: Run the full gate, plus the browser rows of the stage 6 ship gate** (no horizontal scroll, no console errors, keyboard only, reduced motion, no JavaScript).
- [ ] **Step 4: Commit:** `fix(look): close the gaps to the chosen mockup`

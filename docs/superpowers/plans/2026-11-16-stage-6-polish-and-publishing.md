# Stage 6: Polish and Publishing Prep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take the working page to a finished, defensible portfolio piece: audited from four angles, tuned on real screens, documented, and built into a folder that is ready to host.

**Architecture:** No new architecture. This stage runs four independent read-only audits, fixes what they find in one wave, tunes the demo ride and first impression, then writes the repository documents and produces the production build. Nothing is deployed.

**Tech Stack:** As before. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-16-motorcycle-transmission-design.md`

## Global Constraints

- Nothing is published, hosted or pushed. The stage ends with `dist/` built and verified locally.
- Nothing that costs money. No new dependencies.
- No manufacturer or model names; no real people's names in code, docs or commits (the portfolio entry refers to "the author").
- Every claim in a document is checkable against the repository: test counts are re-measured with the command shown beside them, sizes come from `npm run size`, dated numbers carry their date.
- The page states it is a simplified model wherever it describes the simulation.
- Budgets: initial JavaScript 60 kB gzipped or less; 3D chunk 220 kB or less; a frame at 1440 × 900 under 8 ms on the development machine.
- After every task: `npm test`, `npm run typecheck`, `npm run build`, `npm run size` clean.

## Ship gate

| Check | Command or method | Pass |
|---|---|---|
| Tests, types, build | `npm test`, `npm run typecheck`, `npm run build` | clean |
| Bundle | `npm run size` | both budgets met |
| Contrast | part of `npm test` | every text pair 4.5 or better; non-text graphics 3 or better |
| No network | `npm run preview`, load the page, list requests in the browser tool | every request is same-origin and relative |
| Phone and desktop | browser tool at 390 × 844 and 1440 × 900 | no horizontal scroll, no console errors, rideable |
| Reduced motion | browser tool with the media feature emulated | nothing moves until asked |
| No JavaScript | browser tool with scripts disabled | the explanation and ratios are readable |
| Keyboard | browser tool, keyboard only | every control and lesson reachable and operable, focus always visible |

**Ask the owner to check** (not part of the gate): whether the orange reads as "torque" without being told; the feel of the clutch lever and pedal on a real phone; a five-second look by someone who has never seen it (what do they say it is?); a read of `docs/MODEL.md` by someone who has rebuilt a gearbox.

---

### Task 1: Four audits

**Files:** none changed. Output: four reports under the plan's workspace.

- [ ] **Step 1: Run the four global auditors as a full audit, in parallel, each read-only:** `correctness-auditor` (bugs, test gaps, performance, drift), `security-legal-auditor` (no data collection, no network, licences of the three runtime and font dependencies, the layout reference borrowed in structure only), `ui-auditor` (headless screenshots, accessibility, design directions), `copy-auditor` (plain language, no hype, no brand or model names, honest labelling, consistency of terms with the glossary). Point each at the repository's `## Audit context` in `CLAUDE.md`.
- [ ] **Step 2: Collect the findings into one list** (`audit-findings.md` in the workspace), de-duplicated, each tagged fix-now or deferred with a one-line reason.

### Task 2: Fix wave from the audits

**Files:** as the findings require.

- [ ] **Step 1: One implementer fixes every fix-now finding, tests first where a test can express it.**
- [ ] **Step 2: Run the ship gate's command rows.**
- [ ] **Step 3: One scoped re-review of the fix wave.**
- [ ] **Step 4: Commit:** `fix: audit findings`

### Task 3: First impression and the demo ride

**Files:** `src/sim/inputScript.ts`, `src/main.ts`, `src/view3d/view.ts`, `src/ui/styles.css`, tests alongside.

Rules:
- The demo ride is the first ten seconds a recruiter sees. Tune the autopilot so the first lap is: idle one second, into first with a visible clunk, a clean launch, brisk upshifts with rev drops that land near the next gear's speed (the parked stage 1 item: the first-to-second upshift interruption should be 0.25 s or less), a few seconds in sixth, downshifts with matched revs, a smooth stop, neutral. No stall, ever.
- During the demo the 3D camera drifts slowly (a few degrees of orbit, eased) so the model reads as three-dimensional; the drift stops for good the moment the visitor touches the camera or any control, and never runs under reduced motion.
- The arrival: the loader hands over to the 3D model assembling along the torque path over 900 ms (parts fade and settle from a few millimetres of exploded offset), then the demo starts. Skipped under reduced motion.
- A first-visit hint points at lesson 1 and at "touch any control"; it goes away on first interaction.

- [ ] **Step 1: Write the failing tests:** autopilot first-to-second interruption 0.25 s or less; no upshift leaves the engine more than 600 rpm from the next gear's locked speed when the clutch locks; three consecutive laps never stall and never leave a false neutral for more than one second; camera drift amount is zero under reduced motion and zero after any interaction (pure function of elapsed time and a flag).
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement and tune.** Check by eye in the browser.
- [ ] **Step 4: Run the ship gate's command rows.**
- [ ] **Step 5: Commit:** `feat: tuned demo ride, camera drift and model arrival`

### Task 4: Real-screen pass

**Files:** as needed in `src/ui/`, `src/view3d/`, `src/view2d/`.

- [ ] **Step 1: With the browser tool, walk the ship gate's browser rows** at 1440 × 900, 1280 × 720, 1024 × 768, 820 × 1180 and 390 × 844, in both views, with labels on and off, inset on and off, a lesson open, a part selected, exploded and x-ray on. Screenshot each to the scratchpad and list what is wrong: overlap, clipped text, orphaned labels, misaligned baselines, anything under 44 px to tap, anything that scrolls sideways.
- [ ] **Step 2: Measure frame time** over 600 frames in each view at 1440 × 900 and report median and 95th percentile.
- [ ] **Step 3: Fix what was found; re-screenshot the affected cases.**
- [ ] **Step 4: Run the ship gate's command rows.**
- [ ] **Step 5: Commit:** `fix: layout and legibility across screen sizes`

### Task 5: Repository documents and the production build

**Files:** Create `README.md`, `docs/portfolio-entry.md`, `LICENSES.md`. Modify `index.html` (meta tags), `HANDOFF.md`, `CLAUDE.md` (commands), `docs/MODEL.md` (final numbers).

Rules:
- `README.md`: what it is in two sentences; a screenshot (taken from the built page, stored in `docs/`); how to run, test and build; the keys; how the code is organised (one line per directory); the honest scope ("a simplified model; numbers are representative, not measured"); pointers to `docs/MODEL.md` and the design. Test count and bundle sizes stated with the command and the date they were measured.
- `docs/portfolio-entry.md`: a draft the owner can paste into the portfolio: a title, a one-line summary, three short paragraphs (what it shows, how it works, what was hard), a "what I would validate next" paragraph, and suggested interview talking points taken from `docs/MODEL.md`. Written in the first person for the owner to edit; it says plainly that the build was done with an AI coding agent under the owner's direction, in wording the owner can keep or remove.
- `LICENSES.md`: the runtime and font dependencies with their licences as stated in their own `package.json` and licence files in `node_modules` (read them; do not write from memory).
- `index.html`: description, theme colour from the ground token, Open Graph title and description (no image URL, since nothing is hosted), and the inline favicon.
- `HANDOFF.md`: a final State Update, the complete list of decisions made on the owner's behalf across all six stages, the open "Ask the owner to check" items, the five deferred skill candidates, and exact steps to host `dist/` on a free static host of the owner's choice (described generically; no account is created).
- Production build: `npm run build`; then `npm run preview` and the ship gate's "No network" row.

- [ ] **Step 1: Write the documents.**
- [ ] **Step 2: Add a test** that fails if `README.md` or `docs/MODEL.md` names a tooth count, ratio or capacity that disagrees with `PARAMS` (parse the figures the documents mark with a `<!-- param:... -->` comment).
- [ ] **Step 3: Run the whole ship gate, every row, and paste the results into `HANDOFF.md`.**
- [ ] **Step 4: Commit:** `docs: readme, model notes, licences, portfolio draft and final handoff`

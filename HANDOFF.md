# HANDOFF

## State Update (2026-11-16, 21:50 EST)

- **Done:** Stage 1 (simulation) complete and reviewed. Stage 2 (rideable 2D page) complete; its
  whole-stage review found 6 defects, 20 minors and 7 design changes, all fixed in commits cf2a0a1,
  b16bb7d and 3c08636 (re-review running). Stage 3 (3D model): all five tasks built; the 3D view is
  the main stage view with the schematic as an inset, an instrument cluster, toolbar and callouts.
  281 tests passing at commit 3c08636; first-paint JavaScript 31.48 kB and the 3D file about
  155 kB gzipped. Plans for all six stages are written.
- **Next:** Act on the two reviews that were running (stage 2 fix-wave re-review; stage 3
  whole-stage review). Then stage 4 (slow motion, exploded view, x-ray, turning parts by hand,
  part focus), stage 5 (lessons, How it works, glossary, `docs/MODEL.md`), stage 6 (audits,
  polish, README, production build, portfolio draft).

### Resume here

Run `git status`, `npm test` and `npm run typecheck` first. Build ledgers (git-ignored, on disk)
are under `.superpowers/sdd/<plan name>/progress.md`; findings, briefs and reports sit beside them.

1. **Stage 2 fix-wave re-review**: findings `.superpowers/sdd/2026-11-16-stage-2-2d-panel-and-controls/final-review-findings.md`,
   implementer's report `final-fix-report.md`, diff `review-final-fix.diff`. If no verdict is in that
   ledger, re-run the re-review. Known leftover: in the tachometer the "×1,000 rpm" caption overlaps
   the "10" numeral.
2. **Stage 3 whole-stage review**: if no result is in `.superpowers/sdd/2026-11-16-stage-3-3d-model/progress.md`,
   re-run it. Known visual leftovers: the clutch's ring gear is the largest orange shape and is
   cropped at the right edge of the default view; the gear pedal is cut off at the bottom-left.
   Then one fix wave for whatever it finds.
3. **Stages 4, 5 and 6**: run from their plans in `docs/superpowers/plans/`.

### To restart

Open a session in this folder and say: "Read HANDOFF.md and finish them all."
Keep the Mac plugged in and the lid open; it went to sleep once mid-build and that killed a
builder. Start a keep-awake first (`caffeinate -i -s -t 43200` in the background).

To see it now: `npm run dev`, then open the address it prints.

## Standing authorization for the overnight build (given by the owner 2026-11-16)

The owner's words: "By full freedom I mean I want to wake up to a completed project. The only hard
rules are that it can not cost any money."

What that covers, as confirmed in conversation:

- All six stages of the design, run straight through without stopping for review between stages.
- Writing the plans for stages 2 to 6 without the owner reviewing them first.
- Free npm dev dependencies: `typescript`, `vitest`, `vite`, `three`, `@types/three`. Others are
  allowed only if free and open source; list every one here with the reason.
- All visual decisions (palette, illustration style, layout).

What it does not cover (the builder's own limits, stated to the owner):

- Nothing that costs money: no paid tiers, trials needing a card, paid assets or metered APIs.
- No publishing, hosting or account creation. Stage 6 ends with a production build that is ready
  to deploy and a draft portfolio entry; the owner deploys.
- Git is local only: `git init` and commits per passing task, no remote, no push, and never
  `-c user.name` / `-c user.email`.
- No changes outside this folder.

## Where things are

- Design: `docs/superpowers/specs/2026-11-16-motorcycle-transmission-design.md`
- Stage 1 plan: `docs/superpowers/plans/2026-11-16-stage-1-simulation-core.md`
- Layout reference (structure only, not the look): https://learn-arduino-red.vercel.app/

## How to run it

1. Run the `project-intake` skill on this folder first.
2. Execute each stage's plan with `superpowers:subagent-driven-development`.
3. After each stage, write the next stage's plan with `superpowers:writing-plans`, then build it.
4. If a task fails twice, stop that task, record it under "Problems" below and continue with work
   that does not depend on it.
5. Append a State Update here after every stage, and a list of every call made on the owner's
   behalf under "Decisions made".

## Decisions made

Stage 1 (simulation core):
- Gearbox numbers are mine: six pairs that each sum to 50 teeth (13:37, 17:33, 19:31, 21:29, 23:27,
  24:26), primary 36:76, final 16:45, 0.31 m wheel, 270 kg, 15,000 rpm limiter. All in
  `src/sim/params.ts`.
- Work is on `main` in a new local repository; no branches, no remote.
- Added to the model beyond the plan, because the physics needed them: drum viscous damping, drum
  stiction separate from sliding friction, a fork "block" that makes the drum go solid when a dog
  cannot move (this is what stops two gears engaging and makes a loaded gearbox refuse a shift).
- Tuned values: drum sliding friction 0.25 -> 0.05 N·m, static friction 0.3, gear detent peak
  2.5 -> 3.3 N·m, neutral detent peak 0.8 -> 1.65 N·m, idle throttle authority 0.15 -> 0.4.
- One builder's `git commit` was refused by its own permission check. I re-ran the tests and type
  check and committed that work myself under the standing authorization above (commit aa0e9bf).
- Per-task reviews ran alongside the next task's build when the two touched different files, to
  save wall-clock time.

Stage 2 (2D panel and controls):
- Visual identity is mine: graphite ground, steel greys, and one orange that means only "this part
  is carrying torque". Palette, type and layout are in the stage 2 plan's "Design plan".
- Free dependencies added beyond the five named: `@fontsource-variable/archivo` and
  `@fontsource-variable/jetbrains-mono` (open-licensed fonts, bundled locally so the page makes no
  network call).
- Browser checks are done with the browser tool and screenshots, not an added test framework.
- No project-scoped skills were installed (see `.claude/CAPABILITY.md`); five candidates are listed
  there for you to approve or not.
- Keyboard: Shift was removed as a clutch key (it fired on Shift+Tab); the clutch is C only.
- The torque path includes the sliding gear that carries the drive, and in 5th and 6th both halves
  of the 3rd/4th sliding piece.

Stage 3 (3D model):
- Free dependencies installed: `three`, `@types/three` (both pre-approved).
- Solids are built with the project's own prism builder instead of the library's extruder, so
  every part is a closed solid with clean shading; every generator is tested for that.
- Two lighter steel colours were added for the 3D view.

Owner requirements added during the build (recorded in the design):
- "colors are up to your discretion be unique".
- "make sure things are explained, even i don't make it i should be able to read site and fully
  understand": stage 5 now includes a How it works section, a glossary, honest "simplified model"
  labelling and `docs/MODEL.md`.

## Problems

- Stage 1 final review found that a full pedal stroke out of a false neutral skipped a gear (and
  could reach neutral from between 2nd and 3rd). Fixed in 58d6052 and confirmed by re-review.
- Parked from stage 1: the demo rider's first-to-second upshift takes about 0.32 s against a
  0.15 to 0.2 s target. Cosmetic; revisit in stage 6.
- My stage 3 plan had the gear-meshing rule wrong; a reviewer caught it before assembly, and it is
  fixed in e14f271 with tests that check every gear pair for overlap.
- The Mac went to sleep once mid-build and killed a builder; one builder was also stopped by
  accident and restarted on the owner's word.

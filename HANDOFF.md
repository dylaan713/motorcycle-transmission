# HANDOFF

## State Update (2026-11-16)

- **Done:** Design approved; stage 1 plan written. Nothing built, nothing installed, no git repository yet.
- **Next:** Overnight build of all six stages, started by the owner.

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

## Problems

- Stage 1 final review found that a full pedal stroke out of a false neutral skipped a gear (and
  could reach neutral from between 2nd and 3rd). Fix in progress; see the State Updates below.

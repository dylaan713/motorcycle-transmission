# Interactive motorcycle transmission

A static web page that simulates a motorcycle clutch and six-speed sequential gearbox and draws it
in 3D with a 2D schematic. Precedence when documents disagree: report it; do not resolve it.

- Design: `docs/superpowers/specs/2026-11-16-motorcycle-transmission-design.md`
- Plans: `docs/superpowers/plans/`
- State: `HANDOFF.md`

## Commands

- Tests: `npm test` (Vitest)
- Type check: `npm run typecheck`

Both must pass before any commit.

## Rules

- `src/sim/` is pure and deterministic: no DOM, no network, no `Math.random`, no `Date`.
- SI units inside the simulation; degrees and rpm only through `deg()` and `rpm()`.
- No manufacturer or model names anywhere.
- No paid services, assets or libraries. No network calls after page load.
- All geometry is generated in code; no downloaded third-party models.
- Git: the repository is public at github.com/dylaan713/motorcycle-transmission (owner's decision,
  2026-11-18). Ask the owner before any push. Nothing private goes into a commit.

## Capability

No project-scoped skills installed; see `.claude/CAPABILITY.md` (a local file, not published) for
the deferred and rejected sets.

## Audit context

- Correctness: the physics checks listed under "How correctness is checked" in the design are the
  contract. Tunable constants live in `src/sim/params.ts`.
- Security and legal: no user data, no accounts, no network. The layout reference site is someone
  else's credited design: structure may be borrowed, its look may not be copied.
- UI: laptop first, usable on a phone. Controls must work by keyboard and pointer.
- Copy: no brand or model names; ratios are "representative of a middleweight sport bike".

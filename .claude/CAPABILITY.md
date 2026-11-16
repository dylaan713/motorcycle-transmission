# Capability record

Intake run 2026-11-16 against the approved spec
(`docs/superpowers/specs/2026-11-16-motorcycle-transmission-design.md`) and the stage 1 plan.
Detection came from the spec and plan, not from code; re-check at the first real `package.json`.

**Type:** T2 front-end / display (static site, no database, no server).
**Planned stack:** TypeScript, Vite, Three.js, Vitest.
**ECC reference:** `~/.claude/vendor/ECC` at `d2ef268`.

## Installed

None. The owner was not present to review a manifest (unattended build), and intake never
installs on inferred approval. The global surface already covers this project's needs:
`web-design-craft`, `frontend-design`, `web-design-guidelines`, `apple-design`, the four auditors
and Superpowers for process.

## Deferred for the owner to review (not installed)

| Skill | Why it could fit |
|---|---|
| `typescript-patterns` | Strict TypeScript throughout |
| `vite-patterns` | Vite config and build optimisation from stage 2 |
| `accessibility` | WCAG 2.2 AA for the controls and panels |
| `make-interfaces-feel-better` | Polish details in stage 6 |
| `click-path-audit` | Many controls drive one shared simulation state |

## Rejected

| Skill | Reason |
|---|---|
| `search-first` | Argues for adopting dependencies; the spec generates geometry and physics in-house |
| `verification-loop` | Overlaps Superpowers' verification-before-completion |
| `design-system` | Extracts tokens from an existing codebase; there is none |
| `browser-qa` | Post-deploy checks; this build does not deploy |
| `e2e-testing` | Playwright suite with CI; no CI here, and the MCP browser covers visual checks |
| `deployment-patterns` | CI/CD and Docker; the output is static files |
| `manim-video` | Video generation, not an interactive page |
| `plan-canvas` | Process skill; Superpowers owns process |
| React, Vue and Next pools, `motion-*` | Framework mismatch: no UI framework is used |
| T1 data pool | No database or backend |

**Rules packs:** skipped (not an auto-load path; depends on ECC's hook runtime).

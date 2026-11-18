# Interactive motorcycle transmission

A web page that simulates a motorcycle's wet multi-plate clutch and six-speed sequential gearbox.
You work the throttle, the clutch lever and the gear pedal, and a 3D model and a flat schematic
show every part responding. The motion is computed from forces and inertias, not played back as
animation.

**Status: in progress.** The simulation, the 3D model, the schematic and nine guided lessons work.
The visual redesign of the page is partway through, so some readouts sit in a temporary overlay.
It is not deployed yet; run it locally with the commands below.

## How this was built

This is my project, built by directing AI coding agents. I chose the project, decided who it is
for, picked the visual direction, and required that the page and its documents explain the model
fully. AI agents wrote the code and the tests from a written design and staged plans, and other
AI agents reviewed each stage. Every commit says so in its co-author line.

The record of that process is in the repository:

- [`docs/superpowers/specs/`](docs/superpowers/specs/): the design the build worked from.
- [`docs/superpowers/plans/`](docs/superpowers/plans/): the plan for each stage.
- [`docs/MODEL.md`](docs/MODEL.md): the model in plain words. What it computes, every parameter and
  where it came from, how it was checked, and where it falls short.
- [`docs/SIMPLIFICATIONS.md`](docs/SIMPLIFICATIONS.md): what the mechanism leaves out.

## What it models

- A wet clutch with stick and slip, driven by the lever.
- Six constant-mesh gear pairs, selected by dogs, forks and a shift drum with a detent.
- The cases that make a sequential gearbox interesting: launching, a clutchless upshift, a missed
  shift, a false neutral, and the clunk into first.

## What it does not claim

This is a simplified model. The numbers are representative of a middleweight sport bike; they are
not measurements of any real gearbox, and some were tuned so that a shift behaves correctly. The
tests show that the model does what it was designed to do. They do not show that it matches a real
motorcycle, and nobody who rebuilds gearboxes has checked it. `docs/MODEL.md` lists what would
need to be measured to validate it.

## Run it

Requires Node.js.

```sh
npm install
npm run dev        # local page
npm test           # 393 tests (Vitest)
npm run typecheck  # TypeScript, no emit
npm run build      # production build
```

The simulation core in `src/sim/` is pure and deterministic: no DOM, no network, no randomness and
no clock. That is what lets the tests check gear ratios against tooth counts, road speed against
hand calculations, and angular momentum across a dog engagement.

## Credits

- Page structure inspired by <https://learn-arduino-red.vercel.app/>. Only the structure is
  borrowed; the palette, type and drawings are this project's own.
- [three.js](https://threejs.org/) (MIT) for the 3D view.
- Archivo and JetBrains Mono typefaces (SIL Open Font License 1.1), installed through Fontsource.
- All geometry is generated in code. No third-party models or images are used.

## License

No license is granted. The code is published to be read; all rights are reserved.

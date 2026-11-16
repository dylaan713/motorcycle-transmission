# Interactive motorcycle transmission — design

Date: 2026-11-16
Status: approved by the owner 2026-11-16; layout reference section added the same day, after approval

## Intent

An interactive web page where you operate a motorcycle clutch and six-speed gearbox and watch
exactly what happens inside. It has two audiences:

- **Engineering recruiters**, who open a link, give it about a minute, and judge the engineering
  judgement and the polish behind it.
- **Students**, who stay longer and should leave understanding how a sequential constant-mesh
  gearbox and a wet multi-plate clutch work.

The owner asked for it to be "really impressive and highly interactive", said effort is not a
constraint, and accepted building it in stages.

## Goals

- A visitor can ride through 1-N-2-3-4-5-6 using throttle, clutch lever and shift pedal, and see
  every part respond.
- The mechanics are correct enough that someone who has rebuilt a gearbox finds nothing wrong.
- The first ten seconds are visually striking without any instructions being read.
- A student can follow a guided tour and then explain where torque flows in each gear and what the
  clutch does.
- It opens from a link with nothing to install, and sits in the owner's portfolio.

## Non-goals

- Engine internals (pistons, valves, combustion). The engine is a torque source with inertia.
- Full motorcycle dynamics (lean, braking, wheelies, tyre slip). The bike is a mass with road load.
- Accounts, a server, saved data, analytics or any network call after the page loads.
- A model of one specific manufacturer's bike. Ratios and dimensions are representative of a
  middleweight sport bike and labelled as such, with no brand or model name.
- Phone-first design. It must be usable on a phone, but the laptop view is the one that is tuned.

## Anti-goals

- Looks impressive but is mechanically wrong (gears that visibly engage by sliding into mesh,
  shafts turning at speeds that don't match the ratios, a clutch that is just on/off).
- An animation rather than a simulation: playing canned clips per gear instead of computing state.
- So much on screen that a recruiter can't tell what they're looking at.

## Constraints

- Static site only: it must be hostable as plain files.
- No paid services, assets or libraries.
- All geometry is generated in code or made by the owner; no downloaded third-party models.
- Dependencies are installed only after the owner approves them by name.

## Approaches

Three were considered:

1. **2D cutaway only.** A flat cross-section of both shafts. Teaches best because every engagement
   is visible at once, smallest effort, but a modest first impression.
2. **Full 3D only.** A rotatable model with an exploded view. Strongest first impression, but parts
   hide each other, so it teaches worse alone.
3. **3D model with a 2D power-flow panel.** Both views driven by one simulation.

**Chosen: 3.** The owner asked for the most impressive and interactive result and removed effort as
a constraint. The 3D view is what stops a recruiter; the flat diagram is what makes a student
understand. Building the simulation and the 2D panel first gives a working, correct product early,
with the 3D view added on top of the same state.

## What gets modelled

**Drivetrain, in order of torque flow**

1. Crankshaft (torque source) and primary drive gear.
2. Clutch basket, driven by the primary gear and free to spin on the input shaft.
3. Wet multi-plate clutch: friction plates tabbed to the basket, steel plates splined to the inner
   hub, pressure plate and springs, and the release mechanism moved by the lever.
4. Input shaft, splined to the clutch hub.
5. Six constantly meshed gear pairs. In each pair one gear is fixed to its shaft and the other
   spins freely on its shaft.
6. Three sliding dog gears, splined to their shafts, that lock a free gear to its shaft.
7. Three shift forks riding in the grooves of a shift drum.
8. Shift mechanism: pedal, shift shaft, ratchet, star wheel and detent arm, which index the drum.
9. Output shaft, countershaft sprocket, chain and rear sprocket, to the rear wheel.

**Behaviour that must emerge from the simulation, not be scripted**

- Clutch slip while pulling away, with basket and hub at visibly different speeds.
- Clutch drag: with the lever pulled the input shaft still turns slowly, which is why first gear
  engages with a clunk from neutral.
- Dogs that meet face-to-face wait until relative rotation lines them up, then drop in.
- Speed matching at engagement: the input shaft is snapped to the new ratio's speed.
- A loaded gearbox resists shifting; pulling the clutch or briefly closing the throttle unloads the
  dogs and lets the shift happen. This is what makes clutchless upshifts work.
- False neutral when the drum stops between detents.
- Neutral sits as a half-step between first and second; the pattern stops at first and sixth.

## Simulation model

One simulation, independent of drawing, advanced at a fixed timestep and read by both views.
SI units throughout.

- **States:** engine speed, input shaft speed, output shaft speed (which sets road speed), shift
  drum angle, axial position of each of the three sliders, clutch lever position, throttle.
- **Engine:** torque from a throttle-and-rpm map, minus friction, with rotational inertia, an idle
  controller and a rev limiter.
- **Clutch:** stick-slip friction. Torque capacity is plates x friction coefficient x clamp force x
  mean radius, with clamp force falling as the lever is pulled. Locked when the required torque is
  under capacity, slipping otherwise, plus a small viscous drag when open.
- **Gear pairs:** rigid kinematic ratios from tooth counts.
- **Dogs:** each slider follows its fork toward the position the drum groove commands. Engagement
  needs both axial travel and angular alignment between dog and slot, with backlash. Engagement
  equalises speeds as an inelastic event weighted by the inertias on each side. Withdrawal is
  resisted in proportion to transmitted torque.
- **Vehicle:** rider-plus-bike mass reflected to the output shaft through the final drive and
  wheel radius, with rolling resistance and aerodynamic drag.

## What the visitor sees and does

- **3D view:** orbit, zoom, an exploded view, an x-ray mode that fades the cases and non-active
  gears, and click-any-part for its name and job. The active torque path glows.
- **2D power-flow panel:** flat cross-section of both shafts showing which dogs are engaged and
  the torque path, synchronised with the 3D view.
- **Controls:** throttle, clutch lever, shift pedal, rear brake, engine start/stop and reset, on
  screen (draggable) and on the keyboard.
- **Direct manipulation:** grab the shift drum and turn it by hand, or pull the clutch plates
  apart, with the engine stopped.
- **Readouts:** engine rpm, input and output shaft rpm, gear, overall ratio, road speed, clutch
  slip and transmitted torque.
- **Time control:** slow motion and pause-and-step, so a shift can be watched dog by dog.
- **Guided tour:** a short sequence of steps that sets up each situation and explains it.
- **Scenarios:** one-click setups for the interesting cases: launching, a clutchless upshift, a
  missed shift, a false neutral, the first-gear clunk.

## Layout and style reference

The owner supplied https://learn-arduino-red.vercel.app/ as inspiration (viewed 2026-11-16). It is
someone else's credited design, so its structure is borrowed and its look is not copied: this
project gets its own palette, type and illustration style.

What is taken from it:

- **One 3D stage fills the page**, on a quiet background, with the model as the hero.
- **Callout cards on leader lines** name each major part and say what it does in one line.
- **A tabbed information panel** on the right (for this project: Overview, Ratios, Live data,
  Specifications).
- **A strip of numbered lessons** along the bottom. The guided tour and scenarios in this design
  become that strip, for example "1. Meet the gearbox", "2. Pull the clutch", "3. First gear".
- **Toolbar toggles on the 3D view**, here "Show torque flow" and "Show schematic". The 2D
  power-flow panel is what the schematic toggle opens.
- **A stylised, illustrated render** with clean outlines and flat shading rather than photoreal
  metal, which also keeps the parts readable.
- **A visible loading state** with progress while geometry is generated.
- **Camera controls on screen and on keys**, with a reset-view button.

## Owner requirement added during the build (2026-11-16)

The owner's words: "make sure things are explained, even i don't make it i should be able to read
site and fully understand", and separately "colors are up to your discretion be unique".

What that adds:

- **The site explains itself.** Someone who has never seen a gearbox, and the owner who did not
  write the code, can read the page and come away able to explain both the mechanism and the
  simulation behind it.
- **A "How it works" section on the site** covering, in plain words: what each part does; how a
  shift happens step by step; what the simulation computes each instant; every simplifying
  assumption; what is left out; and where each number comes from.
- **Honest labelling.** The page says it is a simplified model. The numbers are chosen to be
  representative of a middleweight sport bike and are not measurements of a real gearbox; some
  values (drum friction and detent strength) were tuned so the modelled behaviour is right. No
  person who has rebuilt a gearbox has checked it. The site says so where it matters.
- **A plain-language model document in the repository** (`docs/MODEL.md`) that the owner can read
  before showing the project: the model, its equations, the assumptions, the tuned values and why,
  the known limits, and likely questions with answers.
- **A glossary** of every technical term the page uses.

## Stages

Each stage ends with something working that is shown to the owner before the next begins.

1. **Simulation core.** The model above, with no graphics, covered by tests.
2. **2D panel and controls.** A complete, correct, rideable product in flat form.
3. **3D model.** Generated geometry for every part, driven by the same simulation.
4. **Interaction depth.** Exploded and x-ray views, part picking, direct manipulation, time
   control.
5. **Teaching layer.** Guided tour and scenarios.
6. **Polish and publishing.** Visual finish, loading speed, phone usability, portfolio entry.

## How correctness is checked

- Shaft speeds match tooth-count ratios exactly in every gear.
- Road speed at a given rpm in each gear matches the hand calculation.
- A locked clutch shows zero slip; a slipping clutch transmits exactly its capacity.
- The shift pattern is 1-N-2-3-4-5-6, stops at both ends, and reaches neutral only from the
  half-step between first and second.
- No more than one gear pair can be locked at once, under any input sequence.
- Angular momentum is conserved across a dog engagement.

## Builder's calls (not decided by the owner)

- TypeScript, built with Vite, 3D with Three.js, tests with Vitest. Chosen because they are free,
  standard for this kind of page and produce a static site.
- Representative gear ratios, tooth counts, inertias and clutch dimensions, chosen by the builder
  from typical middleweight sport-bike values and listed in one data file.
- Gear teeth are generated procedurally as spur gears with an involute-style profile.
- Keyboard layout, colour palette, lighting and the wording of the guided tour.
- Sound is left out of the first pass; it can be added in the polish stage.

## Builder's calls added after review

These four were settled by the builder after a reviewer read the draft. The owner should check
them.

1. **The shift pedal is an analog input, and the drum is a force balance.** Pedal travel turns the
   drum through the ratchet against the detent spring and against the dogs' resistance to
   withdrawal; the drum has inertia. A short or weak stroke can leave the drum between detents, so
   false neutrals and missed shifts emerge rather than being scripted. On screen the pedal is
   dragged; on the keyboard, how long the key is held sets how far the pedal travels, so a quick
   tap is a short stroke.
2. **The engine can be off, can stall and can be started.** Dumping the clutch at idle in gear
   stalls it. With the engine off the visitor can turn the rear wheel and the input shaft by hand,
   which is how face-to-face dogs are lined up when turning the drum by hand, as a mechanic would.
3. **There is a rear brake and a reset.** The brake is a simple retarding torque at the rear wheel,
   and a reset button returns the bike to a standstill in neutral. Downshifts are in scope and
   held to the same standard as upshifts: engine braking, rev-matching and a missed downshift are
   all simulated and tested.
4. **The page opens already riding.** A scripted rider launches and works up and down the gears
   until the visitor touches any control, at which point they take over. The simulation takes its
   inputs through one interface that either the visitor or a script can drive, built in stage 1.
   Scenarios and tour steps play the event out with scripted inputs, then hand control over.

## Open items for later

- Where it is hosted and how it is linked from the portfolio (decided at stage 6).
- The folder is not yet a git repository; creating one needs the owner's go-ahead.

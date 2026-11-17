# The model, in plain words

This document explains the motorcycle clutch and gearbox simulation behind this page: what it
models, how, with which numbers, how it was checked and where it falls short. It is written so
that someone who did not write the code can read it, understand it and answer questions about it.

Figures that come from the parameter file `src/sim/params.ts` carry a hidden marker in the source
of this file. A test (`tests/content/content.test.ts`) reads every marker and fails if the figure
written here no longer matches the code. Figures without a marker are not from the parameter file:
they are worked examples, measurements of the model made while writing this, or quotes from the
build records, and each says so.

## 1. Read this first

**What it is.** An interactive web page with a live simulation of a motorcycle's wet multi-plate
clutch and six-speed sequential constant-mesh gearbox. You work the throttle, the clutch lever and
the gear pedal, and a 3D model and a flat schematic show every part responding. The page also has
nine guided lessons and a "How it works" section.

**Who built what.** The owner chose the project, set its audiences (engineering recruiters and
students), asked for it to be highly interactive, picked the visual direction ("the instrument",
one of three mockups he was shown) and required that the page explain itself fully, so that he
could read it and understand it without having written it. An AI coding agent wrote all of the
code and all of the tests under that direction, and other AI agents reviewed the work. The
builder's own calls (language, libraries, the gear numbers, the lesson wording) are recorded in the
design document under "Builder's calls".

**The honest summary.** This is a simplified model. The mechanism it shows is a real one, and the
simulation computes it from forces and inertias rather than playing animations. The numbers were
chosen to be representative of a middleweight sport bike; they are not measurements of any real
gearbox. Some values were tuned so the modeled shift behaves correctly: drum sliding friction,
drum static friction, detent strength, drum damping, the idle control's throttle limit (tuned
according to the build notes, though git shows no change), the over-rev drag and the demo rider's
settings (section 5 gives each one's history). The model's tests were written by the
same AI agent that wrote the model, and reviewed by other AI agents. No person who rebuilds
gearboxes, and no measured data, has checked it. So the tests show that the model does what it
was designed to do; they do not show that it matches a real motorcycle. Validating it would take
measurements from a real gearbox: the clutch torque capacity, the shift-drum detent force, the
timing of dog engagement during a shift, and a coast-down test for the road load.

## 2. The mechanism in plain words

**Torque** is turning force. The engine makes it at the crankshaft, and the drivetrain carries it
to the rear wheel, changing speed along the way.

1. **Primary drive.** A gear on the crankshaft (36<!-- param:primary.drive --> teeth) drives a
   larger gear (76<!-- param:primary.driven --> teeth) on the clutch basket. That slows the turning
   by 2.111<!-- param:ratio.primary --> to 1.
2. **Clutch.** The basket carries friction plates; the clutch hub carries steel plates; the two
   kinds alternate in a stack. Springs squeeze the stack through the pressure plate, and friction
   between the plates carries the drive into the hub. Pulling the lever lifts the pressure plate
   and lets the stack go: the lever pulls a cable, the cable turns the release arm, and the arm
   pushes a pushrod that runs through the hollow input shaft and lifts the plate. The plates run
   in oil, which is what "wet" means.
3. **Input shaft.** The hub turns the gearbox input shaft, which carries one gear of each of six
   gear pairs.
4. **Gear pairs.** Each pair has one gear on the input shaft and one on the output shaft, and the
   teeth of every pair are always in contact (in mesh). This is what **constant mesh** means. On
   each pair one gear turns with its shaft and the other spins freely on its shaft, so a turning
   gear is not necessarily carrying drive.
5. **Dogs.** Three pieces are splined to their shafts: they turn with the shaft but can slide
   along it. Each has stubby teeth, called dogs, on its sides. Sliding one sideways drops its dogs
   into slots in the free gear beside it, which locks that free gear to its shaft. Only then does
   that pair carry the drive. In this gearbox the fifth gear on the output shaft is a sliding gear
   that locks first or third; the sixth gear on the output shaft locks fourth or second; and third
   and fourth on the input shaft are one sliding piece that locks fifth or sixth.
6. **Shift mechanism.** The gear pedal turns the shift shaft and the arm fixed to it. The arm
   carries two pawls, hooks that push one way only: one for changing up, one for changing down.
   Six shift pins stand on the drum's end, one per position, and on each stroke one of the pawls
   pushes a pin and turns the shift drum one step. (In the simulation this linkage is a single
   spring-like push; section 4 describes it.) Three grooves run around the drum, and a
   fork rides in each; where a groove bends, its fork slides its sliding gear. A sprung roller
   (the detent arm) drops into notches on a star wheel on the drum's end and holds the drum at
   each position.
7. **Output shaft and final drive.** The output shaft turns the front sprocket
   (16<!-- param:final.front --> teeth), which pulls the chain around the rear sprocket
   (45<!-- param:final.rear --> teeth) on the rear wheel: another slowing of
   2.8125<!-- param:ratio.final --> to 1.

The drum's positions, in order, are first, neutral, second, third, fourth, fifth, sixth. It is
**sequential**: you can only step one position at a time. Neutral sits half a step between first
and second.

### Every part

These are the parts the page draws and names, with the one-line description the page shows when
you select them.

<!-- parts-table:start -->
| Group | Part | What it does |
|---|---|---|
| Clutch | Crankshaft | Turned by the pistons, it delivers the engine torque that the whole drivetrain carries. |
| Clutch | Primary drive | A gear pair that steps the crank speed down and turns the clutch basket. |
| Clutch | Clutch basket | Driven by the primary drive, it turns the friction plates through tabs that slide in its slots. |
| Clutch | Friction plates | Lined plates keyed to the basket that pass torque to the steel plates by friction when squeezed. |
| Clutch | Steel plates | Plain plates keyed to the hub that take torque from the friction plates and can slip against them. |
| Clutch | Clutch hub | Carries the steel plates and is splined to the input shaft, so the clutch torque turns the shaft. |
| Clutch | Pressure plate | Clamped by the clutch springs, it squeezes the plate stack; pulling the lever lifts it off the stack to release the clutch. |
| Clutch | Clutch release | Pulled by the lever's cable, its arm pushes a rod through the hollow input shaft that lifts the pressure plate off the plates. |
| Shafts and gears | Input shaft | Turned by the clutch hub, it carries the driving gear of every pair. |
| Shafts and gears | Output shaft | Carries the driven gear of every pair and turns the front sprocket at the speed of the locked pair. |
| Shafts and gears | First gear, input shaft | Cut into the input shaft, it drives the first-gear pair whenever the input shaft turns. |
| Shafts and gears | First gear, output shaft | Spinning free on the output shaft, it is turned by its partner and carries drive only when the fifth-gear slider locks it to the shaft. |
| Shafts and gears | Second gear, input shaft | Fixed on the end of the input shaft, it drives the second-gear pair whenever the input shaft turns. |
| Shafts and gears | Second gear, output shaft | Spinning free on the output shaft, it is turned by its partner and carries drive only when the sixth-gear slider locks it to the shaft. |
| Shafts and gears | Third gear, input shaft | Splined to the input shaft as one sliding piece with fourth, it drives the third-gear pair and slides to lock fifth or sixth with its dogs. |
| Shafts and gears | Third gear, output shaft | Spinning free on the output shaft, it is turned by its partner and carries drive only when the fifth-gear slider locks it to the shaft. |
| Shafts and gears | Fourth gear, input shaft | Splined to the input shaft as one sliding piece with third, it drives the fourth-gear pair and slides to lock fifth or sixth with its dogs. |
| Shafts and gears | Fourth gear, output shaft | Spinning free on the output shaft, it is turned by its partner and carries drive only when the sixth-gear slider locks it to the shaft. |
| Shafts and gears | Fifth gear, input shaft | Spinning free on the input shaft, it is turned by its partner and carries drive only when the sliding pair locks it to the shaft. |
| Shafts and gears | Fifth gear, output shaft | Splined to the output shaft, it slides along it to lock first or third with its dogs and drives through the fifth-gear pair when its partner is locked. |
| Shafts and gears | Sixth gear, input shaft | Spinning free on the input shaft, it is turned by its partner and carries drive only when the sliding pair locks it to the shaft. |
| Shafts and gears | Sixth gear, output shaft | Splined to the output shaft, it slides along it to lock fourth or second with its dogs and drives through the sixth-gear pair when its partner is locked. |
| Shift mechanism | Shift fork A | Rides a groove in the drum and slides the fifth-gear slider to lock first or third. |
| Shift mechanism | Shift fork B | Rides a groove in the drum and slides the sixth-gear slider to lock fourth or second. |
| Shift mechanism | Shift fork C | Rides a groove in the drum and slides the third-and-fourth piece to lock fifth or sixth. |
| Shift mechanism | Shift drum | A grooved drum whose angle sets where every fork sits, turned by the pawls through the pins on its end, so each detent selects one gear. |
| Shift mechanism | Star wheel | A notched wheel on the drum end that the detent arm's roller drops into to hold each gear. |
| Shift mechanism | Detent arm | A sprung roller that drops into the star wheel notches and holds the drum at each gear. |
| Shift mechanism | Shift shaft | Turned by the pedal, its arm's pawl catches a pin on the drum end and turns the drum on by one detent per stroke. |
| Shift mechanism | Gear pedal | The rider pushes it down or lifts it up to step the drum one gear down or up. |
| Final drive | Front sprocket | Fixed to the output shaft, it pulls the chain. |
| Final drive | Drive chain | Carries the drive from the front sprocket back to the rear sprocket. |
| Final drive | Rear sprocket | Driven by the chain, it steps the speed down once more and turns the rear wheel. |
| Final drive | Rear wheel | Turns the drivetrain torque into a push on the road. |
<!-- parts-table:end -->

### The gear ratios

Teeth are written driver:driven (input shaft gear : output shaft gear). The gearbox ratio is input
shaft turns per output shaft turn. The overall ratio multiplies in the primary drive and the chain,
so it is crankshaft turns per rear wheel turn. Road speed per 1,000 rpm and at the
15,000 rpm<!-- param:engine.limiterRpm --> rev limiter use the 0.31 m<!-- param:wheelRadius -->
wheel radius and assume no tire slip.

| Gear | Teeth | Ratio | Overall | km/h per 1,000 rpm | km/h at the limiter |
|---|---|---|---|---|---|
| 1st | 13<!-- param:gears.1.0 -->:37<!-- param:gears.1.1 --> | 2.846<!-- param:ratio.gear.1 --> | 16.90<!-- param:ratio.overall.1 --> | 6.92<!-- param:speed.kmhPer1000.1 --> | 104<!-- param:speed.limiterKmh.1 --> |
| 2nd | 17<!-- param:gears.2.0 -->:33<!-- param:gears.2.1 --> | 1.941<!-- param:ratio.gear.2 --> | 11.53<!-- param:ratio.overall.2 --> | 10.14<!-- param:speed.kmhPer1000.2 --> | 152<!-- param:speed.limiterKmh.2 --> |
| 3rd | 19<!-- param:gears.3.0 -->:31<!-- param:gears.3.1 --> | 1.632<!-- param:ratio.gear.3 --> | 9.69<!-- param:ratio.overall.3 --> | 12.06<!-- param:speed.kmhPer1000.3 --> | 181<!-- param:speed.limiterKmh.3 --> |
| 4th | 21<!-- param:gears.4.0 -->:29<!-- param:gears.4.1 --> | 1.381<!-- param:ratio.gear.4 --> | 8.20<!-- param:ratio.overall.4 --> | 14.25<!-- param:speed.kmhPer1000.4 --> | 214<!-- param:speed.limiterKmh.4 --> |
| 5th | 23<!-- param:gears.5.0 -->:27<!-- param:gears.5.1 --> | 1.174<!-- param:ratio.gear.5 --> | 6.97<!-- param:ratio.overall.5 --> | 16.77<!-- param:speed.kmhPer1000.5 --> | 252<!-- param:speed.limiterKmh.5 --> |
| 6th | 24<!-- param:gears.6.0 -->:26<!-- param:gears.6.1 --> | 1.083<!-- param:ratio.gear.6 --> | 6.43<!-- param:ratio.overall.6 --> | 18.17<!-- param:speed.kmhPer1000.6 --> | 273<!-- param:speed.limiterKmh.6 --> |

Every pair has 50 teeth in all, so every pair meshes at the same distance between the shafts, as
it must on two parallel shafts with gears of one tooth size. The speed at the limiter in sixth is
a gearing figure only: in the simulation, air resistance stops a full-throttle run in sixth at
about 254 km/h and 13,985 rpm (measured on the model while writing this, after two minutes at full
throttle).

## 3. One shift, step by step

A change from second to third, with the clutch lever pulled:

1. The rider lifts the gear pedal. The shift arm's up pawl pushes a pin on the drum's end and turns the shift drum from
   60°<!-- param:drum.detents.2 --> toward 120°<!-- param:drum.detents.3 -->. A full stroke is
   62°<!-- param:drum.strokeDeg --> of drum travel, but the pawl stops a stroke just past the next
   gear, so one stroke can never skip a gear.
2. The detent roller is pushed over the hump on the star wheel and drops into the next notch,
   which pulls the drum the rest of the way and holds it there.
3. Between 60°<!-- param:drum.detents.2 --> and 120°<!-- param:drum.detents.3 --> two grooves bend. Fork B's groove brings it back to the middle, and fork
   A's groove pushes it out.
4. Fork B slides the sixth-gear sliding gear away from second, pulling its dogs out of second's
   slots. If those dogs are carrying load, friction pinches them and they will not slide; the
   drum then stops, as if solid. That is why the rider closes the throttle or pulls the clutch.
5. Fork A slides the fifth-gear sliding gear toward third. Its dogs meet the dogs on third. If
   they line up with the slots they drop straight in. If they meet face to face they wait, pressed
   together, until the two parts turn a little against each other and a slot comes around.
6. When the dogs drop in, third gear is locked to the output shaft. In that instant the input
   shaft and the output shaft jump to speeds that fit the new ratio.
7. As the rider lets the lever out, the clutch slips until the engine slows to the speed the new
   gear needs, then locks.

Neutral is reached from first with a half stroke: about half of the full
62°<!-- param:drum.strokeDeg --> stroke carries the drum to neutral's notch. A stroke that starts
at neutral is shorter, 32°<!-- param:drum.strokeFromNeutralDeg -->, because neutral is only half a
step from first and from second.

## 4. The simulation

### State and timestep

The simulation keeps: engine speed, whether the engine is running, the angle of the crankshaft and
both shafts, input shaft speed, output shaft speed (which sets road speed), shift drum angle and
speed, the start angle of the current pedal stroke, the position of each sliding gear (from −1,
fully toward one gear, to +1, fully toward the other), which gear each has locked and whether it is
blocked face to face, the clutch capacity, torque and slip, and the torque through the locked dog.

It moves forward in fixed steps of 0.5 ms<!-- param:dt.ms --> (0.0005 s<!-- param:dt -->), so
2,000<!-- param:dt.stepsPerSecond --> steps per second of simulated time. The page runs as many
steps as real time needs each frame. The same inputs always give the same result: there is no
randomness and no clock inside the simulation.

Each step, in order: read and clean the controls; update whether the engine runs; move the shift
drum (pawl, detent, hand, friction) and stop it if a fork cannot follow; move each sliding gear
toward where its groove wants it and test its dogs; on a new engagement, jump the shaft speeds;
work out the engine, brake, rolling and air torques; decide whether the clutch is locked or
slipping; update every speed.

**Why 0.5 ms<!-- param:dt.ms -->.** No reason was written down when the value was chosen. What it has to resolve:

- The drum's own damping time, inertia ÷ damping, is 0.4 ms<!-- param:drum.dampingTimeMs -->,
  shorter than the step. The code handles this by computing the damping implicitly (from the speed
  at the end of the step), which stays stable at any step size.
- The dogs can enter over 16°<!-- param:dogs.windowDeg --> of each 72°<!-- param:dogs.pitchDeg -->.
  A dog only misses its window by jumping over it in one step if the relative speed is above
  559 rad/s<!-- param:dogs.skipOmega --> (5,333 rpm<!-- param:dogs.skipRpm -->), far above
  anything the gearbox sees during a shift.
- The clutch is judged locked when the slip is under 0.05 rad/s. The step must be short enough
  for that test and for the sticking test described below to catch slip changing sign.

**What happens if you change it.** While this document was written, the simulation and lesson
tests were run on a copy of the code with other step sizes. At 0.25 ms every test passed. At 1 ms every physics test
passed; the lesson tests failed only because they assume a 5 ms sample is ten steps, and once that
was corrected they passed too. The lesson player (`src/lessons/runner.ts`) makes the same
ten-steps assumption, so changing the step means changing it there as well.

### Engine

**What it represents.** A torque source with inertia: the engine's turning force for a given speed
and throttle, its internal drag, an idle control, a rev limiter, a starter and stalling. No
pistons, valves or combustion.

**Equations.**

- Full-throttle torque `T_full(rpm)` is read from a table, straight lines between points:
  30 N·m<!-- param:engine.torqueCurve.0.1 --> at 1,000 rpm<!-- param:engine.torqueCurve.0.0 -->,
  42 N·m<!-- param:engine.torqueCurve.1.1 --> at 4,000 rpm<!-- param:engine.torqueCurve.1.0 -->,
  55 N·m<!-- param:engine.torqueCurve.2.1 --> at 8,000 rpm<!-- param:engine.torqueCurve.2.0 -->,
  60 N·m<!-- param:engine.torqueCurve.3.1 --> at 11,000 rpm<!-- param:engine.torqueCurve.3.0 -->,
  56 N·m<!-- param:engine.torqueCurve.4.1 --> at 13,500 rpm<!-- param:engine.torqueCurve.4.0 -->,
  48 N·m<!-- param:engine.torqueCurve.5.1 --> at 15,000 rpm<!-- param:engine.torqueCurve.5.0 -->.
  Peak power from this table is about 79 kW (worked out from the table, not a parameter).
- Closed-throttle torque `T_closed = a + b × rpm`, with a = −4 N·m<!-- param:engine.closedThrottle.base -->
  and b = −0.0012 N·m per rpm<!-- param:engine.closedThrottle.perRpm -->. It is negative: this is
  engine braking.
- Running engine: `T = T_closed + θ × (T_full − T_closed) + T_over`, where θ is the larger of the
  rider's throttle (0 to 1) and the idle control's throttle.
- Idle control: `θ_idle = θ_ff + 0.4`<!-- param:engine.idleMaxThrottle -->` × (1,300`<!-- param:engine.idleRpm -->` − rpm) ÷ 300`, kept between 0 and
  0.4<!-- param:engine.idleMaxThrottle -->. θ_ff is the throttle that exactly holds
  1,300 rpm<!-- param:engine.idleRpm --> with no load, so idle settles on that speed.
- Rev limiter: above 15,000 rpm<!-- param:engine.limiterRpm --> `T_full` is zero (fuel cut). If the
  wheel forces the engine faster, as on a badly missed downshift, `T_over = −k × (rpm − 15,000`<!-- param:engine.limiterRpm -->`)`
  with k = 0.1 N·m per rpm<!-- param:engine.overRevDrag -->.
- Stopped engine: only its drag, which resists motion but never drives it backward, plus
  15 N·m<!-- param:engine.starterTorque --> from the starter when pressed. It starts running above
  600 rpm<!-- param:engine.startRpm --> and stalls below 400 rpm<!-- param:engine.stallRpm -->.
- Motion: `J_e × dω/dt = T − T_clutch ÷ 2.111`<!-- param:ratio.primary -->, with J_e = 0.012 kg·m²<!-- param:engine.inertia -->
  at the crank (0.0535 kg·m²<!-- param:inertia.engineAtInput --> as seen at the input shaft).

Symbols: T, T_full, T_closed, T_over and T_clutch are torques in N·m; θ is throttle from 0 to 1;
rpm is engine speed in revolutions per minute; ω is engine speed in rad/s; J_e is engine inertia in
kg·m²; 2.111<!-- param:ratio.primary --> is the primary ratio.

**What it gets right.** Torque that rises and falls with speed, engine braking that grows with
speed, a steady idle, stalling when the clutch is dumped at idle, a limiter, and a hard limit on
over-revving.

**What it leaves out.** Pulses from individual firings, fuel and air, engine heat, throttle lag
and any real engine map. The idle control is a simple proportional rule with a fixed offset.

### Clutch

**What it represents.** A wet multi-plate clutch: friction between plates, a capacity set by the
spring force and the lever, stick-slip between locked and slipping, and oil drag.

**Equations.**

- Capacity: `T_max = n × μ × F × r`, with n = 16<!-- param:clutch.surfaces --> friction surfaces,
  μ = 0.12<!-- param:clutch.mu -->, F = 1,800 N<!-- param:clutch.clampForce --> of spring clamp
  force and r = 0.058 m<!-- param:clutch.meanRadius --> mean radius. So
  T_max ≈ 200 N·m<!-- param:clutch.capacityMax -->.
- Lever: `T_cap = T_max × (1 − L ÷ 0.7`<!-- param:clutch.leverFullRelease -->`)`, and zero once L is 0.7<!-- param:clutch.leverFullRelease -->
  or more, where L is lever travel from 0 (released) to 1 (fully pulled).
- Oil drag: `T_drag = c × Δω`, capped at 1.5 N·m<!-- param:clutch.dragMax -->, with
  c = 0.004 N·m per rad/s<!-- param:clutch.dragCoeff --> and Δω the slip speed, basket minus hub,
  in rad/s.
- Locked or slipping: the clutch is locked when |Δω| < 0.05 rad/s and the torque needed to keep
  both sides together, T_hold, is within T_cap. Locked, the engine and everything downstream move
  as one body and the clutch carries exactly T_hold. Otherwise it slips and carries
  `sign(Δω) × T_cap + T_drag`.

Symbols: torques in N·m; n is a count; μ has no unit; F in newtons; r in meters; L from 0 to 1;
Δω in rad/s.

**How the stick-slip is handled numerically.** Friction that switches between gripping and
sliding is hard to step through time without chatter. The code does three things:

1. When the clutch is near locked (slip under 0.05 rad/s), it computes the torque that would keep
   the two sides together this step. If that fits within the capacity, both sides are stepped as
   one body from their momentum-weighted common speed.
2. When it is slipping, both sides are stepped separately with the clutch torque at full capacity.
   If the slip would change sign within the step, the plates stick for that step, but only if the
   holding torque fits within the capacity. Without that condition a fully pulled lever could
   still "stick" the clutch, which was a real defect (section 6).
3. Resistances such as shaft friction are applied so they can bring a speed to exactly zero and
   hold it there, but never reverse it.

**What it gets right.** Slip while pulling away, with basket and hub at visibly different speeds;
a locked clutch with exactly zero slip; a slipping clutch passing exactly its capacity plus drag;
drag that keeps the input shaft turning with the lever pulled. In neutral with the lever pulled,
the drag balances the input shaft's friction, 0.05 N·m<!-- param:inputShaft.friction -->, when the
shaft runs 12.5 rad/s<!-- param:clutch.dragBalanceSlip --> slower than the basket; at idle that is
about 81% of the basket's speed (measured on the model while writing this).

**What it leaves out.** One friction coefficient for gripping and sliding, where real linings grip
a little harder at rest. No heat, wear, plate warping or spring fade. A straight-line lever, where a
real clutch takes up over a short band. Oil drag as a single viscous term with a cap, where real
drag depends on oil temperature, plate gaps and speed.

### Gear ratios and shafts

**What it represents.** Rigid gears and shafts: the locked pair fixes the ratio between the shafts
exactly.

**Equations.** `ω_in = g × ω_out`, with g = output gear teeth ÷ input gear teeth for the locked
pair; overall ratio = 2.111<!-- param:ratio.primary --> × g × 2.8125<!-- param:ratio.final -->. Road speed `v = ω_out ÷ 2.8125`<!-- param:ratio.final -->` × r_w`. A free gear turns
at the speed its partner drives it.

Symbols: ω_in and ω_out are shaft speeds in rad/s; g has no unit; v in m/s; r_w is the wheel
radius, 0.31 m<!-- param:wheelRadius -->.

The input shaft and everything on it has inertia 0.004 kg·m²<!-- param:inputShaft.inertia --> and a
fixed friction of 0.05 N·m<!-- param:inputShaft.friction -->. The bike's inertia, seen at the output shaft, is
`(m × r_w² + J_wheels) ÷ 2.8125`<!-- param:ratio.final -->`²` = 3.41 kg·m²<!-- param:inertia.vehicleAtOutput -->, with both
wheels together 1.0 kg·m²<!-- param:wheelInertia -->.

**What it gets right.** Exact ratios, matched against tooth counts in every gear.

**What it leaves out.** Shaft twist, tooth flex, tooth backlash as motion of its own, friction
losses in the gears, and chain slack.

### Dogs

**What it represents.** Sliding gears whose dogs must be pushed sideways and lined up before they
engage, which hold on when loaded, and whose engagement is an instant speed match.

**Equations and rules.**

- Each sliding gear moves toward the position its groove commands at up to
  40 units per second<!-- param:dogs.sliderRate --> (one unit is full travel to one side).
- Dog faces meet at 0.5<!-- param:dogs.contactX --> of full travel. To go further the dogs must be
  aligned: with 5<!-- param:dogs.count --> dogs, one every 72°<!-- param:dogs.pitchDeg -->, a dog can enter over the first
  16°<!-- param:dogs.windowDeg --> of each pitch. Otherwise the sliding gear waits at the contact
  point, blocked, until relative turning lines the dogs up.
- On engagement of pair g: `ω_out′ = (g × J_in × ω_in + J_out × ω_out) ÷ (g² × J_in + J_out)` and
  `ω_in′ = g × ω_out′`. This keeps angular momentum, counted at the output shaft, the same before and
  after.
- Pulling a loaded dog out takes `F = μ_d × |T_dog| ÷ r_d`, with μ_d = 0.15<!-- param:dogs.mu --> and
  r_d = 0.03 m<!-- param:dogs.radius -->. The fork pushes at most 400 N<!-- param:dogs.forkForceMax -->,
  so a dog carrying more than 80 N·m<!-- param:dogs.maxPullTorque --> stays in.
- If moving the drum would make any fork lag its groove by more than
  0.25<!-- param:dogs.forkCompliance --> of full travel (and by more than it already does), the drum
  does not move that step. This one rule is what makes a loaded or blocked dog stop the drum, and
  what stops two gears ever being engaged at once.

Symbols: ω in rad/s; g has no unit; J_in is the input-side inertia (the input shaft, 0.004 kg·m²<!-- param:inputShaft.inertia -->)
and J_out the bike's inertia at the output shaft, both in kg·m²; F in newtons; T_dog in N·m; r_d in
meters.

**What it gets right.** Dogs that wait face to face and drop in when rotation lines them up; a
loaded gearbox that refuses a shift until the load comes off; no two gears at once; the clunk of
first gear from neutral.

**What it leaves out.** The speed match includes only the input shaft and the bike. If the clutch
is engaged at that moment, the engine's inertia is not part of the jump: the engine catches up a
step later through the clutch, which then slips at its capacity. Dogs engage at any speed
difference as long as they are aligned; real dogs can bounce off or ratchet over the slots when the
difference is large. The dog faces are square, with no back-cut angle that would pull them in under
load.

### Shift drum and pedal

**What it represents.** A drum with inertia, turned by the pedal through a ratchet, held by a
sprung detent, slowed by friction and damping, and stopped by the forks when a dog cannot move.

**Equations.**

- Motion: `J_d × dω/dt = T_pawl + T_detent + T_hand − c × ω − friction`, with
  J_d = 0.0002 kg·m²<!-- param:drum.inertia --> and c = 0.5 N·m·s/rad<!-- param:drum.damping -->.
- Friction: 0.05 N·m<!-- param:drum.friction --> while sliding. A drum at rest, or slower than
  0.01 rad/s, stays put while the total push on it is within 0.3 N·m<!-- param:drum.staticFriction -->.
- Detent: `T_detent = −P × sin(2π × (θ − θ_notch) ÷ spacing)`, which is zero at each notch and at
  each hump between notches and pulls toward the nearest notch. P = 3.3 N·m<!-- param:drum.detentPeak -->,
  or 1.65 N·m<!-- param:drum.neutralDetentPeak --> near neutral. Spacing is 30°<!-- param:drum.neutralStepDeg --> between first,
  neutral and second and 60°<!-- param:drum.gearStepDeg --> above second.
- Notches: first 0°<!-- param:drum.detents.1 -->, neutral 30°<!-- param:drum.detents.N -->, second
  60°<!-- param:drum.detents.2 -->, third 120°<!-- param:drum.detents.3 -->, fourth
  180°<!-- param:drum.detents.4 -->, fifth 240°<!-- param:drum.detents.5 -->, sixth
  300°<!-- param:drum.detents.6 -->. The drum stops hard at first and sixth.
- Pawl: the pedal sets a target `start ± |pedal| × stroke`, where the stroke is
  62°<!-- param:drum.strokeDeg --> (or 32°<!-- param:drum.strokeFromNeutralDeg --> starting from
  neutral), cut short just past the next gear's notch. The pawl pushes toward the target like a
  spring of 3 N·m/deg<!-- param:drum.pawlStiffness --> (172 N·m/rad<!-- param:drum.pawlStiffnessPerRad -->),
  at most 8 N·m<!-- param:drum.footTorqueMax -->, and only pushes, never pulls back. With the pedal at
  rest the ratchet re-arms where the drum is.
- Grooves: a fork is fully out within 8°<!-- param:drum.grooveFullDeg --> of its gear's notch, back
  in the middle beyond 22°<!-- param:drum.grooveZeroDeg -->, and in between in a straight line.

Symbols: J_d in kg·m²; ω in rad/s; torques in N·m; c in N·m·s/rad; P in N·m; θ is the drum angle.

**False neutral.** Near each hump the detent pull is weak. Within about
0.87°<!-- param:drum.stickBandDeg --> of the hump between second and third, it is weaker than the
static friction, so a drum stopped there stays. Between second and third no groove pushes any fork
out, so no dog is engaged: a false neutral. A full stroke from there finds the next gear.

**What it gets right.** The 1-N-2-3-4-5-6 pattern with stops at both ends; neutral only from the
half step; one gear per stroke however long the pedal is held; missed shifts and false neutrals
from weak strokes; a loaded gearbox that holds the drum.

**What it leaves out.** The detent shape is a sine wave, not a real star-wheel profile. The pawl
pushes the drum directly as a spring; it has no geometry of pins and hooks in the simulation (the
3D drawing shows them). There is no shift-shaft return spring and no lost motion in the linkage.
The friction, static friction, detent strength and damping were tuned (section 5).

### Vehicle

**What it represents.** The bike and rider as one mass, reflected to the output shaft, with rolling
resistance, air resistance and a rear brake.

**Equations.**

- Inertia at the output shaft: `J_veh = (m × r_w² + J_wheels) ÷ 2.8125`<!-- param:ratio.final -->`²`, with
  m = 270 kg<!-- param:mass --> for bike and rider, r_w = 0.31 m<!-- param:wheelRadius --> and
  J_wheels = 1.0 kg·m²<!-- param:wheelInertia -->.
- Rolling resistance at the wheel: `T_roll = C_rr × m × g × r_w`, with
  C_rr = 0.015<!-- param:crr --> and g = 9.81 m/s²<!-- param:g -->: 12.3 N·m<!-- param:road.rollingTorque -->.
- Air resistance at the wheel: `T_air = ½ × ρ × CdA × v² × r_w`, with
  ρ = 1.225 kg/m³<!-- param:airDensity --> and CdA = 0.35 m²<!-- param:cdA -->.
- Brake: up to 600 N·m<!-- param:brakeMaxTorque --> at the rear wheel, scaled by the brake input.
- In gear: `J_total × dω_in/dt = T_clutch − T_friction − (T_brake + T_roll + T_air) ÷ (2.8125`<!-- param:ratio.final -->` × g)`,
  with `J_total = J_in + J_veh ÷ g²`. In neutral the output shaft coasts on its own.

Symbols: m in kg; r_w in m; J in kg·m²; C_rr has no unit; g in m/s²; ρ in kg/m³; CdA in m²; v in
m/s; torques in N·m.

**What it gets right.** Acceleration that falls off with speed and gear, a top speed set by air
resistance, coasting, braking to a stop without rolling backward.

**What it leaves out.** Tires (no slip, no grip limit), lean, wheelies, suspension, weight
transfer, hills, wind and the front brake.

## 5. Every parameter

Source is one of: **Chosen as representative** (picked by the builder as typical of a middleweight
sport bike, not measured), **Derived** (worked out from other values) or **Tuned** (set or changed
so the modeled behavior comes out right, with its history from git and the build records).

| Name | Value | Unit | Source |
|---|---|---|---|
| `dt` | 0.0005<!-- param:dt --> | s | Chosen as representative; no reason was recorded (see section 4) |
| `primary.drive` : `primary.driven` | 36<!-- param:primary.drive --> : 76<!-- param:primary.driven --> | teeth | Chosen as representative |
| Primary ratio | 2.111<!-- param:ratio.primary --> | | Derived |
| `gears` 1st to 6th | 13<!-- param:gears.1.0 -->:37<!-- param:gears.1.1 -->, 17<!-- param:gears.2.0 -->:33<!-- param:gears.2.1 -->, 19<!-- param:gears.3.0 -->:31<!-- param:gears.3.1 -->, 21<!-- param:gears.4.0 -->:29<!-- param:gears.4.1 -->, 23<!-- param:gears.5.0 -->:27<!-- param:gears.5.1 -->, 24<!-- param:gears.6.0 -->:26<!-- param:gears.6.1 --> | teeth | Chosen as representative; every pair sums to 50 so all share one center distance |
| `final.front` : `final.rear` | 16<!-- param:final.front --> : 45<!-- param:final.rear --> | teeth | Chosen as representative |
| Final ratio | 2.8125<!-- param:ratio.final --> | | Derived |
| `wheelRadius` | 0.31<!-- param:wheelRadius --> | m | Chosen as representative |
| `mass` | 270<!-- param:mass --> | kg | Chosen as representative (bike and rider) |
| `wheelInertia` | 1.0<!-- param:wheelInertia --> | kg·m² | Chosen as representative (both wheels) |
| `cdA` | 0.35<!-- param:cdA --> | m² | Chosen as representative |
| `crr` | 0.015<!-- param:crr --> | | Chosen as representative |
| `airDensity` | 1.225<!-- param:airDensity --> | kg/m³ | Chosen as representative: standard sea-level air |
| `g` | 9.81<!-- param:g --> | m/s² | Chosen as representative: standard gravity |
| `brakeMaxTorque` | 600<!-- param:brakeMaxTorque --> | N·m | Chosen as representative |
| Bike inertia at the output shaft | 3.41<!-- param:inertia.vehicleAtOutput --> | kg·m² | Derived |
| Rolling resistance at the wheel | 12.3<!-- param:road.rollingTorque --> | N·m | Derived |
| `engine.inertia` | 0.012<!-- param:engine.inertia --> | kg·m² | Chosen as representative |
| Engine inertia at the input shaft | 0.0535<!-- param:inertia.engineAtInput --> | kg·m² | Derived |
| `engine.torqueCurve` | 30<!-- param:engine.torqueCurve.0.1 --> at 1,000<!-- param:engine.torqueCurve.0.0 -->; 42<!-- param:engine.torqueCurve.1.1 --> at 4,000<!-- param:engine.torqueCurve.1.0 -->; 55<!-- param:engine.torqueCurve.2.1 --> at 8,000<!-- param:engine.torqueCurve.2.0 -->; 60<!-- param:engine.torqueCurve.3.1 --> at 11,000<!-- param:engine.torqueCurve.3.0 -->; 56<!-- param:engine.torqueCurve.4.1 --> at 13,500<!-- param:engine.torqueCurve.4.0 -->; 48<!-- param:engine.torqueCurve.5.1 --> at 15,000<!-- param:engine.torqueCurve.5.0 --> | N·m at rpm | Chosen as representative |
| `engine.closedThrottle` | −4<!-- param:engine.closedThrottle.base --> and −0.0012<!-- param:engine.closedThrottle.perRpm --> | N·m, N·m per rpm | Chosen as representative |
| `engine.idleRpm` | 1,300<!-- param:engine.idleRpm --> | rpm | Chosen as representative |
| `engine.idleMaxThrottle` | 0.4<!-- param:engine.idleMaxThrottle --> | throttle, 0 to 1 | Tuned according to HANDOFF.md; git shows no change. HANDOFF.md says it was raised from 0.15 to 0.4, but git shows 0.4<!-- param:engine.idleMaxThrottle --> from the very first commit of the plan, and no reason is recorded. The feedforward added in commit e6044f4 is what makes idle settle at 1,300 rpm<!-- param:engine.idleRpm -->; before it, idle settled at 1,187 rpm |
| `engine.limiterRpm` | 15,000<!-- param:engine.limiterRpm --> | rpm | Chosen as representative |
| `engine.overRevDrag` | 0.1<!-- param:engine.overRevDrag --> | N·m per rpm | Tuned: added in e6044f4 (there was none before), because a clutchless downshift from sixth to first drove the engine to 18,981 rpm against the limiter; with it the peak is about 15,700 rpm |
| `engine.stallRpm` | 400<!-- param:engine.stallRpm --> | rpm | Chosen as representative |
| `engine.startRpm` | 600<!-- param:engine.startRpm --> | rpm | Chosen as representative |
| `engine.starterTorque` | 15<!-- param:engine.starterTorque --> | N·m | Chosen as representative |
| `clutch.surfaces` | 16<!-- param:clutch.surfaces --> | | Chosen as representative |
| `clutch.mu` | 0.12<!-- param:clutch.mu --> | | Chosen as representative |
| `clutch.clampForce` | 1,800<!-- param:clutch.clampForce --> | N | Chosen as representative |
| `clutch.meanRadius` | 0.058<!-- param:clutch.meanRadius --> | m | Chosen as representative |
| Clutch capacity | 200<!-- param:clutch.capacityMax --> | N·m | Derived |
| `clutch.leverFullRelease` | 0.7<!-- param:clutch.leverFullRelease --> | lever travel | Chosen as representative |
| `clutch.dragCoeff` | 0.004<!-- param:clutch.dragCoeff --> | N·m per rad/s | Chosen as representative; marked tunable in the code and never changed |
| `clutch.dragMax` | 1.5<!-- param:clutch.dragMax --> | N·m | Chosen as representative; marked tunable and never changed |
| Drag balance slip in neutral | 12.5<!-- param:clutch.dragBalanceSlip --> | rad/s | Derived |
| `inputShaft.inertia` | 0.004<!-- param:inputShaft.inertia --> | kg·m² | Chosen as representative; marked tunable and never changed |
| `inputShaft.friction` | 0.05<!-- param:inputShaft.friction --> | N·m | Chosen as representative; marked tunable and never changed |
| `drum.detents` | 0<!-- param:drum.detents.1 -->, 30<!-- param:drum.detents.N -->, 60<!-- param:drum.detents.2 -->, 120<!-- param:drum.detents.3 -->, 180<!-- param:drum.detents.4 -->, 240<!-- param:drum.detents.5 -->, 300<!-- param:drum.detents.6 --> | degrees (1, N, 2 to 6) | Chosen as representative; fixed by the rules (may not be tuned) |
| `drum.inertia` | 0.0002<!-- param:drum.inertia --> | kg·m² | Chosen as representative; marked tunable and never changed |
| `drum.friction` | 0.05<!-- param:drum.friction --> | N·m | Tuned: was 0.25, now 0.05<!-- param:drum.friction --> (commit aa0e9bf), because a heavily damped drum creeping into a notch stops where the detent pull equals friction; at 0.25 it stopped about 0.96° short of a gear and 0.87° short of neutral, outside the test's 0.5° band |
| `drum.damping` | 0.5<!-- param:drum.damping --> | N·m·s/rad | Tuned: added to the plan before any code was written, because without damping an 8 N·m pawl on this light drum would overshoot every notch; never changed since |
| `drum.staticFriction` | 0.3<!-- param:drum.staticFriction --> | N·m | Tuned: added at 0.25 (commit 30235f6) so a drum at rest can stay between notches; raised to 0.3<!-- param:drum.staticFriction --> in 8180fd8 together with the detent values, after a fix that lets a slowly creeping drum actually stick |
| `drum.detentPeak` | 3.3<!-- param:drum.detentPeak --> | N·m | Tuned: was 2.5, now 3.3<!-- param:drum.detentPeak --> (8180fd8), because a 3 N·m push by hand on the drum beat 2.5 plus sliding friction everywhere and ran the drum from second into third |
| `drum.neutralDetentPeak` | 1.65<!-- param:drum.neutralDetentPeak --> | N·m | Tuned: was 0.8, now 1.65<!-- param:drum.neutralDetentPeak --> (8180fd8), because after the sticking fix a half stroke from first stopped 0.07° short of neutral: the neutral pull was weaker than static friction |
| Static band at a hump | 0.87<!-- param:drum.stickBandDeg --> | degrees either side | Derived |
| `drum.grooveFullDeg` | 8<!-- param:drum.grooveFullDeg --> | degrees | Chosen as representative |
| `drum.grooveZeroDeg` | 22<!-- param:drum.grooveZeroDeg --> | degrees | Chosen as representative |
| `drum.strokeDeg` | 62<!-- param:drum.strokeDeg --> | degrees | Chosen as representative |
| `drum.strokeFromNeutralDeg` | 32<!-- param:drum.strokeFromNeutralDeg --> | degrees | Chosen as representative |
| `drum.pawlStiffness` | 3<!-- param:drum.pawlStiffness --> | N·m per degree | Chosen as representative; marked tunable and never changed |
| `drum.footTorqueMax` | 8<!-- param:drum.footTorqueMax --> | N·m at the drum | Chosen as representative; marked tunable and never changed |
| `dogs.count` | 5<!-- param:dogs.count --> | | Chosen as representative |
| `dogs.windowDeg` | 16<!-- param:dogs.windowDeg --> | degrees | Chosen as representative; the drawn dogs match it (72°<!-- param:dogs.pitchDeg --> pitch minus two 28° dogs) |
| `dogs.contactX` | 0.5<!-- param:dogs.contactX --> | of full travel | Chosen as representative |
| `dogs.radius` | 0.03<!-- param:dogs.radius --> | m | Chosen as representative |
| `dogs.mu` | 0.15<!-- param:dogs.mu --> | | Chosen as representative |
| Most torque a fork can pull a dog against | 80<!-- param:dogs.maxPullTorque --> | N·m | Derived |
| `dogs.forkCompliance` | 0.25<!-- param:dogs.forkCompliance --> | of full travel | Chosen as representative; marked tunable and never changed |
| `dogs.forkForceMax` | 400<!-- param:dogs.forkForceMax --> | N | Chosen as representative; marked tunable and never changed |
| `dogs.sliderRate` | 40<!-- param:dogs.sliderRate --> | full travels per second | Chosen as representative; marked tunable and never changed |
| Demo rider settings (`AP` in `src/sim/inputScript.ts`) | shift points, launch and timing values | | Tuned in commit 3d233fa so the demo rides like a competent rider: smooth controls, a launch that holds its revs, upshifts that land near the new gear's speed |

The sliders' gear assignments (`sliders` in the file) are not numbers to tune: they say which gears
each sliding piece locks, and they are described in section 2.

Also fixed in code rather than the parameter file: the 0.05 rad/s clutch lock band, the 0.01 rad/s
drum sticking speed, the 2° the pawl carries the drum past the next notch, and the 3° within which
the drum counts as seated in a notch.

## 6. How it was checked

### The tests, in plain words

- **Ratios.** Every gear ratio equals its tooth counts; the overall ratios in first and sixth match
  a hand calculation; ratios fall from first to sixth; road speed at 10,000 rpm in first and sixth
  matches the hand calculation; the bike's inertia at the output shaft matches the formula.
- **Engine.** The torque table, engine braking, idle holding the engine up and settling at idle
  speed, starting and stalling, and steeply rising drag above the limiter.
- **Clutch.** The capacity figure; a locked clutch carries exactly the load with zero slip; a
  slipping clutch carries exactly its capacity plus drag; an open clutch still drags; a fully
  pulled lever never sticks the clutch; sticking never reverses a speed; a weak clutch against a
  stopped engine slips steadily instead of chattering.
- **Shift drum.** The detent pulls toward each notch and neutral is the weakest; at each gear
  position one groove commands one slider; at no drum angle are two sliders commanded at once;
  full strokes walk 1-N-2-3-4-5-6 and stop at both ends; a short stroke does not change gear;
  holding the pedal gives one shift, not several; a drum can rest between notches; a full stroke
  from a false neutral lands on the next gear; neutral is reached only from the half step.
- **Dogs.** The 16°<!-- param:dogs.windowDeg --> in 72°<!-- param:dogs.pitchDeg --> window; aligned dogs drop straight in; face-to-face dogs wait and drop
  in when rotation lines them up; a loaded dog will not come out and an unloaded one will;
  engagement matches speeds and keeps angular momentum.
- **Whole drivetrain.** Shaft speeds match the ratio exactly in every gear; full throttle
  accelerates and the limiter holds; closing the throttle slows the bike by engine braking;
  revving in neutral does not move the bike; the brake stops the bike and never reverses it; a
  full pedal stroke under full throttle cannot pull a loaded dog.
- **Scenarios.** Pulling away (slip, then lock, no stall); dumping the clutch at idle stalls the
  engine; first gear clunks in from neutral; a full-throttle upshift is refused and a throttle dip
  lets it through; a clutched downshift raises engine speed; blocked dogs with the engine off give
  a false neutral until the wheel is turned; a weak stroke can leave the gearbox between gears;
  a forced clutchless downshift from sixth to first stays below 17,000 rpm.
- **Random inputs.** One minute of random throttle, clutch, pedal, brake and starter inputs, with
  checks every step: never more than one gear locked, the drum within its stops, the bike never
  rolling backward, every number finite, and the shafts at the locked ratio.
- **Demo rider.** It visits every gear and comes back to rest without stalling; it recovers from a
  false neutral and from a stall; its controls never jump; its launch and upshifts look like a
  competent rider's.
- **Lessons.** Every scripted lesson step is replayed against the simulation and must do what its
  text says, also with its timing stretched or squeezed by 10%.
- **This document.** Every marked figure here is checked against the code.

Who wrote them matters: the tests were written by the same AI agent that wrote the model, and
reviewed by other AI agents. They show the model is consistent with its own design. They do not
show that it matches a real gearbox, because nothing real was measured.

### Defects the reviews found, and how they were fixed

Each review read the code and ran probes against it. These are the ones that touched the physics
or what the page claims.

- **The clutch stuck with the lever pulled.** If the slip changed sign within a step, the plates
  were made to stick, even with zero capacity. Closing the throttle with the lever pulled could
  snap the engine to road speed through a clutch that was carrying nothing. Fix (197fb69): stick
  only if the holding torque fits within the capacity; a test pulls the lever, snaps the throttle
  shut and checks the clutch never locks.
- **A full stroke from a false neutral skipped a gear.** The pawl's target was the stroke start
  plus 62°<!-- param:drum.strokeDeg -->, wherever the drum rested. From the hump between second and third a full stroke reached
  fourth going up and neutral going down. Fix (58d6052): a stroke ends just past the next gear's
  notch, as a real pawl does when it picks up the next pin; tests stroke both ways from every
  reachable resting point.
- **The sticking step could reverse a speed for one step and report the wrong torque.** Fix
  (04e6750): the sticking step moves both sides from their momentum-weighted speed and reports
  the torque actually carried.
- **The clutch chattered at rest.** With the engine stopped and the lever near its release point,
  the clutch flipped between locked and slipping every step. Fix (04e6750): a stopped engine's
  drag now reacts against the plates properly; a test limits the switches.
- **No limit on over-revving.** A clutchless downshift from sixth to first drove the engine to
  18,981 rpm. Fix (e6044f4): drag rising above the limiter.
- **Idle settled at 1,187 rpm, not 1,300<!-- param:engine.idleRpm -->.** Fix (e6044f4): a feedforward throttle.
- **Neutral and a false neutral looked the same in the state.** Fix (ab53f5f): the state now says
  which notch, if any, the drum sits in.
- **The drum never stuck when it crept to a halt.** Damping only shrinks the speed, so it never
  reached exactly zero, and a weak stroke always fell back. Fix (8180fd8): below 0.01 rad/s a drum
  under a small push sticks; this forced the detent retune in section 5.
- **The demo rider's controls jumped, and its shifts were lazy.** Fix (3d233fa): every control
  moves at a bounded rate and shifts were reworked. One residue is parked: the first-to-second
  upshift interrupts drive for about 0.32 s against a target of 0.15 to 0.2 s.
- **The torque path skipped the sliding gear** that carries the drive. Fixed in 908a443 and
  fd3a43c; in fifth and sixth both halves of the third-and-fourth piece are on the path.
- **The wrong gear-mesh rule.** The plan for the 3D gears had the rule for how two meshing gears
  are turned against each other wrong, so teeth would overlap. A reviewer caught it before the
  model was assembled; fixed in e14f271 with tests that check every pair for overlap.
- **Sliding gears out of mesh.** At some positions the fifth and sixth sliding gears slid too far
  from their partners; fixed in 135e5ab with a minimum overlap rule tested at every position.
- **The mirrored bike.** An earlier ruling fixed the bike appearing to run backward by mirroring
  the layout, which put the chain and gear pedal on the bike's right and the clutch on the left,
  the opposite of nearly every motorcycle. A later review caught it, and the chain and pedal were
  restored to the left, the clutch to the right, with forward rotation (3bfbd03).
- **Missing mechanism.** The same review found no clutch release mechanism, a pawl with nothing to
  push, and a clutch basket floating on the shaft. The release rod and arm, the pins on the drum
  with two pawls to push them, and the bushing the basket runs on were added (acb4f97).
- **Lesson copy that said wrong things.** For example "at each gear position only one groove is
  bent" (the bends sit between positions, and one change moves two forks) and "the input shaft
  loses speed only slowly" (it settles at most of the basket's speed). Fixed in 0b8d3ec.
- **Plan errors.** The first plan's drum had no damping and would have overshot every notch; the
  stage 2 brief had sign conventions wrong where the code was right. Both were caught before or
  during review.

What the reviews got wrong or missed: the mirrored bike was introduced by a review ruling; the
mesh rule error was the planner's own; and HANDOFF.md records an idle tuning (0.15 to 0.4) that git
does not show. None of the reviews involved a person who works on gearboxes.

## 7. Known limits, and what a sharp reviewer might probe

- **Nothing is measured.** Every value is chosen, derived or tuned. The behavior is plausible, not
  validated.
- **Tuned drum values.** The false neutral exists because static friction outweighs the detent
  near a hump, over about ±0.87°<!-- param:drum.stickBandDeg -->. The lesson's weak stroke (0.479 of full pedal travel) lands there
  only in a narrow window, roughly 0.472 to 0.486, found by sweeping. On a real gearbox false
  neutrals come from the detent profile, the linkage's lost motion and the dogs; here they come
  from one tuned friction band. The margin that keeps neutral the weakest notch is thin, about 5%.
- **Instant engagement.** Dogs lock in one step with an instant speed jump. There is no dog bounce,
  no impact force, no back-cut, and the engine's inertia joins only through the clutch afterward.
- **No limit on engagement speed.** Aligned dogs engage at any relative speed.
- **The clutch.** One friction coefficient, a straight-line lever, no heat. Real clutches grip a
  little harder at rest than sliding, which matters for judder and for how a launch feels.
- **The engine.** A smooth average torque, no firing pulses, no throttle lag.
- **Road load.** CdA and rolling resistance are guesses; the top speed (about 254 km/h in the
  model) depends directly on them.
- **Timestep coupling.** The lessons and the lesson player assume a 0.5 ms<!-- param:dt.ms --> step when they sample
  the run every 5 ms.
- **The drawing.** Fork compliance is in the simulation but not drawn; the pressure-plate lift is
  exaggerated; dogs and their travel (4 mm) are drawn shallower than real ones for clarity; the
  crankshaft is a stub; the 3D model draws no bearings, snap rings or thrust washers apart from the
  basket bushing (the flat schematic draws a bearing where each shaft passes the case wall and the
  basket's needle bearing); the chain advances one link per sprocket tooth; the gear teeth are
  standard involute teeth with no profile shift, so the 13<!-- param:gears.1.0 -->-tooth first gear would foul its partner
  by a few micrometers.

## 8. Questions you may be asked

Answers are in the first person, for the owner to say out loud. Sentences marked
[owner: confirm or edit] speak for the owner and should be checked by him before use.

### Did you write this code?

No. I directed it. I chose the project, decided who it is for (engineering recruiters and
students), asked for it to be highly interactive, picked the visual direction from three options,
and required that the page explain everything, including to me. [owner: confirm or edit] An AI
coding agent wrote the code and the tests under that direction, and other AI agents reviewed it.
What I can do is explain how it works, what it assumes and where it is wrong, which is what this
document is for. [owner: confirm or edit]

### How do you know it is right?

I know it is consistent: the tests check the ratios against tooth counts, road speed against hand
calculations, that a locked clutch has zero slip, that a slipping clutch passes exactly its
capacity, that only one gear can ever be locked, that momentum is kept across a dog engagement,
and that every lesson does what its text says. I do not know that it matches a real gearbox,
because nothing was measured and nobody who rebuilds gearboxes has checked it.

### Why is neutral between first and second?

So you can find it from first with a half lift of the pedal, and so a full stroke from first goes
straight to second. You never pass through neutral between the other gears, which would be
dangerous at speed. In the model, neutral's notch is half a step, 30°<!-- param:drum.neutralStepDeg --> of drum, and its detent is
weaker, so a half stroke finds it and a full stroke carries past it.

### Why can you shift without the clutch?

Because the gears are always in mesh, a shift only slides dogs. A dog carrying load is pinched by
friction: in the model, pulling one out takes force in proportion to the torque on it, and the
fork can only push so hard, so above about 80 N·m<!-- param:dogs.maxPullTorque --> it stays in and the drum stops. Close the
throttle for an instant and the torque drops, the dog slides out, and the next gear's dogs drop in.

### What is a false neutral and why does it happen here?

It is the gearbox sitting between two gears with no dogs engaged. Here it happens when a weak
pedal stroke leaves the drum near the hump between two notches. Within about 0.87°<!-- param:drum.stickBandDeg --> of the hump the
detent pull is weaker than the drum's static friction, so the drum stays there, and no groove is
pushing any fork out. I would say plainly that this band comes from tuned values.

### What is the timestep and what happens if you change it?

Half a millisecond: 2,000<!-- param:dt.stepsPerSecond --> steps per simulated second. It has to resolve the shift drum, whose
damping time is under half a millisecond, the dogs' 16°<!-- param:dogs.windowDeg --> window and the clutch's lock test. When
the model was checked at a quarter of a millisecond everything passed; at a millisecond the
physics tests passed and the lesson checks needed their sampling corrected. No reason for 0.5 ms<!-- param:dt.ms -->
was recorded when it was chosen.

### How is the clutch's stick-slip handled numerically?

Near zero slip, the code asks what torque would keep both sides together this step. If that fits
within the clutch's capacity, it moves them as one body. Otherwise each side moves on its own with
the clutch at full capacity. If the slip would change sign within a step, the plates stick for
that step, but only if the holding torque fits. That last condition was a bug fix: without it the
clutch could stick with the lever fully pulled.

### Where do the numbers come from?

They were chosen to be representative of a middleweight sport bike: tooth counts, mass, wheel
size, a torque curve peaking at 60 N·m<!-- param:engine.torqueCurve.3.1 -->, a 200 N·m<!-- param:clutch.capacityMax --> clutch. Some were derived from those, and a few
were tuned so the shift behaves correctly, mainly the shift drum's friction and detent strength.
None were measured, and no manufacturer's figures were used.

### What would you measure to validate it?

The clutch's torque capacity against lever position on a real clutch; the detent force and the
drum's friction on a real shift drum; dog engagement timing during real shifts, for example with
a drum-angle sensor and shaft speed sensors; and a coast-down test of a real bike for the road
load. Then I would compare a recorded shift with the model's.

### What is the biggest simplification?

Dog engagement. It is an instant, momentum-keeping speed jump with no impact, no bounce and no
limit on the speed difference, and the engine only joins in through the clutch afterward. Real
engagement is a short, violent event, and that is where gearboxes get damaged.

### Why are the dogs given a 16°<!-- param:dogs.windowDeg --> window?

With five dogs, one every 72°<!-- param:dogs.pitchDeg -->, the dog itself and the slot's lug take up most of the circle. The
16°<!-- param:dogs.windowDeg --> is the free play left over: in the drawing, 72°<!-- param:dogs.pitchDeg --> minus two 28° dogs. A dog can only drop in
when it is within that window. It was chosen as representative, not taken from a real part.

### What breaks if the dogs had no backlash?

Engagement. The 16°<!-- param:dogs.windowDeg --> window is the backlash: the free play between a
dog and the slot it enters. With no window, the alignment test (the dog's angle within the window
of each 72°<!-- param:dogs.pitchDeg --> pitch) could never pass, so a sliding gear would sit
blocked against the dogs forever and no gear would go in. A real gearbox is the same: a dog exactly
as wide as its slot could only enter if the two parts stood perfectly still and perfectly lined up,
which is why real dogs have generous play.

### What did the reviews get wrong or catch?

They caught real defects: a pedal stroke that could skip a gear from a false neutral, a clutch
that could stick with the lever pulled, an engine that could be forced to nearly 19,000 rpm, a
wrong rule for how gears mesh in the drawing, and a 3D bike drawn mirrored, with the chain on the
wrong side. Each was fixed with a test that would catch it again. They also got things wrong: the
mirrored bike came from an earlier review ruling. And no reviewer was a person who works on
gearboxes.

### What would you do next?

Get it checked by someone who rebuilds gearboxes, and measure the clutch and the shift drum on a
real bike. In the model I would add the engine's inertia to the dog engagement, a limit on the
speed at which dogs can engage, and a separate gripping and sliding friction for the clutch.
[owner: confirm or edit]

### What is a constant-mesh gearbox, in one sentence?

All the gear pairs are always meshed; a gear is chosen by locking one free gear to its shaft with
dogs, not by sliding gears into mesh.

### Why does first gear clunk from neutral?

With the clutch pulled, oil drag keeps the input shaft spinning at most of the clutch basket's speed. The
bike is standing still, so when the dogs for first drop in, they stop that shaft dead. In the
model the input shaft goes from spinning to nearly still in under 50 ms.

### Why does a loaded gearbox refuse to shift?

The dogs carrying the drive are pressed against the sides of their slots. Friction there resists
the fork. In the model, if moving the drum would make a fork fall more than a quarter of its
travel behind its groove, the drum does not move.

### What happens if you dump the clutch at idle?

The clutch locks almost at once and tries to bring a standing bike up to the speed the engine is
turning. An idling engine has nowhere near that much torque, so it slows below 400 rpm<!-- param:engine.stallRpm --> and stalls.

### Is the simulation deterministic?

Yes. There is no randomness and no clock inside it, so the same inputs give the same run. That is
what lets the tests and the lessons replay exactly.

### Why TypeScript and a browser?

So it opens from a link with nothing to install. The simulation runs in the page at 2,000<!-- param:dt.stepsPerSecond --> steps
per second of simulated time, which is light enough for a laptop or a phone.

## 9. Glossary

<!-- glossary:start -->
- **Air resistance**: The push of the air against a moving bike, which grows with the square of its speed.
- **Angular momentum**: How much turning motion a spinning part carries: its inertia times its speed of rotation.
- **Backlash**: The small free play between two parts that drive each other, such as a dog and the slot it sits in.
- **Bearing**: A part that lets a shaft turn smoothly inside a housing or another part, usually with rollers or balls.
- **Bushing**: A plain sleeve that a turning part runs on, used where a bearing with rollers is not needed.
- **Chain**: The loop of steel links that carries drive from the front sprocket to the rear sprocket.
- **Clamp force**: How hard the springs squeeze the clutch plates together, in newtons.
- **Clunk**: The noise and jolt when first gear goes in from neutral and the dogs stop the still-spinning input shaft dead.
- **Clutch basket**: The outer drum of the clutch, turned by the engine through the primary drive, with slots that drive the friction plates.
- **Clutch capacity**: The most turning force the clutch can pass before its plates slide past each other.
- **Clutch hub**: The inner part of the clutch that carries the steel plates and turns the input shaft.
- **Clutch lever**: The handlebar lever the rider pulls to spread the clutch plates apart and disconnect the engine.
- **Clutch slip**: The clutch plates sliding past each other while still pressed together, so the engine side and the gearbox side turn at different speeds.
- **Clutchless upshift**: A change to the next gear up made without the clutch, by easing the throttle for an instant so the dogs are free to slide out.
- **Coast-down test**: A test in which a vehicle rolls freely from speed while its slowing is recorded, which measures its rolling and air resistance.
- **Coefficient of friction**: A number that says how much sideways grip two surfaces give for each newton pressing them together.
- **Compliance**: How far a part can bend or give under load, here the play that lets a shift fork lag behind its groove.
- **Constant mesh**: A gearbox layout in which every gear pair is always in contact and gears are chosen by locking one free gear to its shaft.
- **Crankpin**: The offset pin on the crankshaft that a connecting rod turns around.
- **Crankshaft**: The engine shaft that the pistons turn, and the start of the drivetrain.
- **Damping**: A resistance that grows with speed and calms motion so a part settles instead of bouncing.
- **Detent**: A sprung catch that holds a part in one of several set positions, here a roller dropping into a notch at each gear.
- **Detent arm**: The sprung arm with a roller that presses into the notches of the star wheel and holds the shift drum at each position.
- **Dog**: A stubby tooth on the side of a sliding gear that drops into a slot in the gear beside it and locks the two together.
- **Downshift**: A change to the next lower gear, which makes the engine turn faster for the same road speed.
- **Engine braking**: The slowing a closed-throttle engine gives the bike through the drivetrain, from its own internal drag.
- **False neutral**: A neutral found by accident between two gears, when the shift drum stops partway and no dogs are engaged.
- **Final drive**: The front sprocket, chain and rear sprocket, which carry drive from the gearbox to the rear wheel and slow it once more.
- **Free gear**: A gear that spins loosely on its shaft and carries drive only when dogs lock it to that shaft.
- **Friction plate**: A clutch plate faced with a grippy lining and keyed to the clutch basket.
- **Gear pair**: Two gears, one on each shaft, whose teeth are always in contact.
- **Gear pedal**: The foot lever the rider lifts to change up a gear or presses to change down.
- **Gear ratio**: How many turns one shaft makes for each turn of another, set by the tooth counts of the gears between them.
- **Groove**: A track cut around the shift drum that a fork pin rides in, so turning the drum moves the fork sideways where the track bends.
- **Hump**: The high point between two notches on the star wheel that the detent roller must be pushed over.
- **Idle**: The slowest speed at which the engine runs steadily on its own with the throttle closed.
- **Inertia**: How hard a part is to speed up or slow down; for turning parts it is measured in kg·m².
- **Input shaft**: The gearbox shaft turned by the clutch, which carries one gear of every pair.
- **Involute**: The curved tooth shape used on almost all gears, which keeps the speed ratio steady as the teeth roll together.
- **Locked**: Said of a clutch whose plates grip without sliding, so both sides turn at exactly the same speed.
- **Mesh**: Two gears are in this state when their teeth are engaged with each other.
- **Middleweight sport bike**: A road motorcycle built for performance with an engine of roughly 600 to 800 cubic centimeters.
- **N·m**: Newton meters, the unit of turning force: one newton pushing at the end of a one-meter arm.
- **Neutral**: The gearbox position in which no gear pair is locked, so the engine can run while the rear wheel stands still.
- **Notch**: A dip on the star wheel that the detent roller drops into, one for each gear and one for neutral.
- **Output shaft**: The gearbox shaft that carries the other gear of every pair and turns the front sprocket.
- **Pawl**: A hooked arm that pushes a wheel or pin around in one direction only, here turning the shift drum one step per stroke.
- **Pedal stroke**: One movement of the gear pedal up or down and back, which turns the shift drum by at most one step.
- **Piston**: The part that combustion pushes down inside an engine cylinder; this model does not include it.
- **Pressure plate**: The plate the clutch springs press on to squeeze the plate stack, lifted off it when the lever is pulled.
- **Primary drive**: The pair of gears that carries drive from the crankshaft to the clutch basket and slows it down on the way.
- **Profile shift**: A small change to a gear tooth shape, used on real gears with few teeth so they do not foul their partner.
- **Pushrod**: A thin rod that passes a push along its length, here from the clutch release arm through the hollow input shaft to the pressure plate.
- **rad/s**: Radians per second, the unit of turning speed used inside the simulation; one turn is 2π radians.
- **Ratchet**: A mechanism that lets motion through in one direction and slips back freely in the other.
- **Rev limiter**: An engine control that cuts power above a set engine speed so the engine is not damaged.
- **Rev-matching**: Opening the throttle briefly during a downshift so the engine is already turning at the speed the lower gear needs.
- **Road load**: The total of rolling resistance and air resistance that the engine must overcome to keep the bike moving.
- **Rolling resistance**: The steady drag of the tires flexing as they roll, roughly proportional to the weight on them.
- **rpm**: Revolutions per minute, the usual unit of engine speed.
- **Sequential gearbox**: A gearbox whose gears can only be selected in order, one step up or down at a time.
- **Shift drum**: A grooved cylinder whose angle sets where every fork sits, so each of its positions selects one gear.
- **Shift fork**: An arm that rides in a groove of the drum and slides a sliding gear along its shaft.
- **Shift pin**: One of the six short pins standing on the end of the shift drum, which the pawls push to turn the drum one step at a time.
- **Shift shaft**: The shaft turned by the gear pedal, whose arm carries the two pawls that step the drum on.
- **Sliding friction**: The friction between surfaces that are already moving past each other.
- **Sliding gear**: A gear splined to its shaft so it turns with the shaft but can slide along it, carrying dogs on its sides.
- **Snap ring**: A springy split ring that sits in a groove on a shaft to stop a part sliding off it.
- **Spline**: A set of matching ridges and slots that makes two parts turn together while letting one slide along the other.
- **Sprocket**: A toothed wheel that drives or is driven by a chain.
- **Stall**: An engine stopping because a load slowed it below the speed at which it can keep running.
- **Star wheel**: A notched wheel on the end of the shift drum that the detent roller works against.
- **Starter**: An electric motor that spins the engine until it fires and runs by itself.
- **Static friction**: The grip that holds two surfaces at rest against each other, often a little stronger than the grip once they move.
- **Steel plate**: A plain metal clutch plate keyed to the clutch hub, sandwiched between the lined plates.
- **Stick-slip**: Motion that switches between gripping and sliding, as a clutch does when it locks and lets go.
- **Thrust washer**: A flat ring that takes the sideways push of a gear against its neighbor or the case.
- **Throttle**: The twist grip that controls how much power the engine makes, from closed to fully open.
- **Timestep**: The fixed slice of time the simulation moves forward in one calculation, here half a millisecond.
- **Torque**: Turning force, measured in newton meters.
- **Torque map**: A table giving the engine’s turning force at each speed and throttle opening.
- **Torque path**: The chain of parts that is carrying the engine’s turning force at a given moment, drawn in orange on the page.
- **Upshift**: A change to the next higher gear, which makes the engine turn slower for the same road speed.
- **Viscous drag**: Resistance from a fluid such as oil that grows with the speed difference across it.
- **Wet multi-plate clutch**: A clutch with a stack of alternating plates running in oil, the usual motorcycle design.
<!-- glossary:end -->

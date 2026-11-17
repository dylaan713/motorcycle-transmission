import { PARAMS } from '../sim/params';
import {
  finalRatio, gearRatio, overallRatio, primaryRatio, reflectedVehicleInertia, roadSpeed,
} from '../sim/kinematics';
import { clutchCapacityMax } from '../sim/clutch';
import { deg, rpm } from '../sim/units';
import { ORDINAL, PART_GROUPS, PARTS, type PartId } from '../model/parts';
import type { GearId, SliderId } from '../sim/types';

/** A block of copy: a paragraph, a list (numbered when ordered), a formula, or a table. */
export type Block =
  | { kind: 'p'; text: string }
  | { kind: 'list'; items: string[]; ordered?: true }
  | { kind: 'formula'; label: string; expr: string; where: string }
  | { kind: 'table'; head: string[]; rows: string[][] };
export interface Section { id: string; heading: string; blocks: Block[] }

const GEARS: readonly GearId[] = [1, 2, 3, 4, 5, 6];
const SLIDER_IDS: readonly SliderId[] = ['A', 'B', 'C'];
const KMH = 3.6;

/** Road speed in km/h for an engine speed in rpm in gear g. */
const kmh = (engineRpm: number, g: GearId): number => roadSpeed(rpm(engineRpm) / primaryRatio / gearRatio(g)) * KMH;

/**
 * Figures the copy and docs/MODEL.md quote that are worked out from PARAMS rather than stored in
 * it. MODEL.md marks each one with <!-- param:key -->, and a test checks the number written there.
 */
export const DERIVED: Readonly<Record<string, number>> = {
  'clutch.capacityMax': clutchCapacityMax,
  // with the lever pulled in neutral, oil drag balances the input shaft's friction at this slip
  'clutch.dragBalanceSlip': PARAMS.inputShaft.friction / PARAMS.clutch.dragCoeff,
  'ratio.primary': primaryRatio,
  'ratio.final': finalRatio,
  ...Object.fromEntries(GEARS.map((g) => [`ratio.gear.${g}`, gearRatio(g)])),
  ...Object.fromEntries(GEARS.map((g) => [`ratio.overall.${g}`, overallRatio(g)])),
  ...Object.fromEntries(GEARS.map((g) => [`speed.kmhPer1000.${g}`, kmh(1000, g)])),
  ...Object.fromEntries(GEARS.map((g) => [`speed.limiterKmh.${g}`, kmh(PARAMS.engine.limiterRpm, g)])),
  'drum.neutralStepDeg': PARAMS.drum.detents.N - PARAMS.drum.detents[1],
  'drum.gearStepDeg': PARAMS.drum.detents[3] - PARAMS.drum.detents[2],
  'dt.ms': PARAMS.dt * 1000,
  'dt.stepsPerSecond': 1 / PARAMS.dt,
  'dogs.pitchDeg': 360 / PARAMS.dogs.count,
  // the torque at which the fork's full push just equals the friction pinching a dog
  'dogs.maxPullTorque': (PARAMS.dogs.forkForceMax * PARAMS.dogs.radius) / PARAMS.dogs.mu,
  // relative speed at which a dog would cross its whole alignment window in one timestep
  'dogs.skipOmega': deg(PARAMS.dogs.windowDeg) / PARAMS.dt,
  'dogs.skipRpm': (deg(PARAMS.dogs.windowDeg) / PARAMS.dt) * 60 / (2 * Math.PI),
  'inertia.vehicleAtOutput': reflectedVehicleInertia,
  'inertia.engineAtInput': PARAMS.engine.inertia * primaryRatio ** 2,
  'road.rollingTorque': PARAMS.crr * PARAMS.mass * PARAMS.g * PARAMS.wheelRadius,
  'drum.dampingTimeMs': (PARAMS.drum.inertia / PARAMS.drum.damping) * 1000,
  'drum.pawlStiffnessPerRad': PARAMS.drum.pawlStiffness / deg(1),
  // half-width of the band around a hump in which static friction outweighs the detent spring
  'drum.stickBandDeg': (Math.asin(PARAMS.drum.staticFriction / PARAMS.drum.detentPeak) / (2 * Math.PI))
    * (PARAMS.drum.detents[3] - PARAMS.drum.detents[2]),
};

/** A number in US style with a fixed number of decimals: 15000 -> "15,000". */
const fmt = (x: number, decimals = 0): string =>
  x.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
const teeth = (g: GearId): string => `${PARAMS.gears[g][0]}:${PARAMS.gears[g][1]}`;
const part = (id: PartId): string => `${PARTS[id].name}: ${PARTS[id].role}`;
/** The slider that locks gear g, and the shaft it slides on. */
const sliderFor = (g: GearId): SliderId =>
  SLIDER_IDS.find((k) => PARAMS.sliders[k].neg === g || PARAMS.sliders[k].pos === g)!;
const forkOf = (s: SliderId): PartId => (`fork${s}` as PartId);
/** Parts that carry the drive, crank to rear wheel (the gears are described as pairs). */
const ON_PATH: ReadonlySet<PartId> = new Set<PartId>([
  'crank', 'primaryDrive', 'clutchBasket', 'frictionPlates', 'steelPlates', 'clutchHub', 'inputShaft',
  'outputShaft', 'sprocket', 'chain', 'rearSprocket', 'rearWheel',
]);

const HONEST = [
  'This is a simplified model.',
  'The numbers are chosen to be representative of a middleweight sport bike; they are not measurements of any real gearbox.',
  'A few values were tuned so the modeled shift behaves correctly; the table under "Where the numbers come from" names them.',
].join(' ');

const WHO = 'The code and its tests were written by an AI coding agent under the owner’s direction, so the tests were written by the same AI agent that wrote the model, and they were reviewed by other AI agents. No person who rebuilds gearboxes, and no measured data, has checked it.';

function what(): Section {
  const D = PARAMS.drum.detents;
  return {
    id: 'what',
    heading: 'What you are looking at',
    blocks: [
      { kind: 'p', text: 'This is the clutch and gearbox of a motorcycle, running live. The clutch is a wet multi-plate clutch: a stack of plates running in oil. The gearbox is a six-speed sequential gearbox of the constant-mesh kind, the layout most motorcycles use: you can only step one gear up or down at a time.' },
      { kind: 'p', text: `A simulation works out every speed and turning force ${fmt(1 / PARAMS.dt)} times for each second of riding, and the drawing shows what it worked out. Nothing is a canned animation. When a gear goes in, it is because the parts in the simulation lined up.` },
      { kind: 'p', text: `The gear pattern is first, neutral, then second to sixth: first at the bottom, neutral half a step above it (the shift drum turns ${fmt(D.N - D[1])}° from first to neutral and ${fmt(D[3] - D[2])}° between other gears).` },
      { kind: 'p', text: HONEST },
      { kind: 'p', text: WHO },
    ],
  };
}

function parts(): Section {
  const pairs = GEARS.map((g) => `${ORDINAL[g].short} ${teeth(g)}`).join(', ');
  return {
    id: 'parts',
    heading: 'The parts, in the order torque flows',
    blocks: [
      { kind: 'p', text: 'Torque is turning force. It starts at the engine and passes through these parts, one after another, to the rear wheel.' },
      {
        kind: 'list',
        ordered: true,
        items: [
          part('crank'), part('primaryDrive'), part('clutchBasket'), part('frictionPlates'), part('steelPlates'),
          part('clutchHub'), part('inputShaft'),
          `Gear pairs: six pairs, one gear of each on each shaft, always in mesh. Teeth, written driver:driven: ${pairs}.`,
          'Sliding gears and dogs: three pieces turn with their shafts but can slide along them. The stubby teeth on their sides, called dogs, lock one free gear to its shaft, and that pair carries the drive.',
          part('outputShaft'), part('sprocket'), part('chain'), part('rearSprocket'), part('rearWheel'),
        ],
      },
      { kind: 'p', text: 'These parts do not carry the drive but decide where it goes:' },
      {
        kind: 'list',
        items: PART_GROUPS.flatMap((g) => g.parts).filter((id) => !ON_PATH.has(id) && !id.startsWith('gear')).map(part),
      },
    ],
  };
}

function constantMesh(): Section {
  const free = (shaft: 'input' | 'output'): string => GEARS.filter((g) => (g <= 4 ? 'output' : 'input') === shaft)
    .map((g) => ORDINAL[g].word).join(', ');
  return {
    id: 'constant-mesh',
    heading: 'Constant mesh, in one paragraph',
    blocks: [
      { kind: 'p', text: `Every gear pair is always meshed: its teeth are always in contact, so all six pairs turn whenever the shafts turn. On each pair, one gear turns with its shaft and the other spins free on its shaft, so turning is not the same as driving. Here the free gears are ${free('output')} on the output shaft and ${free('input')} on the input shaft. A shift does not slide gears into mesh. It slides a gear that is splined to its shaft, and the dogs on its side drop into slots in the free gear next to it. That locks the free gear to its shaft, and only then does its pair carry the drive. Three sliding pieces with dogs on both sides cover all six gears, and the shift drum makes sure only one of them is engaged at a time.` },
    ],
  };
}

function oneShift(): Section {
  const D = PARAMS.drum.detents;
  const out = sliderFor(2);
  const into = sliderFor(3);
  return {
    id: 'one-shift',
    heading: 'What happens in one shift',
    blocks: [
      { kind: 'p', text: `Take a change from second to third with the clutch lever pulled. The steps take a few hundredths of a second.` },
      {
        kind: 'list',
        ordered: true,
        items: [
          `The rider lifts the gear pedal. The pedal turns the shift shaft, and its pawl, a hook that pushes one way only, turns the shift drum one step: from ${fmt(D[2])}° to ${fmt(D[3])}°.`,
          'A sprung roller, the detent arm, is pushed over the hump on the star wheel and drops into the next notch, which holds the drum there.',
          `Each shift fork rides in a groove around the drum. Where a groove bends, its fork is pushed sideways. On this step two grooves bend: ${PARTS[forkOf(out)].name} moves back to the middle and ${PARTS[forkOf(into)].name} moves out.`,
          'The first fork slides its gear away from second, pulling its dogs out of their slots. A dog carrying load is pinched by friction and will not come out, which is why the throttle is closed or the clutch pulled for a shift.',
          'The second fork slides its gear toward third. Its dogs meet the dogs on the third gear. If they line up with the slots they drop straight in. If they meet face to face they wait, pressed together, until the two parts turn a little against each other and a slot comes round.',
          'When the dogs drop in, third gear is locked to its shaft. The shaft speeds jump to the new ratio in that instant. When the lever comes out, the clutch slips for a moment until the engine is turning at the speed the new gear needs, then grips.',
        ],
      },
    ],
  };
}

function clutch(): Section {
  const C = PARAMS.clutch;
  return {
    id: 'clutch',
    heading: 'The clutch',
    blocks: [
      { kind: 'p', text: 'The clutch is a stack of plates. Friction plates turn with the clutch basket, which the engine drives. Steel plates turn with the clutch hub, which turns the input shaft. Springs squeeze the stack through the pressure plate, and friction between the plates carries the drive. Pulling the lever lifts the pressure plate and lets the stack go.' },
      {
        kind: 'formula',
        label: 'Torque capacity',
        expr: `T_max = n × μ × F × r = ${C.surfaces} × ${C.mu} × ${fmt(C.clampForce)} N × ${C.meanRadius} m ≈ ${clutchCapacityMax.toFixed(0)} N·m`,
        where: 'T_max is the most torque the clutch can carry before it slips (N·m); n is the number of friction surfaces; μ is the coefficient of friction between the plates; F is the spring clamp force (N); r is the mean radius of the friction surfaces (m).',
      },
      {
        kind: 'formula',
        label: 'The lever',
        expr: `T_cap = T_max × (1 − L ÷ ${C.leverFullRelease}), and 0 once L ≥ ${C.leverFullRelease}`,
        where: `T_cap is the capacity right now (N·m); L is lever travel, from 0 released to 1 fully pulled, so the clutch carries nothing once the lever is ${fmt(C.leverFullRelease * 100)}% of the way in.`,
      },
      {
        kind: 'list',
        items: [
          'Locked: basket and hub turn at the same speed, and the clutch carries whatever torque is needed, up to its capacity.',
          'Slipping: the two sides turn at different speeds, and the clutch passes exactly its capacity from the faster side to the slower, plus a little oil drag.',
          'Open: the lever is pulled far enough that the capacity is zero, and only oil drag passes.',
        ],
      },
      {
        kind: 'formula',
        label: 'Oil drag',
        expr: `T_drag = c × Δω, capped at ${C.dragMax} N·m`,
        where: `T_drag is the drag torque (N·m); c is ${C.dragCoeff} N·m for each rad/s of slip; Δω is the speed difference across the plates, basket minus hub (rad/s).`,
      },
      { kind: 'p', text: `Why there is drag when the clutch is open: the plates run in oil, and the oil film between them still drags the hub along. In the model the drag settles where it balances the input shaft's own friction, with the shaft about ${fmt(DERIVED['clutch.dragBalanceSlip'], 1)} rad/s slower than the basket. That still-spinning shaft is why first gear goes in from neutral with a clunk: the dogs have to stop it dead.` },
    ],
  };
}

function computes(): Section {
  const E = PARAMS.engine;
  const D = PARAMS.drum;
  const G = PARAMS.dogs;
  const curve = E.torqueCurve.map(([r, t]) => `${t} N·m at ${fmt(r)} rpm`).join(', ');
  return {
    id: 'computes',
    heading: 'What the simulation computes',
    blocks: [
      { kind: 'p', text: 'It keeps track of: engine speed and whether the engine is running; the speeds and angles of the input and output shafts (the output shaft sets road speed); the shift drum angle and speed; where each of the three sliding gears sits and which gear, if any, it has locked; and the clutch capacity, torque and slip.' },
      { kind: 'p', text: `It moves forward in fixed steps of ${fmt(PARAMS.dt * 1000, 1)} milliseconds, ${fmt(1 / PARAMS.dt)} steps for every second. Each step reads the controls, moves the drum and the forks, moves the sliding gears and checks their dogs, works out every torque, decides whether the clutch is locked or slipping, and then updates every speed.` },
      {
        kind: 'formula',
        label: 'Engine',
        expr: 'T = T_closed + θ × (T_full − T_closed)',
        where: `T is the engine torque at the crank (N·m); T_full is the full-throttle torque read from a map (${curve}); T_closed = ${E.closedThrottle.base} − ${-E.closedThrottle.perRpm} × rpm is the closed-throttle drag that gives engine braking; θ is the throttle from 0 to 1, which an idle control opens up to ${E.idleMaxThrottle} to hold ${fmt(E.idleRpm)} rpm; above the ${fmt(E.limiterRpm)} rpm rev limiter T_full is zero and drag rises by ${E.overRevDrag} N·m per rpm.`,
      },
      {
        kind: 'formula',
        label: 'Clutch stick and slip',
        expr: 'locked if |Δω| < 0.05 rad/s and |T_hold| ≤ T_cap; otherwise T = sign(Δω) × T_cap + T_drag',
        where: 'Δω is the slip speed, basket minus hub (rad/s); T_hold is the torque that would keep both sides turning together this step (N·m); T_cap is the capacity (N·m); a locked clutch moves the engine and gearbox as one body, and a slip that reverses within a step sticks only if T_hold fits within T_cap.',
      },
      {
        kind: 'formula',
        label: 'Gear ratios',
        expr: 'ω_in = g × ω_out, with g = driven teeth ÷ driver teeth',
        where: `ω_in and ω_out are the input and output shaft speeds (rad/s); g is the ratio of the locked pair, from ${gearRatio(1).toFixed(3)} in first to ${gearRatio(6).toFixed(3)} in sixth; the gears and shafts are treated as perfectly rigid.`,
      },
      {
        kind: 'formula',
        label: 'Dogs',
        expr: `aligned if (φ mod ${fmt(360 / G.count)}°) < ${G.windowDeg}°; on engaging, ω_out′ = (g·J_in·ω_in + J_out·ω_out) ÷ (g²·J_in + J_out) and ω_in′ = g·ω_out′`,
        where: `φ is the angle of the dogs against the slots (degrees); ${G.count} dogs share the circle and can enter over ${G.windowDeg}° of every ${fmt(360 / G.count)}°; J_in and J_out are the inertias of the input side and of the bike as seen at the output shaft (kg·m²); the speed jump keeps their angular momentum the same.`,
      },
      {
        kind: 'formula',
        label: 'Pulling a loaded dog',
        expr: `F_needed = μ_d × |T_dog| ÷ r_d; the fork pushes at most ${fmt(G.forkForceMax)} N`,
        where: `F_needed is the force to slide the dog out (N); μ_d = ${G.mu} is the friction between dog faces; T_dog is the torque through the dog (N·m); r_d = ${G.radius} m is the dog radius; so a dog carrying more than about ${fmt(DERIVED['dogs.maxPullTorque'])} N·m stays in, and the drum stops.`,
      },
      {
        kind: 'formula',
        label: 'Shift drum',
        expr: 'J_d × dω/dt = T_pawl + T_detent − c × ω − friction',
        where: `J_d is the drum inertia (kg·m²); ω its speed (rad/s); T_pawl is the push from the pedal, up to ${D.footTorqueMax} N·m; T_detent = −P × sin(2π × offset ÷ spacing) pulls it into the nearest notch, with P = ${D.detentPeak} N·m (${D.neutralDetentPeak} N·m at neutral); c = ${D.damping} N·m·s/rad is damping; friction is ${D.friction} N·m sliding and ${D.staticFriction} N·m at rest.`,
      },
      {
        kind: 'formula',
        label: 'The bike',
        expr: 'J_veh × dω_out/dt = T_drive − (T_brake + T_roll + T_air) ÷ final ratio',
        where: `J_veh = (m × r² + J_wheels) ÷ final ratio² is the bike's inertia at the output shaft (kg·m²), with m = ${PARAMS.mass} kg for bike and rider and r = ${PARAMS.wheelRadius} m the wheel radius; T_roll = C_rr × m × g × r with C_rr = ${PARAMS.crr}; T_air = ½ × ρ × CdA × v² × r with CdA = ${PARAMS.cdA} m²; v is road speed (m/s).`,
      },
    ],
  };
}

function simplified(): Section {
  return {
    id: 'simplified',
    heading: 'What is simplified or left out',
    blocks: [
      { kind: 'p', text: 'Each of these is a choice to keep the model small enough to run live and to explain. None of them changes how the gearbox is laid out or why it works.' },
      {
        kind: 'list',
        items: [
          'No engine internals: no pistons, valves or combustion. The engine is a torque map with inertia, an idle control and a rev limiter.',
          'No tire slip, lean, wheelies or suspension. The bike is a single mass with rolling resistance and air resistance.',
          'Gears and shafts are perfectly rigid. Tooth backlash and chain slack have no motion of their own.',
          'The clutch has one friction coefficient, the same at rest and sliding, and no heat or wear. Oil drag is a simple viscous term.',
          'Gear teeth are standard involute teeth with no profile shift.',
          'A dog engagement is an instant speed match that keeps angular momentum. Dogs never bounce or skip over the slots, whatever the speed difference.',
          'The shift drum is a force balance with a detent, friction, static friction and damping. Those values were tuned to make shifts behave correctly, not measured.',
          'A shift fork can lag its groove slightly in the simulation, but it is drawn rigid.',
          'The drawn pressure-plate lift is exaggerated, and the dogs and their travel are drawn at proportions chosen for clarity.',
          'The crankshaft is a stub, and bearings, circlips and thrust washers are left out of the 3D drawing, apart from the bush the clutch basket runs on.',
        ],
      },
    ],
  };
}

function numbers(): Section {
  const E = PARAMS.engine;
  const C = PARAMS.clutch;
  const D = PARAMS.drum;
  const REP = 'Chosen as representative of a middleweight sport bike';
  const DER = 'Derived from the values above';
  const peak = E.torqueCurve.reduce((a, b) => (b[1] > a[1] ? b : a));
  const rows: string[][] = [
    ['Gear teeth, 1st to 6th', GEARS.map(teeth).join(', '), REP],
    ['Primary drive teeth', `${PARAMS.primary.drive}:${PARAMS.primary.driven}`, REP],
    ['Chain sprocket teeth', `${PARAMS.final.front}:${PARAMS.final.rear}`, REP],
    ['Overall ratio, 1st and 6th', `${overallRatio(1).toFixed(2)} and ${overallRatio(6).toFixed(2)}`, DER],
    ['Wheel radius', `${PARAMS.wheelRadius} m`, REP],
    ['Bike and rider mass', `${PARAMS.mass} kg`, REP],
    ['Air drag area (CdA)', `${PARAMS.cdA} m²`, REP],
    ['Rolling resistance coefficient', `${PARAMS.crr}`, REP],
    ['Engine inertia', `${E.inertia} kg·m²`, REP],
    ['Peak engine torque', `${peak[1]} N·m at ${fmt(peak[0])} rpm`, REP],
    ['Rev limiter', `${fmt(E.limiterRpm)} rpm`, REP],
    ['Clutch friction surfaces', `${C.surfaces}`, REP],
    ['Clutch friction coefficient', `${C.mu}`, REP],
    ['Clutch spring clamp force', `${fmt(C.clampForce)} N`, REP],
    ['Clutch mean radius', `${C.meanRadius} m`, REP],
    ['Clutch capacity', `${clutchCapacityMax.toFixed(0)} N·m`, DER],
    ['Dogs per ring, entry window', `${PARAMS.dogs.count}, ${PARAMS.dogs.windowDeg}° of ${fmt(360 / PARAMS.dogs.count)}°`, REP],
    ['Drum steps', `${fmt(D.detents.N - D.detents[1])}° to neutral, ${fmt(D.detents[3] - D.detents[2])}° between gears`, REP],
    ['Idle speed and idle control', `${fmt(E.idleRpm)} rpm, up to ${E.idleMaxThrottle} throttle`, 'Tuned so the modeled engine idles steadily at its idle speed'],
    ['Over-rev drag', `${E.overRevDrag} N·m per rpm above the limiter`, 'Tuned so the modeled engine resists being forced past the limiter on a missed downshift'],
    ['Drum sliding friction', `${D.friction} N·m`, 'Tuned so the modeled shift behaves correctly: lowered from 0.25 so the drum settles fully into each notch'],
    ['Drum static friction', `${D.staticFriction} N·m`, 'Tuned so the modeled shift behaves correctly: raised from 0.25 so a weak stroke can leave the drum resting between gears'],
    ['Detent strength', `${D.detentPeak} N·m, ${D.neutralDetentPeak} N·m at neutral`, 'Tuned so the modeled shift behaves correctly: raised from 2.5 and 0.8 so the drum returns to its notch and neutral is easy but not too easy to find'],
    ['Drum damping', `${D.damping} N·m·s/rad`, 'Tuned so the modeled shift behaves correctly: added before the build so the drum does not overshoot each notch, and not changed since'],
    ['Oil drag in the clutch', `${C.dragCoeff} N·m per rad/s, at most ${C.dragMax} N·m`, 'Tuned so the modeled clutch drags the input shaft the way a wet clutch does: set when the model was planned and not changed since'],
    ['Demo rider shift points and timings', 'in the demo rider’s code', 'Tuned so the modeled demo ride shifts like a competent rider'],
  ];
  return {
    id: 'numbers',
    heading: 'Where the numbers come from',
    blocks: [
      { kind: 'p', text: 'Every number lives in one parameter file. Each has one of three sources: chosen as representative, derived from others, or tuned so the model behaves correctly.' },
      { kind: 'table', head: ['Parameter', 'Value', 'Source'], rows },
      { kind: 'p', text: 'None of these are measurements of a real gearbox, and the model has not been checked by someone who rebuilds them.' },
    ],
  };
}

function checked(): Section {
  return {
    id: 'checked',
    heading: 'How it was checked',
    blocks: [
      { kind: 'p', text: 'Automated tests run the simulation and check it against hand calculations and against rules a gearbox must follow:' },
      {
        kind: 'list',
        items: [
          'Shaft speeds match the tooth-count ratios exactly in every gear.',
          'Road speed at a given engine speed matches the hand calculation in each gear.',
          'A locked clutch has zero slip, and a slipping clutch passes exactly its capacity plus drag.',
          'Never more than one gear is locked at once, through a minute of random control inputs.',
          'Angular momentum is the same just before and just after a dog engagement.',
          'The shift pattern is 1-N-2-3-4-5-6, stops at both ends, and reaches neutral only from the half step between first and second.',
          'A loaded gearbox refuses a shift, and easing the throttle lets it through.',
          'A weak pedal stroke can leave the drum between gears, and a full stroke from there finds the next gear, never two gears away.',
          'Every lesson on this page is replayed against the simulation, and each step must do what its text says, also with its timing stretched or squeezed by 10%.',
        ],
      },
      { kind: 'p', text: 'Those tests were written by the same AI coding agent that wrote the model and reviewed by other AI agents, so they check that the model does what it was meant to do, not that it matches a real gearbox. Reviews found real defects, such as a pedal stroke that could skip a gear, and each was fixed with a test that would catch it again.' },
      { kind: 'p', text: 'To validate it against reality would take measurements from a real gearbox: the clutch torque capacity, the shift-drum detent force, the timing of dog engagement during a shift, and a coast-down test for the road load.' },
    ],
  };
}

/** The How it works section, built from PARAMS at call time so its figures cannot drift. */
export function howItWorks(): Section[] {
  return [what(), parts(), constantMesh(), oneShift(), clutch(), computes(), simplified(), numbers(), checked()];
}

/** Sections 1 to 4 as plain text: headings and paragraphs separated by blank lines, numbered lists. */
export function howItWorksPlain(): string {
  const out: string[] = [];
  for (const s of howItWorks().slice(0, 4)) {
    out.push(s.heading);
    for (const b of s.blocks) {
      if (b.kind === 'p') out.push(b.text);
      else if (b.kind === 'list') out.push(...b.items.map((item, i) => (b.ordered ? `${i + 1}. ${item}` : item)));
    }
  }
  return out.join('\n\n');
}

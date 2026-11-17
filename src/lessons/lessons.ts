import { PARAMS } from '../sim/params';
import { deg } from '../sim/units';
import { primaryRatio } from '../sim/kinematics';
import { engineOffPatch, inGearPatch } from '../sim/states';
import { keyframes, pedalStroke } from '../sim/inputScript';
import type { DeepPartial, GearId, SimState } from '../sim/types';
import { torquePath } from '../model/torquePath';
import type { PartId } from '../model/parts';
import type { Lesson, LessonStep } from './types';

export type { Lesson, LessonStep } from './types';

/**
 * Resolves a step's start to what the runner applies: 'keep' (carry on), 'reset', or a setState
 * patch meant for a reset simulation.
 */
export function startState(step: LessonStep): DeepPartial<SimState> | 'reset' | 'keep' {
  const st = step.start ?? 'keep';
  if (st === 'keep' || st === 'reset') return st;
  if ('gear' in st) return inGearPatch(st.gear, st.rpm);
  return engineOffPatch(st.drumDeg ?? PARAMS.drum.detents.N, st.misaligned);
}

// ---- Outcome helpers: all read from simulated state, never from script timings ----------------

/** Basket speed in input-shaft terms: the speed the input shaft turns at when the clutch is locked. */
const basket = (s: SimState): number => s.engine.omega / primaryRatio;
const STILL = 0.05; // m/s: the bike counts as standing still below this
/** The gear pair the torque path runs through, or null when it does not reach the wheel. */
const pathPair = (s: SimState): GearId | null => {
  const parts = torquePath(s).parts;
  const pairs = ([1, 2, 3, 4, 5, 6] as const).filter(
    (g) => parts.includes(`gear${g}in`) && parts.includes(`gear${g}out`),
  );
  return pairs.length === 1 ? pairs[0] : null;
};
/** Seconds of trace (5 ms samples) for which pred holds. */
const secondsWhere = (trace: SimState[], pred: (s: SimState) => boolean): number =>
  trace.filter(pred).length * 0.005;

// ---- Scripts ---------------------------------------------------------------------------------

/** From idle in neutral: lever in, then a full stroke down into first. */
const INTO_FIRST = keyframes({ clutchLever: [[0, 0], [0.1, 1]], pedal: pedalStroke(0.3, -1) });

/** Three clutched shifts up: throttle off, lever in, pedal up, lever out, throttle on. */
function upshifts(times: number[], throttle: number) {
  const clutchLever: Array<[number, number]> = [[0, 0]];
  const pedal: Array<[number, number]> = [];
  const thr: Array<[number, number]> = [[0, throttle]];
  for (const t of times) {
    clutchLever.push([t, 0], [t + 0.06, 1], [t + 0.3, 1], [t + 0.5, 0]);
    pedal.push(...pedalStroke(t + 0.06, 1));
    thr.push([t - 0.02, throttle], [t + 0.02, 0], [t + 0.3, 0], [t + 0.5, throttle]);
  }
  return keyframes({ clutchLever, pedal, throttle: thr });
}

/**
 * A short upshift stroke that leaves the drum resting on the hump between the second and third
 * detents, where static friction outweighs the detent spring. Found by sweeping: from second with
 * the lever in, strokes from 0.472 to 0.486 do this at 4000 to 6000 rpm and with the stroke timing
 * stretched or squeezed by 10%; 0.479 sits in the middle.
 */
export const WEAK_STROKE = 0.479;

// ---- Views -----------------------------------------------------------------------------------

const CLUTCH: PartId[] = ['clutchBasket', 'frictionPlates', 'steelPlates', 'clutchHub', 'pressurePlate'];
const INPUT_GEARS: PartId[] = ['gear1in', 'gear2in', 'gear3in', 'gear4in', 'gear5in', 'gear6in'];
const OUTPUT_GEARS: PartId[] = ['gear1out', 'gear2out', 'gear3out', 'gear4out', 'gear5out', 'gear6out'];
const SLIDERS: PartId[] = ['gear5out', 'gear6out', 'gear3in', 'gear4in'];
const SHIFTER: PartId[] = ['shiftDrum', 'forkA', 'forkB', 'forkC', 'starWheel', 'detentArm', 'shiftShaft', 'pedal'];
const DRUM_AND_FORKS: PartId[] = ['shiftDrum', 'forkA', 'forkB', 'forkC'];
const FINAL_DRIVE: PartId[] = ['sprocket', 'chain', 'rearSprocket', 'rearWheel'];

// ---- Lessons ---------------------------------------------------------------------------------

const meet: Lesson = {
  id: 'meet-the-gearbox',
  number: 1,
  title: 'Meet the gearbox',
  summary: 'A tour of the parts that carry the engine’s turning force to the rear wheel, in the order it flows.',
  steps: [
    {
      id: 'clutch',
      title: 'The clutch',
      start: 'reset',
      view: { focus: 'clutchBasket', highlight: CLUTCH },
      text: 'The clutch is a stack of plates squeezed together by springs. Friction plates turn with the clutch basket, an outer case the engine turns, and steel plates turn with the gearbox, so squeezed they turn as one. Pulling the lever spreads them apart.',
    },
    {
      id: 'input-shaft',
      title: 'The input shaft',
      view: { focus: 'inputShaft', highlight: ['inputShaft', ...INPUT_GEARS] },
      text: 'The clutch turns the input shaft, which carries one gear of each of six gear pairs. Each pair has its own mix of tooth counts, so each would turn the other shaft at a different speed.',
    },
    {
      id: 'output-shaft',
      title: 'The output shaft',
      view: { focus: 'outputShaft', highlight: ['outputShaft', ...OUTPUT_GEARS] },
      text: 'The output shaft carries the other gear of every pair. All six pairs stay meshed, meaning their teeth are always in contact, so every pair turns all the time. Some gears spin freely on their shaft, so turning is not the same as driving.',
    },
    {
      id: 'dogs',
      title: 'The dogs',
      view: { explode: true, focus: 'gear5out', highlight: SLIDERS },
      text: 'Three sliding pieces, each itself a gear (one carries both third and fourth), turn with their shafts and slide along them. Stubby teeth on their sides, called dogs, drop into slots in the free gear beside them, locking it to the shaft so its pair drives.',
    },
    {
      id: 'forks-and-drum',
      title: 'Forks and drum',
      view: { explode: true, focus: 'shiftDrum', highlight: SHIFTER },
      text: 'A fork riding in a groove around the shift drum moves each sliding piece. A pedal stroke turns the drum one step; between gears it slides one set of dogs out and the next in. A sprung roller (the detent) drops into a notch to hold the drum at each step.',
    },
    {
      id: 'final-drive',
      title: 'The final drive',
      view: { focus: 'sprocket', highlight: FINAL_DRIVE },
      text: 'The output shaft turns a small front sprocket, a toothed wheel that pulls the chain. The chain turns a larger sprocket on the rear wheel, which slows the turning and raises the force there. Together these are the final drive.',
    },
  ],
};

const pullClutch: Lesson = {
  id: 'pull-the-clutch',
  number: 2,
  title: 'Pull the clutch',
  summary: 'What the lever does to the clutch plates, and why the gearbox keeps spinning after the engine is disconnected.',
  steps: [
    {
      id: 'idling',
      title: 'Idling in neutral',
      start: 'reset',
      view: { xray: true, focus: 'clutchBasket', highlight: [...CLUTCH, 'inputShaft'] },
      text: 'The engine is idling, running at its slowest steady speed, and the gearbox is in neutral, so no gear pair drives the wheel. The plates are squeezed, so the input shaft turns with the clutch basket, the outer case the engine turns.',
    },
    {
      id: 'pull',
      title: 'Pull the lever',
      start: 'reset',
      script: keyframes({ clutchLever: [[0, 0], [0.3, 0], [0.5, 1]] }),
      seconds: 2.5,
      view: { xray: true, focus: 'pressurePlate', highlight: [...CLUTCH, 'inputShaft'] },
      text: 'Pulling the lever lifts the pressure plate, the plate the springs press on, so the stack lets go and the engine is disconnected. Watch the input shaft: it does not stop. Oil drags it, so it slows a little, then keeps turning at most of the basket’s speed.',
      // the clutch carries nothing for the whole hold; the shaft never drops below half the basket's
      // speed and settles at most of it, still slipping
      outcome: (f, trace) => {
        const held = trace.filter((s) => s.clutch.capacity === 0);
        return f.clutch.capacity === 0
          && held.length * 0.005 > 1.5
          && held.every((s) => s.inputShaftOmega > 0.5 * basket(s))
          && !f.clutch.locked
          && f.inputShaftOmega > 0.6 * basket(f)
          && f.inputShaftOmega < basket(f);
      },
    },
    {
      id: 'release',
      title: 'Let the lever out',
      script: keyframes({ clutchLever: [[0, 1], [0.5, 0]] }),
      seconds: 1.5,
      view: { xray: true, focus: 'clutchBasket', highlight: [...CLUTCH, 'inputShaft'] },
      text: 'As the lever comes out, the springs squeeze the plates again. They grip, the input shaft catches up with the basket, and the two turn as one piece. A clutch turning as one piece like this is called locked.',
      outcome: (f) =>
        f.clutch.locked && f.clutch.slip === 0 && Math.abs(f.inputShaftOmega - basket(f)) < 0.01 * basket(f),
    },
    {
      id: 'try',
      title: 'Try the lever',
      view: { xray: true, focus: 'clutchBasket', highlight: [...CLUTCH, 'inputShaft'] },
      text: 'The lever is yours now. Pull it in and the input shaft keeps spinning, dragged by the oil; let it out and the engine carries it again.',
      tryIt: 'Pull the clutch lever, hold it for a few seconds, then let it go.',
    },
  ],
};

const firstGear: Lesson = {
  id: 'first-gear',
  number: 3,
  title: 'First gear and the clunk',
  summary: 'Why selecting first gear from neutral makes a clunk, shown in slow motion.',
  steps: [
    {
      id: 'lever-in',
      title: 'Lever in, in neutral',
      start: 'reset',
      script: keyframes({ clutchLever: [[0, 0], [0.3, 0], [0.5, 1]] }),
      seconds: 1.5,
      view: { xray: true, focus: 'inputShaft', highlight: [...CLUTCH, 'inputShaft'] },
      text: 'The lever is pulled, so the clutch plates no longer grip. Oil between them still drags the input shaft around. In neutral no gear is selected and nothing else holds the shaft back, so it keeps spinning.',
      outcome: (f) => f.clutch.capacity === 0 && f.lockedGear === null && f.inputShaftOmega > 0.6 * basket(f),
    },
    {
      id: 'clunk',
      title: 'Press the pedal down',
      script: keyframes({ clutchLever: [[0, 1]], pedal: pedalStroke(0.3, -1) }),
      seconds: 1,
      timeScale: 0.25,
      view: { xray: true, focus: 'gear5out', highlight: ['gear5out', 'gear1out', 'gear1in', 'inputShaft'] },
      text: 'The pedal slides a gear toward first, and its dogs, stubby teeth on its side, drop into slots in the first gear. The bike is standing still, so the dogs stop the spinning input shaft almost at once. That sudden stop is the clunk.',
      // locks first, and the input shaft goes from spinning to near rest in under 50 ms
      outcome: (f, trace) => {
        const i = trace.findIndex((s) => s.lockedGear === 1);
        if (i < 1 || f.lockedGear !== 1) return false;
        const before = trace[i - 1];
        const still = trace.slice(i).find((s) => Math.abs(s.inputShaftOmega) < 0.05 * basket(before));
        return before.inputShaftOmega > 0.6 * basket(before)
          && still !== undefined && still.t - before.t < 0.05;
      },
    },
    {
      id: 'waiting',
      title: 'Waiting in first',
      script: keyframes({ clutchLever: [[0, 1]] }),
      seconds: 1.5,
      view: { xray: true, focus: 'inputShaft', highlight: [...CLUTCH, 'inputShaft'] },
      text: 'Now the input shaft stays still while the engine idles at its slowest steady speed. The plates slide past each other, and their oil drag is too weak to push the bike. The engine waits until the lever comes out.',
      tryIt: 'Let the lever out slowly with a little throttle to pull away.',
      outcome: (f, trace) =>
        f.lockedGear === 1
        && trace.every((s) => s.engine.running && Math.abs(s.inputShaftOmega) < 0.02 * basket(s) && s.roadSpeed < STILL),
    },
  ],
};

const pullingAway: Lesson = {
  id: 'pulling-away',
  number: 4,
  title: 'Pulling away',
  summary: 'How a slipping clutch lets a spinning engine get a stationary bike moving.',
  steps: [
    {
      id: 'ready',
      title: 'Ready in first',
      start: 'reset',
      script: INTO_FIRST,
      seconds: 1,
      view: { focus: 'clutchBasket', highlight: CLUTCH },
      text: 'The engine idles at its slowest steady speed, first gear is selected and the lever is pulled, so the clutch plates do not grip. The engine spins while the rear wheel stands still.',
      outcome: (f) => f.lockedGear === 1 && f.engine.running && f.clutch.capacity === 0 && f.roadSpeed < STILL,
    },
    {
      id: 'feed',
      title: 'Feed the clutch out',
      script: keyframes({
        clutchLever: [[0, 1], [0.3, 1], [0.5, 0.65], [1.8, 0.5], [2.6, 0]],
        throttle: [[0, 0], [0.3, 0.45], [1.5, 0.5]],
      }),
      seconds: 4,
      view: { schematic: true, focus: 'clutchBasket', highlight: CLUTCH },
      text: 'The lever comes out slowly while the throttle opens a little. The plates start to grip but still slide past each other, which is called slip. Slip lets the fast engine push the still wheel without being dragged to a stop.',
      // more than 0.3 s of slip, then the clutch locks, the engine runs throughout and the bike is moving
      outcome: (f, trace) => {
        const slips = (s: SimState) => s.clutch.capacity > 0 && !s.clutch.locked && s.clutch.slip > 20;
        const slipping = trace.findIndex(slips);
        const lockedAfter = slipping >= 0 && trace.slice(slipping).some((s) => s.clutch.locked);
        return slipping >= 0 && secondsWhere(trace, slips) > 0.3 && lockedAfter && trace.every((s) => s.engine.running)
          && f.clutch.locked && f.lockedGear === 1 && f.roadSpeed > 3;
      },
    },
    {
      id: 'locked',
      title: 'The clutch locks',
      view: { schematic: true, focus: 'clutchBasket', highlight: CLUTCH },
      text: 'As the bike gains speed, the input shaft catches up with the clutch basket, the outer case the engine turns, and the slip ends. The plates now turn as one piece, which is called locked, and the engine drives the wheel through first gear.',
      tryIt: 'Roll the throttle on and off and watch the road speed follow.',
    },
  ],
};

const upThroughGears: Lesson = {
  id: 'up-through-the-gears',
  number: 5,
  title: 'Up through the gears',
  summary: 'Three gear changes from second to fifth, showing that the dogs, not the gears, choose which pair drives.',
  steps: [
    {
      id: 'second',
      title: 'Riding in second',
      start: { gear: 2, rpm: 6000 },
      view: { xray: true, highlight: [...INPUT_GEARS, ...OUTPUT_GEARS] },
      text: 'The bike is riding in second gear. All six gear pairs are turning, because every pair is always meshed, its teeth always in contact. Only one pair is locked to both shafts and carries the drive.',
    },
    {
      id: 'shifts',
      title: 'Three shifts up',
      start: { gear: 2, rpm: 6000 },
      script: upshifts([0.5, 1.7, 2.9], 0.6),
      seconds: 4,
      view: { xray: true, schematic: true, highlight: SLIDERS },
      text: 'An upshift is a change to the next gear up: lever in, pedal up, lever out. Each time, dogs, stubby teeth on a sliding gear, lock a different pair. Watch the torque path, the route the engine’s turning force takes, drawn in orange, jump from pair to pair.',
      // ends in fifth, and the torque path ran through second, third, fourth and fifth in turn
      outcome: (f, trace) => {
        const seen: GearId[] = [];
        for (const s of trace) {
          const g = pathPair(s);
          if (g !== null && g !== seen.at(-1)) seen.push(g);
        }
        return f.lockedGear === 5 && seen.join() === '2,3,4,5';
      },
    },
    {
      id: 'why-slower',
      title: 'Why the engine slows',
      view: { schematic: true },
      text: 'Each higher gear turns the wheel faster for every turn of the engine. So after each upshift the engine speed drops while the road speed carries on.',
      tryIt: 'Shift up and down yourself, using the clutch for each change.',
    },
  ],
};

const clutchless: Lesson = {
  id: 'clutchless-upshift',
  number: 6,
  title: 'Why you can shift without the clutch',
  summary: 'A gearbox under load refuses to shift, and an instant off the throttle lets the shift through.',
  steps: [
    {
      id: 'loaded',
      title: 'Full throttle in second',
      start: { gear: 2, rpm: 8000 },
      view: { xray: true, focus: 'gear6out', highlight: ['gear6out', 'gear2out', 'gear2in'] },
      text: 'The bike is accelerating hard in second gear. The engine presses the dogs, the stubby teeth that lock the second-gear pair, hard against the sides of their slots.',
    },
    {
      id: 'refused',
      title: 'Pedal up, no shift',
      start: { gear: 2, rpm: 8000 },
      script: keyframes({ throttle: [[0, 1]], pedal: [[0, 0], [0.3, 0], [0.36, 1]] }),
      seconds: 1.2,
      timeScale: 0.25,
      view: { xray: true, focus: 'shiftDrum', highlight: ['shiftDrum', 'forkB', 'gear6out'] },
      text: 'Pushing the pedal up tries to slide the dogs out, but they are pinched under load and friction holds them. The shift drum that moves them turns a little and stops well short of third.',
      // second gear throughout more than half a second of held pedal; the drum stalls short of third
      // and is still held there, pedal up, when the next step takes over
      outcome: (f, trace) =>
        trace.every((s) => s.lockedGear === 2)
        && secondsWhere(trace, (s) => s.pedal.travel > 0.9) > 0.5
        && Math.max(...trace.map((s) => s.drum.angle)) < deg(80)
        && f.drum.angle > deg(65)
        && f.pedal.travel > 0.9,
    },
    {
      id: 'dip',
      title: 'Ease off for an instant',
      script: keyframes({
        throttle: [[0, 1], [0.3, 1], [0.32, 0.1], [0.45, 0.1], [0.47, 1]],
        pedal: [[0, 1], [0.7, 1], [0.76, 0]],
      }),
      seconds: 1,
      timeScale: 0.25,
      view: { xray: true, focus: 'shiftDrum', highlight: ['shiftDrum', 'forkB', 'gear6out', 'gear5out'] },
      text: 'With the pedal still held up, the throttle closes for a moment. The push on the dogs drops, friction lets go and they slide out, and third gear drops in a moment later. This is a clutchless upshift, a change up a gear without the clutch.',
      // second holds while loaded with the pedal up; third is in within 0.3 s of the throttle dip
      outcome: (f, trace) => {
        const dip = trace.findIndex((s) => s.engine.torque < 20);
        if (dip < 1) return false;
        const loaded = trace.slice(0, dip);
        const third = trace.findIndex((s) => s.lockedGear === 3);
        return loaded.every((s) => s.lockedGear === 2)
          && secondsWhere(loaded, (s) => s.pedal.travel > 0.9) > 0.2
          && third > dip && trace[third].t - trace[dip].t < 0.3
          && f.lockedGear === 3;
      },
    },
    {
      id: 'try',
      title: 'Try a clutchless shift',
      view: { xray: true, focus: 'shiftDrum' },
      text: 'Riders use this to shift up without the clutch. It works only when the load comes off the dogs, even for an instant.',
      tryIt: 'Hold the throttle open, press and hold shift up, then close the throttle for a moment.',
    },
  ],
};

const missedShift: Lesson = {
  id: 'missed-shift',
  number: 7,
  title: 'A missed shift',
  summary: 'A weak pedal stroke can leave the shift drum between gears, where nothing drives the wheel.',
  steps: [
    {
      id: 'coasting',
      title: 'Coasting in second',
      start: { gear: 2, rpm: 5000 },
      view: { schematic: true, focus: 'shiftDrum', highlight: DRUM_AND_FORKS },
      text: 'The bike is coasting in second gear. The pedal turns the shift drum, which slides gears with stubby locking teeth called dogs. A sprung roller holds the drum in a notch at each gear, and between two notches is a hump it must be pushed over.',
    },
    {
      id: 'weak',
      title: 'A weak stroke',
      start: { gear: 2, rpm: 5000 },
      script: keyframes({ clutchLever: [[0, 0], [0.1, 1]], pedal: pedalStroke(0.3, WEAK_STROKE) }),
      seconds: 1.5,
      timeScale: 0.25,
      view: { schematic: true, focus: 'shiftDrum', highlight: DRUM_AND_FORKS },
      text: 'This stroke is too short. It pulls the dogs out of second but leaves the drum balanced on top of the hump between the second and third notches, so no dogs are engaged. This is a false neutral: nothing drives the wheel.',
      // started in second; ends with no gear locked and the drum resting between detents
      outcome: (f, trace) =>
        trace[0].lockedGear === 2
        && f.lockedGear === null
        && (['A', 'B', 'C'] as const).every((id) => f.sliders[id].locked === null)
        && f.drum.detent === null
        && f.drum.omega === 0
        && f.drum.angle > deg(PARAMS.drum.detents[2] + 10)
        && f.drum.angle < deg(PARAMS.drum.detents[3] - 10),
    },
    {
      id: 'full',
      title: 'A full stroke',
      script: keyframes({ clutchLever: [[0, 1]], pedal: pedalStroke(0.2, 1) }),
      seconds: 1.2,
      view: { schematic: true, focus: 'shiftDrum', highlight: DRUM_AND_FORKS },
      text: 'A full stroke carries the drum on to the third-gear notch. The dogs for third drop in and the drive is back.',
      tryIt: 'Shift up and down with full strokes and watch each one land in a notch.',
      outcome: (f) => f.lockedGear === 3 && f.drum.detent === 3,
    },
  ],
};

const drumByHand: Lesson = {
  id: 'drum-by-hand',
  number: 8,
  title: 'How the drum picks a gear',
  summary: 'With the engine off, turn the shift drum by hand to see how its grooves move the forks.',
  steps: [
    {
      id: 'engine-off',
      title: 'Engine off, parts apart',
      start: { engineOff: true },
      ignition: false,
      view: { explode: true, schematic: true, focus: 'shiftDrum', highlight: DRUM_AND_FORKS },
      text: 'The engine is off and the gearbox is pulled apart so you can see inside. The shift drum has three grooves, each steering one fork, an arm that slides a gear along its shaft. A sprung roller holds the drum in a notch at each gear.',
      tryIt: 'Drag the shift drum slowly and watch which fork moves.',
    },
    {
      id: 'grooves',
      title: 'One groove, one fork',
      ignition: false,
      view: { explode: true, schematic: true, focus: 'shiftDrum', highlight: [...DRUM_AND_FORKS, ...SLIDERS] },
      text: 'Most of each groove runs straight around, so its fork stays put. Where a groove bends, its fork slides a gear until that gear’s dogs, stubby locking teeth, lock a pair. At each gear position only one fork is pushed off center.',
      tryIt: 'Turn the drum from end to end and watch it select each gear in turn.',
    },
    {
      id: 'blocked',
      title: 'When dogs are blocked',
      start: { engineOff: true, misaligned: 'A' },
      ignition: false,
      view: { explode: true, schematic: true, focus: 'forkA', highlight: ['forkA', 'gear5out', 'gear1out', 'shiftDrum'] },
      text: 'Sometimes the dogs meet the gear face to face instead of lining up with its slots, so they cannot drop in. The drum stops short of its notch and no gear is selected.',
      tryIt: 'Drag the drum toward first gear and watch the fork stop partway.',
    },
    {
      id: 'rock-wheel',
      title: 'Turn the rear wheel',
      ignition: false,
      view: { explode: true, schematic: true, focus: 'rearWheel', highlight: ['rearWheel', 'outputShaft', 'gear5out', 'gear1out'] },
      text: 'Turning the rear wheel turns the sliding gear against the still first gear. When a slot comes around, the dogs drop in and the drum finishes its turn. Mechanics do the same when a gear will not go in.',
      tryIt: 'Turn the rear wheel slowly until the dogs drop in.',
    },
  ],
};

const stalling: Lesson = {
  id: 'stalling',
  number: 9,
  title: 'Stalling and restarting',
  summary: 'Why letting the clutch out too fast with no throttle stops the engine, and how to start it again.',
  steps: [
    {
      id: 'idle-in-first',
      title: 'Idling in first',
      start: 'reset',
      script: INTO_FIRST,
      seconds: 1,
      view: { focus: 'clutchBasket', highlight: CLUTCH },
      text: 'The engine idles at its slowest steady speed in first gear, with the clutch lever pulled. The clutch plates are held apart, so the turning engine and the still wheel are kept separate.',
      outcome: (f) => f.lockedGear === 1 && f.engine.running && f.roadSpeed < STILL,
    },
    {
      id: 'dump',
      title: 'Dump the clutch',
      script: keyframes({ clutchLever: [[0, 1], [0.2, 1], [0.22, 0]] }),
      seconds: 1.5,
      timeScale: 0.25,
      view: { focus: 'crank', highlight: [...CLUTCH, 'crank'] },
      text: 'The lever snaps out with the throttle closed. The plates grip at once and try to bring the still bike up to the speed the engine is turning, which takes far more force than an idling engine has. It slows until it can no longer run and stops: a stall.',
      outcome: (f, trace) => trace[0].engine.running && !f.engine.running && f.engine.omega === 0 && f.lockedGear === 1,
    },
    {
      id: 'how-to-restart',
      title: 'How to restart',
      text: 'To start again, first pull the lever in so the engine is free of the wheel. Then press the starter, an electric motor that spins the engine until it fires.',
    },
    {
      id: 'restart',
      title: 'Starting again',
      script: keyframes({ clutchLever: [[0, 0], [0.1, 1]], starter: [[0, false], [0.3, true], [1.5, false]] }),
      seconds: 2.5,
      view: { focus: 'crank', highlight: ['crank', 'primaryDrive', 'clutchBasket'] },
      text: 'With the lever in, the starter turns the engine until it fires and runs by itself. The wheel stays still because the clutch plates are held apart.',
      outcome: (f, trace) => !trace[0].engine.running && f.engine.running && f.lockedGear === 1 && f.roadSpeed < STILL,
    },
    {
      id: 'try',
      title: 'Pull away cleanly',
      text: 'The engine is idling in first with the lever pulled, ready to go. A slow lever and a little throttle give the plates time to slide before they grip.',
      tryIt: 'Let the lever out slowly with a little throttle.',
    },
  ],
};

export const LESSONS: Lesson[] = [
  meet, pullClutch, firstGear, pullingAway, upThroughGears, clutchless, missedShift, drumByHand, stalling,
];

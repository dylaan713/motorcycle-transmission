import type { GearId } from '../sim/types';

export type GearNo = GearId;
export type PartId =
  | 'crank' | 'primaryDrive' | 'clutchBasket' | 'frictionPlates' | 'steelPlates' | 'clutchHub'
  | 'pressurePlate' | 'clutchRelease' | 'inputShaft' | 'outputShaft'
  | `gear${GearNo}in` | `gear${GearNo}out`
  | 'forkA' | 'forkB' | 'forkC' | 'shiftDrum' | 'starWheel' | 'detentArm' | 'shiftShaft' | 'pedal'
  | 'sprocket' | 'chain' | 'rearSprocket' | 'rearWheel';
/** role: one plain sentence saying what the part does. */
export interface PartInfo { id: PartId; name: string; role: string }

/** Each gear's ordinal, as a word and in short. */
export const ORDINAL: Record<GearNo, { word: string; short: string }> = {
  1: { word: 'first', short: '1st' }, 2: { word: 'second', short: '2nd' }, 3: { word: 'third', short: '3rd' },
  4: { word: 'fourth', short: '4th' }, 5: { word: 'fifth', short: '5th' }, 6: { word: 'sixth', short: '6th' },
};

const GEAR_ROLES: Record<`gear${GearNo}in` | `gear${GearNo}out`, string> = {
  gear1in: 'Cut into the input shaft, it drives the first-gear pair whenever the input shaft turns.',
  gear2in: 'Fixed on the end of the input shaft, it drives the second-gear pair whenever the input shaft turns.',
  gear3in: 'Splined to the input shaft as one sliding piece with fourth, it drives the third-gear pair and slides to lock fifth or sixth with its dogs.',
  gear4in: 'Splined to the input shaft as one sliding piece with third, it drives the fourth-gear pair and slides to lock fifth or sixth with its dogs.',
  gear5in: 'Spinning free on the input shaft, it is turned by its partner and carries drive only when the sliding pair locks it to the shaft.',
  gear6in: 'Spinning free on the input shaft, it is turned by its partner and carries drive only when the sliding pair locks it to the shaft.',
  gear1out: 'Spinning free on the output shaft, it is turned by its partner and carries drive only when the fifth-gear slider locks it to the shaft.',
  gear2out: 'Spinning free on the output shaft, it is turned by its partner and carries drive only when the sixth-gear slider locks it to the shaft.',
  gear3out: 'Spinning free on the output shaft, it is turned by its partner and carries drive only when the fifth-gear slider locks it to the shaft.',
  gear4out: 'Spinning free on the output shaft, it is turned by its partner and carries drive only when the sixth-gear slider locks it to the shaft.',
  gear5out: 'Splined to the output shaft, it slides along it to lock first or third with its dogs and drives through the fifth-gear pair when its partner is locked.',
  gear6out: 'Splined to the output shaft, it slides along it to lock fourth or second with its dogs and drives through the sixth-gear pair when its partner is locked.',
};

const gearParts = Object.fromEntries(
  ([1, 2, 3, 4, 5, 6] as const).flatMap((g) => (['in', 'out'] as const).map((end) => {
    const id = `gear${g}${end}` as const;
    const shaft = end === 'in' ? 'input' : 'output';
    return [id, { id, name: `${ORDINAL[g].word[0].toUpperCase()}${ORDINAL[g].word.slice(1)} gear, ${shaft} shaft`, role: GEAR_ROLES[id] }];
  })),
) as Record<`gear${GearNo}${'in' | 'out'}`, PartInfo>;

export const PARTS: Record<PartId, PartInfo> = {
  crank: { id: 'crank', name: 'Crankshaft', role: 'Turned by the pistons, it delivers the engine torque that the whole drivetrain carries.' },
  primaryDrive: { id: 'primaryDrive', name: 'Primary drive', role: 'A gear pair that steps the crank speed down and turns the clutch basket.' },
  clutchBasket: { id: 'clutchBasket', name: 'Clutch basket', role: 'Driven by the primary drive, it turns the friction plates through tabs that slide in its slots.' },
  frictionPlates: { id: 'frictionPlates', name: 'Friction plates', role: 'Lined plates keyed to the basket that pass torque to the steel plates by friction when squeezed.' },
  steelPlates: { id: 'steelPlates', name: 'Steel plates', role: 'Plain plates keyed to the hub that take torque from the friction plates and can slip against them.' },
  clutchHub: { id: 'clutchHub', name: 'Clutch hub', role: 'Carries the steel plates and is splined to the input shaft, so the clutch torque turns the shaft.' },
  pressurePlate: { id: 'pressurePlate', name: 'Pressure plate', role: 'Clamped by the clutch springs, it squeezes the plate stack; pulling the lever lifts it off the stack to release the clutch.' },
  clutchRelease: { id: 'clutchRelease', name: 'Clutch release', role: 'Pulled by the lever\'s cable, its arm pushes a rod through the hollow input shaft that lifts the pressure plate off the plates.' },
  inputShaft: { id: 'inputShaft', name: 'Input shaft', role: 'Turned by the clutch hub, it carries the driving gear of every pair.' },
  outputShaft: { id: 'outputShaft', name: 'Output shaft', role: 'Carries the driven gear of every pair and turns the front sprocket at the speed of the locked pair.' },
  ...gearParts,
  forkA: { id: 'forkA', name: 'Shift fork A', role: 'Rides a groove in the drum and slides the fifth-gear slider to lock first or third.' },
  forkB: { id: 'forkB', name: 'Shift fork B', role: 'Rides a groove in the drum and slides the sixth-gear slider to lock fourth or second.' },
  forkC: { id: 'forkC', name: 'Shift fork C', role: 'Rides a groove in the drum and slides the third-and-fourth piece to lock fifth or sixth.' },
  shiftDrum: { id: 'shiftDrum', name: 'Shift drum', role: 'A grooved drum whose angle sets where every fork sits, turned by the pawls through the pins on its end, so each detent selects one gear.' },
  starWheel: { id: 'starWheel', name: 'Star wheel', role: 'A notched wheel on the drum end that the detent arm\'s roller drops into to hold each gear.' },
  detentArm: { id: 'detentArm', name: 'Detent arm', role: 'A sprung roller that drops into the star wheel notches and holds the drum at each gear.' },
  shiftShaft: { id: 'shiftShaft', name: 'Shift shaft', role: 'Turned by the pedal, its arm\'s pawl catches a pin on the drum end and turns the drum on by one detent per stroke.' },
  pedal: { id: 'pedal', name: 'Gear pedal', role: 'The rider pushes it down or lifts it up to step the drum one gear down or up.' },
  sprocket: { id: 'sprocket', name: 'Front sprocket', role: 'Fixed to the output shaft, it pulls the chain.' },
  chain: { id: 'chain', name: 'Drive chain', role: 'Carries the drive from the front sprocket back to the rear sprocket.' },
  rearSprocket: { id: 'rearSprocket', name: 'Rear sprocket', role: 'Driven by the chain, it steps the speed down once more and turns the rear wheel.' },
  rearWheel: { id: 'rearWheel', name: 'Rear wheel', role: 'Turns the drivetrain torque into a push on the road.' },
};

/** The parts in four groups, each in the order the information panel lists them. */
export const PART_GROUPS: ReadonlyArray<{ title: string; parts: readonly PartId[] }> = [
  { title: 'Clutch', parts: ['crank', 'primaryDrive', 'clutchBasket', 'frictionPlates', 'steelPlates', 'clutchHub', 'pressurePlate', 'clutchRelease'] },
  {
    title: 'Shafts and gears',
    parts: ['inputShaft', 'outputShaft', ...([1, 2, 3, 4, 5, 6] as const).flatMap((g): PartId[] => [`gear${g}in`, `gear${g}out`])],
  },
  { title: 'Shift mechanism', parts: ['forkA', 'forkB', 'forkC', 'shiftDrum', 'starWheel', 'detentArm', 'shiftShaft', 'pedal'] },
  { title: 'Final drive', parts: ['sprocket', 'chain', 'rearSprocket', 'rearWheel'] },
];

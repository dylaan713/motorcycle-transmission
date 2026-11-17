import { CENTRE_DISTANCE, FACE_WIDTH, GEAR_ORDER, MODULE, gearAxialPosition, pitchRadius, sliderOfGear } from '../model/geometry';
import type { GearNo } from '../model/parts';
import { PARAMS } from '../sim/params';
import type { SliderId } from '../sim/types';
import { deg } from '../sim/units';
import { DIM } from '../geo/dimensions';
import { DETENT_ARM, FORK_CLAW_DEPTH, FORK_PIN_REACH, STAR_SEAT_DEPTH } from '../geo/shift';
import { sprocketPitchRadius } from '../geo/sprocket';

/**
 * Where every part of the 3D model sits, metres. x runs along the shafts: the clutch at the -x end
 * of the input shaft, the front sprocket at the +x end of the output shaft. y is up and the bike's
 * front is -z, so the drawn angles (src/model/geometry.ts) turn every part the physical way: under
 * drive the rear wheel's top moves toward -z and the chain's top run is the tight one, pulled from
 * the rear sprocket to the front. An axis parallel to x is given by its (y, z); angles about x run
 * from +y toward +z, as atan2(z, y), the convention every generator in src/geo uses.
 */

export interface Axis { readonly y: number; readonly z: number }

export const axisAt = (from: Axis, angle: number, distance: number): Axis =>
  ({ y: from.y + distance * Math.cos(angle), z: from.z + distance * Math.sin(angle) });
export const directionOf = (from: Axis, to: Axis): number => Math.atan2(to.z - from.z, to.y - from.y);
export const distanceOf = (a: Axis, b: Axis): number => Math.hypot(b.y - a.y, b.z - a.z);
/** Tip radius of a gear of the gearbox. */
export const tipRadius = (shaft: 'input' | 'output', g: GearNo): number => pitchRadius(shaft, g) + DIM.addendum * MODULE;

// ---- Shafts -----------------------------------------------------------------------------------

export const INPUT_AXIS: Axis = { y: 0, z: 0 };
/** CENTRE_DISTANCE from the input axis, behind it: 35° below horizontal toward +z. */
export const OUTPUT_AXIS: Axis = axisAt(INPUT_AXIS, Math.PI / 2 + deg(35), CENTRE_DISTANCE);
export const PRIMARY_CENTRE_DISTANCE = ((PARAMS.primary.drive + PARAMS.primary.driven) * MODULE) / 2;
/** Above and ahead of the clutch at the primary centre distance: 50° above horizontal toward -z. */
export const CRANK_AXIS: Axis = axisAt(INPUT_AXIS, -(Math.PI / 2 - deg(50)), PRIMARY_CENTRE_DISTANCE);

/** Direction from the input axis to the output axis: the psi of every gearbox pair's meshPhase. */
export const GEARBOX_PSI = directionOf(INPUT_AXIS, OUTPUT_AXIS);
/** Direction from the crank to the clutch: the psi of the primary pair's meshPhase. */
export const PRIMARY_PSI = directionOf(CRANK_AXIS, INPUT_AXIS);

const SHAFT_OVERHANG = 0.006;     // shaft end beyond its last gear face
const firstFace = gearAxialPosition(GEAR_ORDER[0]) - FACE_WIDTH / 2;
const lastFace = gearAxialPosition(GEAR_ORDER[GEAR_ORDER.length - 1]) + FACE_WIDTH / 2;

/** Front sprocket centre plane: 16.5 mm outboard of the last gear face. */
export const SPROCKET_X = lastFace + 0.0165;
export const SPROCKET_THICKNESS = 0.007;   // fits between the chain's inner plates
export const OUTPUT_SHAFT_X = [firstFace - SHAFT_OVERHANG, SPROCKET_X + 0.012] as const;

/**
 * Clutch frame origin (the outer face of the basket's back, clutch frame x = 0). The clutch frame
 * is turned half a turn about y, so clutch frame x runs toward world -x: the primary ring is on
 * the gearbox side and the basket opens outward. Its primary ring clears the output shaft's end.
 */
export const CLUTCH_X0 = OUTPUT_SHAFT_X[0] - 0.008 - DIM.primary.faceWidth;
/** World x of a clutch frame x. */
export const clutchX = (frameX: number): number => CLUTCH_X0 - frameX;
/** The input shaft runs from the end of the clutch hub's boss to just past its last gear. */
export const INPUT_SHAFT_X = [clutchX(DIM.clutchHub.bossEnd), lastFace + SHAFT_OVERHANG] as const;
/** Primary drive gear centre, level with the basket's 76-tooth ring. */
export const PRIMARY_X = clutchX(-DIM.primary.faceWidth / 2);

export const CRANK = {
  journalRadius: 0.018, x0: PRIMARY_X - 0.016, x1: lastFace + 0.01,
  // four throws, inline-four style: outer pair up, inner pair down
  throws: [{ x: -0.048, angle: 0 }, { x: -0.016, angle: Math.PI }, { x: 0.016, angle: Math.PI }, { x: 0.048, angle: 0 }],
  throwRadius: 0.0225, pinRadius: 0.016, pinLength: 0.016, webThickness: 0.007, webRadius: 0.034,
} as const;

/**
 * The crank is context, not mechanism: drawn as a solid stub through the primary drive gear, then
 * one throw hinted as a ghost. The full CRANK above stays the reference for clearances.
 */
export const CRANK_STUB_X1 = PRIMARY_X + DIM.primary.faceWidth / 2 + 0.012;
export const CRANK_GHOST = {
  ...CRANK, x0: CRANK_STUB_X1, x1: CRANK_STUB_X1 + 0.04, throws: [{ x: CRANK_STUB_X1 + 0.02, angle: 0 }],
} as const;

// ---- Shift mechanism --------------------------------------------------------------------------

/** Below and in front of (-z) the shafts: 85 mm from the input axis, 140° round from +y toward -z. */
export const DRUM_AXIS: Axis = axisAt(INPUT_AXIS, deg(-140), 0.085);
export const DRUM_LENGTH = 0.1;   // centred on x = 0
/** Pin tip clearance above the groove floor, m. */
const PIN_FLOOR_GAP = 0.001;
/** Fork rod axis to drum axis, so each guide pin's tip sits PIN_FLOOR_GAP above its groove floor. */
export const ROD_TO_DRUM = DIM.drum.radius - DIM.drum.grooveDepth + PIN_FLOOR_GAP + FORK_PIN_REACH;

/** The shaft each slider rides on, and so the axis its fork's claw is centred on. */
export const SLIDER_AXIS: Record<SliderId, Axis> = { A: OUTPUT_AXIS, B: OUTPUT_AXIS, C: INPUT_AXIS };
/**
 * Follower angles: where each fork's guide pin meets the drum, about the drum axis. Each fork is a
 * straight line from its slider's axis through its rod to the drum axis, so the pin points at the
 * drum's centre. A and B share the rod on the line to the output shaft; C has its own on the line
 * to the input shaft.
 */
export const FOLLOWER_ANGLE: Record<SliderId, number> = {
  A: directionOf(DRUM_AXIS, OUTPUT_AXIS), B: directionOf(DRUM_AXIS, OUTPUT_AXIS), C: directionOf(DRUM_AXIS, INPUT_AXIS),
};
/** The drum is posed against slider C's follower: drum rotation = DRUM_REFERENCE - drum angle. */
export const DRUM_REFERENCE = FOLLOWER_ANGLE.C;
/** How far round from the reference each slider's groove is cut (shiftDrum's followerOffsets). */
export const FOLLOWER_OFFSETS: Record<SliderId, number> = {
  A: FOLLOWER_ANGLE.A - DRUM_REFERENCE, B: FOLLOWER_ANGLE.B - DRUM_REFERENCE, C: 0,
};
export const FORK_ROD: Record<SliderId, Axis> = {
  A: axisAt(DRUM_AXIS, FOLLOWER_ANGLE.A, ROD_TO_DRUM),
  B: axisAt(DRUM_AXIS, FOLLOWER_ANGLE.B, ROD_TO_DRUM),
  C: axisAt(DRUM_AXIS, FOLLOWER_ANGLE.C, ROD_TO_DRUM),
};
/** The two fork rods: one for A and B (output shaft), one for C (input shaft). */
export const FORK_RODS = { AB: FORK_ROD.A, C: FORK_ROD.C } as const;
export const FORK_ROD_X = [-0.062, 0.062] as const;

/**
 * Fifth and sixth on the output shaft carry their fork collar beside their teeth. Along the face,
 * from the collar-free end: a plain shoulder (carrying that face's dog ring), SLIDER_TOOTH_WIDTH of
 * teeth, the collar groove (walled by the teeth) and a plain flange to the other face (carrying the
 * other ring). The teeth sit off-centre toward the collar-free end by just enough that at either end
 * of the slider's travel at least 70% of them stay in mesh with the full-width partner on the input
 * shaft. A's collar is on its -x side and B's on its +x side, so the two forks sit apart.
 */
export const SLIDER_SHOULDER_WIDTH = 0.002;
export const SLIDER_TOOTH_WIDTH = 0.007;
/**
 * Fork claw thickness where it rides its groove. A and B ride the narrow collar groove with a
 * thinned claw (their arms and bosses keep DIM.fork.thickness beyond FORK_THIN_REACH of the slider
 * axis); C rides the 7 mm gap between third and fourth at full thickness.
 */
export const CLAW_THICKNESS: Record<SliderId, number> = { A: 0.0032, B: 0.0032, C: DIM.fork.thickness };
/** Collar groove: the claw's thickness with 0.2 mm clear of each wall. */
export const COLLAR_GROOVE_WIDTH = CLAW_THICKNESS.A + 0.0004;
export const COLLAR_FLANGE_RADIUS = 0.027;
export const COLLAR_SIDE: Record<'A' | 'B', 1 | -1> = { A: -1, B: 1 };
/** Stations along a collared gear's face in u = collar side × x: teeth start, teeth end (groove start), groove end. */
const COLLAR_U = (() => {
  const teeth = -FACE_WIDTH / 2 + SLIDER_SHOULDER_WIDTH;
  return { teeth, groove: teeth + SLIDER_TOOTH_WIDTH, flange: teeth + SLIDER_TOOTH_WIDTH + COLLAR_GROOVE_WIDTH };
})();
/** Groove centre from the sliding gear's centre. */
const collarOffset = (s: 'A' | 'B'): number => COLLAR_SIDE[s] * (COLLAR_U.groove + COLLAR_GROOVE_WIDTH / 2);
/** Each fork's x at rest: the centre of its collar groove. */
export const FORK_X: Record<SliderId, number> = {
  A: gearAxialPosition(5) + collarOffset('A'), B: gearAxialPosition(6) + collarOffset('B'),
  C: (gearAxialPosition(3) + gearAxialPosition(4)) / 2,
};
/** Running clearance between a claw's inner edge and its groove floor, m. */
export const COLLAR_CLEARANCE = 0.0005;
/**
 * Claw inner radius on each slider. For A and B the claw's outer edge stays below the tips of the
 * input gear meshing with that slider, which spans the collar's x; C rides on the collar between
 * third and fourth, below both gears' roots and the reach of the output gears beside it.
 */
export const COLLAR_RADIUS: Record<SliderId, number> = { A: 0.0235, B: 0.0235, C: 0.0145 };
/** Fork reach: rod axis to the claw centre on the slider's axis. */
export const forkReach = (s: SliderId): number => distanceOf(FORK_ROD[s], SLIDER_AXIS[s]);
export const CLAW_OUTER = (s: SliderId): number => COLLAR_RADIUS[s] + FORK_CLAW_DEPTH;
/** A and B forks are thin within this distance of the output axis: 3 mm beyond their own gears' tips. */
export const FORK_THIN_REACH = Math.max(tipRadius('output', 5), tipRadius('output', 6)) + 0.003;

/** Star wheel on the +x end of the drum, 1.5 mm clear of it. */
export const STAR_X = DRUM_LENGTH / 2 + 0.0015 + DIM.starWheel.thickness / 2;
/** Where the detent roller presses on the star wheel, about the drum axis. */
export const DETENT_CONTACT = deg(-60);
const GEAR_SEAT_DEPTH = STAR_SEAT_DEPTH.gear;
const rollerOnLobe = DIM.starWheel.radius + DETENT_ARM.rollerRadius;
/**
 * Detent arm pivot: on the perpendicular bisector of the roller's two positions on the contact ray,
 * on a lobe and seated in a gear seat, so the roller's arc passes through both and drops straight
 * into each seat. The arm then stands almost square to the radius.
 */
export const DETENT_PIVOT: Axis = axisAt(
  axisAt(DRUM_AXIS, DETENT_CONTACT, rollerOnLobe - GEAR_SEAT_DEPTH / 2),
  DETENT_CONTACT - Math.PI / 2, Math.sqrt(DETENT_ARM.length ** 2 - (GEAR_SEAT_DEPTH / 2) ** 2),
);
/** Detent arm direction, pivot to roller, with the roller on a lobe. */
export const DETENT_ARM_REST = directionOf(DETENT_PIVOT, axisAt(DRUM_AXIS, DETENT_CONTACT, rollerOnLobe));
/** Shift shaft: 40 mm down and forward (-z) of the drum; its pawl points at the drum's end. */
export const SHIFT_SHAFT_AXIS: Axis = axisAt(DRUM_AXIS, deg(-150), 0.04);
export const SHIFT_SHAFT_RADIUS = 0.007;
export const PAWL_X = STAR_X + 0.0135;
export const PAWL_ANGLE = directionOf(SHIFT_SHAFT_AXIS, DRUM_AXIS);
/** The pedal on the shift shaft's outer end, outboard of the chain. */
export const PEDAL_X = 0.115;
export const SHIFT_SHAFT_X = [PAWL_X - 0.004, PEDAL_X + DIM.pedal.bossLength / 2] as const;
/**
 * Pedal lever at rest: forward (-z) and 10° below horizontal. Travel +1 (up) lifts its tip, turning
 * the lever by +PEDAL_SWING about x.
 */
export const PEDAL_REST = deg(-100);
export const PEDAL_SWING = deg(12);

// ---- Final drive ------------------------------------------------------------------------------

export const FRONT_PITCH_RADIUS = sprocketPitchRadius(PARAMS.final.front, DIM.chain.pitch);
export const REAR_PITCH_RADIUS = sprocketPitchRadius(PARAMS.final.rear, DIM.chain.pitch);
/** True scale and true distance: the rear axle is centreDistance behind (+z) the output shaft. */
export const REAR_AXIS: Axis = { y: OUTPUT_AXIS.y, z: OUTPUT_AXIS.z + DIM.chain.centreDistance };
/** The wheel sits inboard of the chain, its tyre 6 mm clear of the chain's inner face. */
export const WHEEL_X = SPROCKET_X - DIM.chain.width / 2 - DIM.wheel.width / 2 - 0.006;
/** Sprocket carrier on the wheel hub's outer end, reaching the rear sprocket. */
export const CARRIER = {
  radius: 0.03,
  x0: WHEEL_X + DIM.wheelParts.hubHalfWidth, x1: SPROCKET_X - SPROCKET_THICKNESS / 2,
} as const;


// ---- Gear solids ------------------------------------------------------------------------------

const xSpan = (s: 'A' | 'B', u0: number, u1: number): [number, number] => {
  const e = [COLLAR_SIDE[s] * u0, COLLAR_SIDE[s] * u1];
  return [Math.min(...e), Math.max(...e)];
};

/** A gear's toothed x-range, relative to its centre. */
export function toothedRange(shaft: 'input' | 'output', g: GearNo): [number, number] {
  const s = sliderOfGear(shaft, g);
  if (shaft !== 'output' || s === null || s === 'C') return [-FACE_WIDTH / 2, FACE_WIDTH / 2];
  return xSpan(s, COLLAR_U.teeth, COLLAR_U.groove);
}

/**
 * A gear's solid regions as cylinders about its axis (x relative to its centre): the teeth, and on
 * a collared slider its shoulder, groove hub and flange.
 */
export function gearSolids(shaft: 'input' | 'output', g: GearNo): { x0: number; x1: number; r: number }[] {
  const [t0, t1] = toothedRange(shaft, g);
  const out = [{ x0: t0, x1: t1, r: tipRadius(shaft, g) }];
  const s = sliderOfGear(shaft, g);
  if (shaft === 'output' && s !== null && s !== 'C') {
    const cyl = (u0: number, u1: number, r: number) => { const [x0, x1] = xSpan(s, u0, u1); return { x0, x1, r }; };
    out.push(
      cyl(-FACE_WIDTH / 2, COLLAR_U.teeth, COLLAR_FLANGE_RADIUS),
      cyl(COLLAR_U.groove, COLLAR_U.flange, COLLAR_RADIUS[s] - COLLAR_CLEARANCE),
      cyl(COLLAR_U.flange, FACE_WIDTH / 2, COLLAR_FLANGE_RADIUS),
    );
  }
  return out;
}

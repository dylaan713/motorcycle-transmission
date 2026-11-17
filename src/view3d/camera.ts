import { MathUtils, Spherical, Vector3 } from 'three';

/**
 * Where the 3D camera sits by default, as a pure function of the subject sphere (the gear train), so the view and
 * the tests agree. Angles follow three's Spherical: polar from +y, azimuth from +z toward +x. The
 * bike's front is -z and the sprocket end of the shafts +x.
 */

export interface CameraPose { azimuth: number; polar: number; /** framing sphere's share of the view */ fill: number }

export const FOV = 32; // degrees, vertical

/** Wide stages: from the sprocket end (+x), in front (-z) and above, so the gear train is the subject. */
export const HOME: CameraPose = { azimuth: MathUtils.degToRad(158), polar: MathUtils.degToRad(58), fill: 1.1 };
/** Narrow stages and the inset: more head-on, filling the width. */
export const NARROW: CameraPose = { azimuth: MathUtils.degToRad(166), polar: MathUtils.degToRad(60), fill: 0.75 };

/** Distance at which the framing sphere fills `fill` of the narrower field of view. */
export function fitDistance(radius: number, aspect: number, fill: number, fov = FOV): number {
  const vHalf = MathUtils.degToRad(fov / 2);
  const hHalf = Math.atan(Math.tan(vHalf) * (aspect > 0 ? aspect : 1));
  return radius / (fill * Math.sin(Math.min(vHalf, hHalf)));
}

/** The camera for `pose`, looking at the centre of `subject` and framing it by `pose.fill`. */
export function cameraPose(subject: { centre: Vector3; radius: number }, pose: CameraPose, aspect: number): { position: Vector3; target: Vector3 } {
  const d = fitDistance(subject.radius, aspect, pose.fill);
  const position = new Vector3().setFromSpherical(new Spherical(d, pose.polar, pose.azimuth)).add(subject.centre);
  return { position, target: subject.centre.clone() };
}

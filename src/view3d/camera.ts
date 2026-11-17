import { MathUtils, Spherical, Vector3 } from 'three';

/**
 * Where the 3D camera sits by default, as a pure function of the subject sphere (the gear train), so the view and
 * the tests agree. Angles follow three's Spherical: polar from +y, azimuth from +z toward +x. The
 * bike's front is +z and the sprocket end of the shafts +x (the bike's left; see layout3d.ts), so a
 * camera in front looks back at the bike with the sprocket on its screen right and the clutch on its
 * left, the schematic's order.
 */

export interface CameraPose {
  azimuth: number; polar: number;
  /** framing sphere's share of the view */ fill: number;
  /** where the camera looks, from the subject's centre, m */ offset: { x: number; y: number; z: number };
}

export const FOV = 32; // degrees, vertical

/**
 * Wide views: from the sprocket end (+x), in front (+z) and above, so the gear train is the
 * subject, looking a centimetre below its centre. Provisional numbers from the stage 3 review.
 */
export const HOME: CameraPose = { azimuth: MathUtils.degToRad(16), polar: MathUtils.degToRad(58), fill: 1.3, offset: { x: 0, y: -0.01, z: 0 } };
/** Narrow views and the inset: more head-on, looking a little toward the clutch. Provisional. */
export const NARROW: CameraPose = { azimuth: MathUtils.degToRad(10), polar: MathUtils.degToRad(60), fill: 1.25, offset: { x: -0.03, y: -0.01, z: 0 } };
/** A 3D view narrower than this, CSS px, takes the NARROW pose. */
export const NARROW_BELOW = 700;
/** The pose for a 3D view `width` CSS px wide, or the inset's. Chosen by the view's own width, not the window's. */
export const poseFor = (width: number, inInset: boolean): CameraPose => (inInset || width < NARROW_BELOW ? NARROW : HOME);

/** Distance at which the framing sphere fills `fill` of the narrower field of view. */
export function fitDistance(radius: number, aspect: number, fill: number, fov = FOV): number {
  const vHalf = MathUtils.degToRad(fov / 2);
  const hHalf = Math.atan(Math.tan(vHalf) * (aspect > 0 ? aspect : 1));
  return radius / (fill * Math.sin(Math.min(vHalf, hHalf)));
}

/** The camera for `pose`, looking at the subject's centre plus `pose.offset` and framing the subject by `pose.fill`. */
export function cameraPose(subject: { centre: Vector3; radius: number }, pose: CameraPose, aspect: number): { position: Vector3; target: Vector3 } {
  const d = fitDistance(subject.radius, aspect, pose.fill);
  const target = subject.centre.clone().add(new Vector3(pose.offset.x, pose.offset.y, pose.offset.z));
  const position = new Vector3().setFromSpherical(new Spherical(d, pose.polar, pose.azimuth)).add(target);
  return { position, target };
}

import { poseFor, type CameraPose } from './camera';

/**
 * What the 3D view does with its camera, as a pure state machine so it can be tested without a
 * renderer. The view keeps the default composition until the visitor moves the camera ("touched");
 * moving into the inset parks the visitor's camera and frames the inset its own way; moving back
 * gives the parked camera back. `P` is whatever the view stores for a parked camera.
 */
export interface CameraState<P> { touched: boolean; inInset: boolean; parked: { pose: CameraPose; at: P } | null }

/** Place the camera at `pose`'s default, or (with `at`) at a parked camera about that pose's target. */
export interface Placement<P> { pose: CameraPose; at?: P }

export const initialCameraState = <P>(): CameraState<P> => ({ touched: false, inInset: false, parked: null });

/** Reset: the default for the view's width; the visitor's moves are forgotten. */
export function onReset<P>(s: CameraState<P>, width: number): Placement<P> {
  s.touched = false;
  return { pose: poseFor(width, s.inInset) };
}

/** The visitor moved the camera (a drag, a wheel or pinch zoom, an orbit or zoom key). */
export function onTouch<P>(s: CameraState<P>): void { s.touched = true; }

/**
 * A resize (or a move between the stage and the inset): where to put the camera, or null to leave
 * it. `current` is the camera as it stands, with the pose it was placed for, parked if needed.
 */
export function onResize<P>(s: CameraState<P>, width: number, inInset: boolean, current: () => { pose: CameraPose; at: P }): Placement<P> | null {
  if (inInset !== s.inInset) {
    s.inInset = inInset;
    if (inInset) {
      s.parked = s.touched ? current() : null;
      return { pose: poseFor(width, true) };
    }
    if (s.parked) {
      const back = s.parked;
      s.parked = null;
      return { pose: back.pose, at: back.at };
    }
    return onReset(s, width);
  }
  // keep the composition until the visitor moves the camera; the inset always takes its own
  return !s.touched || inInset ? { pose: poseFor(width, inInset) } : null;
}

/** Of the parts a pick ray meets, nearest first: a solid one seen through a ghost wins over the ghost. */
export function preferSolid<T>(hits: readonly T[], isSolid: (h: T) => boolean): T | undefined {
  return hits.find(isSolid) ?? hits[0];
}

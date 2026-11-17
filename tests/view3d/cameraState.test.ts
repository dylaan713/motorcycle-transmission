import { expect, test } from 'vitest';
import { HOME, NARROW, NARROW_BELOW, poseFor } from '../../src/view3d/camera';
import { initialCameraState, onReset, onResize, onTouch, preferSolid } from '../../src/view3d/cameraState';

test('the pose follows the 3D view\'s own width, not the window\'s; the inset always takes the narrow pose', () => {
  expect(NARROW_BELOW).toBe(700);
  expect(poseFor(1080, false)).toBe(HOME);
  expect(poseFor(699, false)).toBe(NARROW);
  expect(poseFor(700, false)).toBe(HOME);
  expect(poseFor(1080, true)).toBe(NARROW);
  // the review's provisional numbers, mirrored for the front at +z (azimuths 164° and 170° became 16° and 10°)
  expect(HOME.azimuth * 180 / Math.PI).toBeCloseTo(16, 9); expect(HOME.polar * 180 / Math.PI).toBeCloseTo(58, 9);
  expect(HOME.fill).toBe(1.3); expect(HOME.offset).toEqual({ x: 0, y: -0.01, z: 0 });
  expect(NARROW.azimuth * 180 / Math.PI).toBeCloseTo(10, 9); expect(NARROW.polar * 180 / Math.PI).toBeCloseTo(60, 9);
  expect(NARROW.fill).toBe(1.25); expect(NARROW.offset).toEqual({ x: -0.03, y: -0.01, z: 0 });
});

test('untouched, every resize re-frames for the width; once touched, the visitor\'s camera stays', () => {
  const s = initialCameraState<string>();
  expect(onReset(s, 1080)).toEqual({ pose: HOME });
  expect(onResize(s, 600, false, () => ({ pose: HOME, at: 'here' }))).toEqual({ pose: NARROW });
  onTouch(s);
  expect(onResize(s, 1080, false, () => ({ pose: NARROW, at: 'here' }))).toBeNull();
  expect(onReset(s, 1080)).toEqual({ pose: HOME });
  expect(s.touched).toBe(false);
});

test('into the inset the visitor\'s camera is parked and given back on the way out; an untouched one is re-framed', () => {
  const s = initialCameraState<string>();
  onTouch(s);
  expect(onResize(s, 300, true, () => ({ pose: HOME, at: 'mine' }))).toEqual({ pose: NARROW });
  expect(onResize(s, 320, true, () => ({ pose: NARROW, at: 'inset' }))).toEqual({ pose: NARROW }); // the inset keeps its own framing
  expect(onResize(s, 1080, false, () => ({ pose: NARROW, at: 'inset' }))).toEqual({ pose: HOME, at: 'mine' });
  expect(s.parked).toBeNull();
  const t = initialCameraState<string>();
  onResize(t, 300, true, () => ({ pose: HOME, at: 'x' }));
  expect(onResize(t, 1080, false, () => ({ pose: NARROW, at: 'y' }))).toEqual({ pose: HOME });
});

test('picking prefers a solid part seen through a ghost, else the nearest hit', () => {
  const hits = [{ id: 'wheel', solid: false }, { id: 'gear', solid: true }];
  expect(preferSolid(hits, (h) => h.solid)?.id).toBe('gear');
  expect(preferSolid([hits[0]], (h) => h.solid)?.id).toBe('wheel');
  expect(preferSolid([], () => true)).toBeUndefined();
});

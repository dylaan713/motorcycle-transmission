import type { View3d } from './view';

/**
 * The app's only door into the 3D chunk. This file stays in the initial bundle, so it must never
 * import `three` or anything that does; the chunk arrives through the dynamic import below.
 */

export type Progress = (done: number, total: number, label: string) => void;

/** Whether this browser can give the 3D view a WebGL 2 context (the renderer needs 2). */
export function webglAvailable(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext(); // give the probe's context back at once
    return true;
  } catch {
    return false;
  }
}

/** Progress inside the chunk, counted after the chunk's own step out of one fixed total. */
export const afterChunk = (onProgress: Progress): Progress =>
  (done, total, label) => onProgress(1 + done, 1 + total, label);

/**
 * Progress for building the 3D view: the assembly's `buildSteps` steps (each reported by the
 * assembly against its own total, rescaled here), then starting the renderer as the last step.
 * One total throughout, so the bar only climbs, and only the end reads "Ready".
 */
export function buildProgress(onProgress: Progress, buildSteps: number): {
  start(): void; build: Progress; renderer(): void; ready(): void;
} {
  const total = buildSteps + 1;
  return {
    start: () => onProgress(0, total, 'Building the model'),
    build: (done, steps, label) => onProgress((done / steps) * buildSteps, total, label),
    renderer: () => onProgress(buildSteps, total, 'Starting the renderer'),
    ready: () => onProgress(total, total, 'Ready'),
  };
}

/**
 * Fetches the 3D chunk, builds the assembly and its view in `container`. Progress counts real
 * steps: one for the chunk, then the assembly's steps, then starting the renderer.
 */
export async function load3d(container: HTMLElement, onProgress: Progress): Promise<View3d> {
  onProgress(0, 1, 'Loading 3D view');
  const mod = await import('./index');
  return mod.create(container, afterChunk(onProgress));
}

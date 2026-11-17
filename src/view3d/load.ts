import type { View } from '../app/view';

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

/**
 * Fetches the 3D chunk and builds its view in `container`. Progress counts real steps: one for
 * the chunk, then each step the chunk reports while it builds.
 */
export async function load3d(container: HTMLElement, onProgress: Progress): Promise<View> {
  onProgress(0, 1, 'Loading 3D view');
  const mod = await import('./index');
  return mod.create(container, (done, total, label) => onProgress(1 + done, 1 + total, label));
}

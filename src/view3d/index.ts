import { buildAssembly } from './assembly';
import type { Progress } from './load';
import { create3dView, type View3d } from './view';

/** Entry of the lazily loaded 3D chunk: builds the model with progress, then its view. */

/** Lets the loader paint between steps. */
const nextFrame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()));

export async function create(container: HTMLElement, onProgress: Progress): Promise<View3d> {
  onProgress(0, 1, 'Building the model');
  await nextFrame();
  const assembly = await buildAssembly(onProgress);
  onProgress(1, 1, 'Starting the renderer');
  await nextFrame();
  return create3dView(container, assembly);
}

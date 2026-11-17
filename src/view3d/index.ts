import { BUILD_STEPS, buildAssembly } from './assembly';
import { buildProgress, type Progress } from './load';
import { create3dView, type View3d } from './view';

/** Entry of the lazily loaded 3D chunk: builds the model with progress, then its view. */

/** Lets the loader paint between steps. */
const nextFrame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()));

export async function create(container: HTMLElement, onProgress: Progress): Promise<View3d> {
  const progress = buildProgress(onProgress, BUILD_STEPS);
  progress.start();
  await nextFrame();
  const assembly = await buildAssembly(progress.build);
  progress.renderer();
  await nextFrame();
  const view = create3dView(container, assembly);
  progress.ready();
  return view;
}

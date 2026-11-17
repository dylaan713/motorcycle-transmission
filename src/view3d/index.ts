import {
  CylinderGeometry, DirectionalLight, Group, HemisphereLight, Mesh, PerspectiveCamera, Scene, WebGLRenderer,
} from 'three';
import type { Material, Object3D } from 'three';
import type { View } from '../app/view';
import { COLORS } from '../ui/tokens';
import { withEdges } from './materials';
import type { Progress } from './load';

/**
 * Entry of the lazily loaded 3D chunk. For now it builds a placeholder scene, one lit gear blank
 * turning slowly, which proves the chunk, the renderer and the materials end to end.
 */

const MAX_DPR = 2;
const SPIN = 0.25; // rad/s
// scene units, placeholder only; 12 facets meet at 30°, over the 28° edge threshold, so the turn shows
const BLANK = { radius: 1, width: 0.35, segments: 12 };

/** Lets the loader paint between steps. */
const nextFrame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()));

function disposeTree(root: Object3D): void {
  root.traverse((o) => {
    const m = o as Mesh;
    m.geometry?.dispose();
    const mats: Material | Material[] | undefined = m.material;
    if (mats) for (const mat of Array.isArray(mats) ? mats : [mats]) mat.dispose();
  });
}

export async function create(container: HTMLElement, onProgress: Progress): Promise<View> {
  const total = 2;
  onProgress(0, total, 'Starting the renderer');
  await nextFrame();

  const renderer = new WebGLRenderer({ antialias: true });
  renderer.setClearColor(COLORS.ground, 1);
  const canvas = renderer.domElement;
  canvas.className = 'view-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', '3D model of the gearbox (placeholder: a single gear blank)');
  container.append(canvas);

  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 2.2, 6.5);
  camera.lookAt(0, 0, 0);
  // soft fill from the sky, one key light from upper front left so faces separate by tone
  scene.add(new HemisphereLight(COLORS.ink, COLORS.ground, 1.1));
  const key = new DirectionalLight(COLORS.ink, 2.2);
  key.position.set(-3, 4, 3);
  scene.add(key);
  onProgress(1, total, 'Building the model');
  await nextFrame();

  const blank = withEdges(new CylinderGeometry(BLANK.radius, BLANK.radius, BLANK.width, BLANK.segments), 'steel4');
  // the blank spins about its own axis; the stand tilts that axis toward the viewer
  const stand = new Group();
  stand.rotation.set(0.85, 0, 0.5);
  stand.add(blank);
  scene.add(stand);
  onProgress(2, total, 'Ready');

  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let last: number | null = null;

  return {
    render() {
      const now = performance.now();
      if (!still && last !== null) blank.rotation.y += (SPIN * (now - last)) / 1000;
      last = now;
      renderer.render(scene, camera);
    },
    resize(width, height, dpr) {
      if (width <= 0 || height <= 0) return;
      renderer.setPixelRatio(Math.min(MAX_DPR, dpr > 0 ? dpr : 1));
      renderer.setSize(width, height, false); // CSS size comes from the stylesheet
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },
    pick: () => null,
    setHighlight() {},
    dispose() {
      disposeTree(scene);
      renderer.dispose();
      canvas.remove();
    },
  };
}

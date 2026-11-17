import type { ViewName } from '../app/stageHost';
import { el } from './dom';
import { tabKeyTarget } from './panel';

/** The stage toolbar: view switch, inset, torque flow, labels and camera buttons. */

export interface ToolbarHooks {
  onView(v: ViewName): void;
  onInset(on: boolean): void;
  onTorqueFlow(on: boolean): void;
  onLabels(on: boolean): void;
  onResetCamera(): void;
  onOrbit(d: number): void;
  onZoom(f: number): void;
}

export interface Toolbar {
  /** Reflect state changed elsewhere (a click on the inset, a narrow screen, context loss). */
  sync(s: { view?: ViewName; inset?: boolean; labels?: boolean; torqueFlow?: boolean }): void;
}

/** One toolbar press: an orbit of 15° and a zoom of 1.25×. */
export const ORBIT_STEP = Math.PI / 12;
export const ZOOM_STEP = 1.25;

// 24 × 24 stroke icons in currentColor
const ICONS = {
  cube: '<path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5 12 12l8-4.5M12 12v9"/>',
  schematic: '<circle cx="8" cy="9" r="4.5"/><circle cx="16.5" cy="15.5" r="3.5"/><path d="M3 20h18"/>',
  inset: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><rect x="5.5" y="12.5" width="7" height="5" rx="0.5"/>',
  torque: '<path d="M3 15c3 0 3-6 6-6s3 6 6 6 3-6 6-6"/><path d="m18 6 3 3-3 3"/>',
  labels: '<rect x="3" y="4" width="10" height="6" rx="1"/><path d="M13 7h3.5l3 7"/><circle cx="19.5" cy="16" r="2"/>',
  orbitLeft: '<path d="M8 6H4V2"/><path d="M4.3 6A8.5 8.5 0 1 1 3.5 13"/>',
  orbitRight: '<path d="M16 6h4V2"/><path d="M19.7 6a8.5 8.5 0 1 0 .8 7"/>',
  zoomOut: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5M7.5 10.5h6"/>',
  zoomIn: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5M7.5 10.5h6M10.5 7.5v6"/>',
  reset: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/><circle cx="12" cy="12" r="2.5"/>',
} as const;

const icon = (name: keyof typeof ICONS): SVGSVGElement => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.innerHTML = ICONS[name];
  return svg;
};

interface Spec {
  id: string; name: string; tip: string; icon: keyof typeof ICONS;
  /** Shown on narrow screens too. */
  essential?: boolean;
  /** Acts on the 3D camera: unavailable while the schematic is the main view. */
  camera?: boolean;
  group: number;
}

const SPECS: Spec[] = [
  { id: '3d', name: '3D view', tip: '3D view', icon: 'cube', essential: true, group: 0 },
  { id: 'schematic', name: 'Schematic', tip: 'Schematic view', icon: 'schematic', essential: true, group: 0 },
  { id: 'inset', name: 'Inset view', tip: 'Show the other view in a corner', icon: 'inset', group: 1 },
  { id: 'torque', name: 'Torque flow', tip: 'Light the parts carrying torque', icon: 'torque', essential: true, group: 1 },
  { id: 'labels', name: 'Labels', tip: 'Labels', icon: 'labels', camera: true, group: 1 },
  { id: 'orbitLeft', name: 'Orbit left', tip: 'Orbit left (Q)', icon: 'orbitLeft', camera: true, group: 2 },
  { id: 'orbitRight', name: 'Orbit right', tip: 'Orbit right (E)', icon: 'orbitRight', camera: true, group: 2 },
  { id: 'zoomOut', name: 'Zoom out', tip: 'Zoom out (X)', icon: 'zoomOut', camera: true, group: 2 },
  { id: 'zoomIn', name: 'Zoom in', tip: 'Zoom in (Z)', icon: 'zoomIn', camera: true, group: 2 },
  { id: 'reset', name: 'Reset view', tip: 'Reset view (0)', icon: 'reset', essential: true, camera: true, group: 2 },
];

export function mountToolbar(host: HTMLElement, hooks: ToolbarHooks, initial: { view: ViewName; inset: boolean; labels: boolean }): Toolbar {
  const state = { view: initial.view, inset: initial.inset, labels: initial.labels, torqueFlow: true };
  const bar = el('div', 'toolbar', { role: 'toolbar', 'aria-label': 'View', 'aria-orientation': 'horizontal' });
  const buttons = new Map<string, HTMLButtonElement>();
  let group = 0;
  for (const s of SPECS) {
    if (s.group !== group) { bar.append(el('span', 'toolbar-sep', { 'aria-hidden': 'true' })); group = s.group; }
    const b = el('button', 'tool', { type: 'button', title: s.tip, 'aria-label': s.name, tabindex: '-1', 'data-press': '', 'data-id': s.id });
    if (s.essential) b.dataset.essential = '';
    b.append(icon(s.icon));
    bar.append(b);
    buttons.set(s.id, b);
  }
  const hint = el('p', 'toolbar-hint mono', { 'aria-hidden': 'true' }, 'Drag to orbit · Q E orbit · Z X zoom · 0 reset');
  host.append(bar, hint);

  const render = (): void => {
    const is3d = state.view === '3d';
    buttons.get('3d')!.setAttribute('aria-pressed', String(is3d));
    buttons.get('schematic')!.setAttribute('aria-pressed', String(!is3d));
    buttons.get('inset')!.setAttribute('aria-pressed', String(state.inset));
    buttons.get('torque')!.setAttribute('aria-pressed', String(state.torqueFlow));
    buttons.get('labels')!.setAttribute('aria-pressed', String(state.labels));
    for (const s of SPECS) {
      const b = buttons.get(s.id)!;
      if (s.camera && !is3d) b.setAttribute('aria-disabled', 'true'); else b.removeAttribute('aria-disabled');
    }
    hint.hidden = !is3d;
  };

  const act: Record<string, () => void> = {
    '3d': () => { state.view = '3d'; hooks.onView('3d'); },
    schematic: () => { state.view = 'schematic'; hooks.onView('schematic'); },
    inset: () => { state.inset = !state.inset; hooks.onInset(state.inset); },
    torque: () => { state.torqueFlow = !state.torqueFlow; hooks.onTorqueFlow(state.torqueFlow); },
    labels: () => { state.labels = !state.labels; hooks.onLabels(state.labels); },
    orbitLeft: () => hooks.onOrbit(ORBIT_STEP),
    orbitRight: () => hooks.onOrbit(-ORBIT_STEP),
    zoomOut: () => hooks.onZoom(ZOOM_STEP),
    zoomIn: () => hooks.onZoom(1 / ZOOM_STEP),
    reset: () => hooks.onResetCamera(),
  };
  bar.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('.tool');
    if (!b || b.getAttribute('aria-disabled') === 'true') return;
    act[b.dataset.id!]();
    focusable(b);
    render();
  });

  // roving tabindex over the buttons shown at this width
  const shown = (): HTMLButtonElement[] => [...buttons.values()].filter((b) => b.offsetParent !== null);
  const focusable = (b: HTMLButtonElement): void => { for (const x of buttons.values()) x.tabIndex = x === b ? 0 : -1; };
  const settle = (): void => {
    const list = shown();
    if (list.length > 0 && !list.some((b) => b.tabIndex === 0)) focusable(list[0]);
  };
  bar.addEventListener('keydown', (e) => {
    const list = shown();
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    const next = tabKeyTarget(e, list.length, i);
    if (next === null) return;
    e.preventDefault();
    focusable(list[next]);
    list[next].focus();
  });
  focusable(buttons.get('3d')!);
  matchMedia('(min-width: 900px)').addEventListener('change', settle);
  render();

  return {
    sync(s) {
      Object.assign(state, Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined)));
      render();
    },
  };
}

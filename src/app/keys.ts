import { CAMERA_KEYS, KEYMAP } from './controls';

/** What the key filter needs to know about the element a key event is aimed at. */
export interface KeyTarget {
  tag: string; // upper-case tag name
  role: string | null;
  editable: boolean; // contenteditable
  inPanel: boolean; // inside the information panel
}

export interface KeyPress { code: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean }

const FORM_FIELDS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
const ACTIVATED_BY_ENTER_TAGS = new Set(['BUTTON', 'A', 'SUMMARY']);
const ACTIVATED_BY_ENTER_ROLES = new Set([
  'button', 'link', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'switch',
  'checkbox', 'radio', 'treeitem',
]);

/**
 * Whether a keydown belongs to the deck. It does not when: the key is not ours; a browser
 * shortcut modifier is down; the visitor is typing in a field; Enter is aimed at something
 * Enter activates (a button, link, tab...); an arrow key is scrolling the information panel.
 */
export function shouldHandleKey(e: KeyPress, target: KeyTarget | null): boolean {
  if (!Object.hasOwn(KEYMAP, e.code) || !free(e, target)) return false;
  if (target === null) return true;
  if (e.code === 'Enter' &&
    (ACTIVATED_BY_ENTER_TAGS.has(target.tag) || ACTIVATED_BY_ENTER_ROLES.has(target.role ?? ''))) return false;
  if ((e.code === 'ArrowUp' || e.code === 'ArrowDown') && target.inPanel) return false;
  return true;
}

/** No browser shortcut modifier is down and the visitor is not typing in a field. */
function free(e: KeyPress, target: KeyTarget | null): boolean {
  if (e.metaKey || e.ctrlKey || e.altKey) return false;
  return target === null || !(target.editable || FORM_FIELDS.has(target.tag));
}

/** Whether a keydown moves the 3D camera (Q, E, Z, X, 0), on the same terms as the deck keys. */
export function shouldHandleCameraKey(e: KeyPress, target: KeyTarget | null): boolean {
  return Object.hasOwn(CAMERA_KEYS, e.code) && free(e, target);
}

/** Describes a DOM event target for shouldHandleKey; touches the DOM only when called. */
export function describeTarget(target: EventTarget | null): KeyTarget | null {
  if (!(target instanceof Element)) return null;
  return {
    tag: target.tagName.toUpperCase(),
    role: target.getAttribute('role'),
    editable: target instanceof HTMLElement && target.isContentEditable,
    inPanel: target.closest('#panel') !== null,
  };
}

import { COLORS } from '../tokens';

// The colour tokens live in src/tokens.ts so the views need not import ui; re-exported here.
export { COLORS, contrast } from '../tokens';

/** CSS custom property name for a COLORS key: steel1 becomes --steel-1. */
export function cssName(key: string): string {
  return '--' + key.replace(/(\d+)$/, '-$1');
}

export function applyTokens(root: HTMLElement): void {
  for (const [key, value] of Object.entries(COLORS)) root.style.setProperty(cssName(key), value);
}

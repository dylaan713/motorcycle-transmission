export const COLORS = {
  ground: '#14161A',
  surface: '#1E2228',
  ink: '#E8EAED',
  third: '#8F99A8',
  signal: '#FF6A1A',
  steel1: '#2A3038',
  steel2: '#3A424D',
  steel3: '#566170',
} as const;

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

/** WCAG 2 contrast ratio between two #RRGGBB colours. */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** CSS custom property name for a COLORS key: steel1 becomes --steel-1. */
export function cssName(key: string): string {
  return '--' + key.replace(/(\d+)$/, '-$1');
}

export function applyTokens(root: HTMLElement): void {
  for (const [key, value] of Object.entries(COLORS)) root.style.setProperty(cssName(key), value);
}

/**
 * The palette, the one source of colour for the views and the page. Roles from the instrument
 * design: ground is the field, surface the switchgear bodies, edge hairlines and control borders
 * (never the only cue: 1.5:1), steel the tach track and minor ticks (strokes only), ink, ink2 and
 * ink3 the three text levels (ink3 on ground and surface only), and torque means exactly one thing:
 * this part is carrying torque. It is never text.
 */
export const COLORS = {
  ground: '#060708',
  surface: '#121519',
  edge: '#2A2F36',
  steel: '#5B636D',
  ink: '#F2F4F6',
  ink2: '#A3ACB7',
  ink3: '#7D8692',
  torque: '#FF7A1A',
  // the part tones of the 3D model and the schematic: a cool ladder whose darkest still clears the
  // ground; never used for text or page chrome
  steel1: '#29313B',
  steel2: '#38414D',
  steel3: '#525E6E',
  steel4: '#768498',
  steel5: '#A5B0BF',
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

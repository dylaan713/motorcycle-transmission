/**
 * An on/off setting with a default by screen width (the inset and the labels are on at 900 px and
 * wider) until the visitor sets it; from then on their choice holds whatever the width.
 */
export interface Choice {
  /** The setting at this width. */
  value(wide: boolean): boolean;
  /** The visitor set it. */
  choose(on: boolean): void;
  /** Whether the visitor has set it. */
  readonly chosen: boolean;
}

export function createChoice(byWidth: (wide: boolean) => boolean): Choice {
  let chosen: boolean | null = null;
  return {
    value: (wide) => chosen ?? byWidth(wide),
    choose(on) { chosen = on; },
    get chosen() { return chosen !== null; },
  };
}

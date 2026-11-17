/** A rectangle in CSS px, relative to the stage's top-left corner. */
export interface Region { x: number; y: number; w: number; h: number }

/** What is on the stage, beside its size. */
export interface StageLayout {
  /** At least 900px wide: the cluster is a card at the top right, otherwise a strip across the top. */
  wide: boolean;
  /** A part is selected, so its card is showing. */
  partCard: boolean;
  /** The other view is showing as an inset at the bottom left. */
  inset: boolean;
  /** The toolbar is mounted (the 3D view has arrived). */
  toolbar: boolean;
}

/** The overlay regions on the stage, each reserved for one thing; callout cards keep clear of all of them. */
export interface StageRegions {
  cluster: Region;
  partCard: Region | null;
  inset: Region | null;
  toolbar: Region | null;
}

// These mirror styles.css: keep them together.
export const EDGE = 16; // px from the stage edges to the cluster and part card
export const CLUSTER_W = 300;
export const CLUSTER_MAX_H = 220;
export const GAP = 8; // between the cluster and the part card
export const GUTTER = 24; // the stage's padding at 900px and wider
export const INSET_SHARE = 0.28; // the inset's width and height, as a share of the stage
export const TOOLBAR_BAND = { wide: 58, narrow: 46 } as const;
export const STRIP = { cluster: 52, partCard: 64 } as const; // heights of the phone strips

/**
 * The reserved rectangles for a w × h stage. Wide: the cluster in the top-right corner, the part
 * card under it in the same column reaching down to EDGE above the toolbar band, the inset at the
 * bottom left and the toolbar band along the bottom. Narrow: the cluster a strip across the top
 * and the part card a strip at the bottom, above the toolbar band; there is no inset.
 */
export function stageRegions(w: number, h: number, on: StageLayout): StageRegions {
  const band = on.toolbar ? (on.wide ? TOOLBAR_BAND.wide : TOOLBAR_BAND.narrow) : 0;
  const toolbar = on.toolbar ? { x: 0, y: h - band, w, h: band } : null;
  if (!on.wide) {
    return {
      cluster: { x: 0, y: 0, w, h: STRIP.cluster },
      partCard: on.partCard ? { x: 0, y: h - band - STRIP.partCard, w, h: STRIP.partCard } : null,
      inset: null,
      toolbar,
    };
  }
  const cluster = { x: w - EDGE - CLUSTER_W, y: EDGE, w: CLUSTER_W, h: CLUSTER_MAX_H };
  const cardTop = cluster.y + cluster.h + GAP;
  const cardBottom = h - band - EDGE;
  return {
    cluster,
    partCard: on.partCard ? { x: cluster.x, y: cardTop, w: CLUSTER_W, h: Math.max(0, cardBottom - cardTop) } : null,
    inset: on.inset
      ? { x: GUTTER, y: h - INSET_SHARE * h, w: INSET_SHARE * w - GUTTER, h: INSET_SHARE * h - GUTTER }
      : null,
    toolbar,
  };
}

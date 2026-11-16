export const deg = (d: number): number => (d * Math.PI) / 180;
export const toDeg = (r: number): number => (r * 180) / Math.PI;
export const rpm = (n: number): number => (n * 2 * Math.PI) / 60;
export const toRpm = (w: number): number => (w * 60) / (2 * Math.PI);
/** Clamp x into [lo, hi]; NaN maps to lo. */
export const clamp = (x: number, lo: number, hi: number): number =>
  Number.isNaN(x) ? lo : Math.min(hi, Math.max(lo, x));
/** Wrap x into [0, period). */
export const wrap = (x: number, period: number): number => {
  const r = x % period;
  return r < 0 ? r + period : r;
};

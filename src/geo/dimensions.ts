/** Part dimensions for the 3D model, metres. Gear sizes come from `src/model/geometry.ts`. */
export const DIM = {
  pressureAngleDeg: 20, addendum: 1.0, dedendum: 1.25,       // in modules
  inputShaftRadius: 0.011, outputShaftRadius: 0.0125,
  gearPitch: 0.021,                 // axial distance between neighbouring gear centres
  dogHeight: 0.0025, dogInnerRadius: 0.016, dogOuterRadius: 0.023, dogWidthDeg: 28,  // 5 dogs, 72° pitch
  clutch: { basketOuterRadius: 0.078, basketDepth: 0.046, plateOuterRadius: 0.070, plateInnerRadius: 0.046,
            frictionThickness: 0.003, steelThickness: 0.0016, plates: 8, gapOpen: 0.0006,
            hubRadius: 0.044, springCount: 5, springRadius: 0.007 },
  primary: { faceWidth: 0.016 },    // 36T on the crank, 76T ring on the basket, same MODULE
  drum: { radius: 0.022, grooveDepth: 0.004, grooveWidth: 0.006 },
  fork: { thickness: 0.005, rodRadius: 0.006, pinRadius: 0.0028 },
  starWheel: { radius: 0.020, thickness: 0.006 },
  chain: { pitch: 0.015875, rollerRadius: 0.005, plateHeight: 0.012, width: 0.016, centreDistance: 0.56 },
  wheel: { radius: 0.31, tyreSection: 0.09, rimRadius: 0.215, hubRadius: 0.04, width: 0.14 },
} as const;

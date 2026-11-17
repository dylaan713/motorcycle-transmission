import { GEAR_PITCH } from '../model/geometry';

/**
 * Part dimensions for the 3D model, metres. Gear sizes come from `src/model/geometry.ts`. The
 * sub-objects after `wheel` hold the feature sizes that decide how parts fit each other.
 */
export const DIM = {
  pressureAngleDeg: 20, addendum: 1.0, dedendum: 1.25,       // in modules
  inputShaftRadius: 0.011, outputShaftRadius: 0.0125,
  gearPitch: GEAR_PITCH,            // axial distance between neighbouring gear centres
  dogHeight: 0.0025, dogInnerRadius: 0.016, dogOuterRadius: 0.023, dogWidthDeg: 28,  // 5 dogs, 72° pitch
  clutch: { basketOuterRadius: 0.078, basketDepth: 0.048, plateOuterRadius: 0.070, plateInnerRadius: 0.046,
            frictionThickness: 0.003, steelThickness: 0.0016, plates: 8, gapOpen: 0.0006,
            hubRadius: 0.044, springCount: 5, springRadius: 0.007 },
  primary: { faceWidth: 0.016 },    // 36T on the crank, 76T ring on the basket, same MODULE
  drum: { radius: 0.022, grooveDepth: 0.004, grooveWidth: 0.006 },
  fork: { thickness: 0.005, rodRadius: 0.006, pinRadius: 0.0028 },
  starWheel: { radius: 0.020, thickness: 0.006 },
  chain: { pitch: 0.015875, rollerRadius: 0.005, plateHeight: 0.012, width: 0.016, centreDistance: 0.56 },
  wheel: { radius: 0.31, tyreSection: 0.09, rimRadius: 0.215, hubRadius: 0.04, width: 0.14 },

  // Clutch frame x: 0 is the outer face of the basket's back; the basket opens toward +x.
  basket: { floor: 0.006, wall: 0.0065, boreRadius: 0.020, tabs: 12,
            tabOuterRadius: 0.0765, tabHalfWidth: 0.0045, slotClearance: 0.0008 },
  clutchHub: { back: 0.0065, face: 0.009, wallRadius: 0.068, splines: 18, splineDepth: 0.003,
               bodyRadius: 0.036, webTop: 0.016, bossRadius: 0.017, bossEnd: 0.030,
               endClearance: 0.0007,  // hub end to pressure plate cover, clutch fully engaged
               postRadius: 0.0035, postPitchRadius: 0.024, postStart: 0.015,
               springSeat: 0.080, washerRadius: 0.0095, washerThickness: 0.0025 },
  steelPlate: { outerRadius: 0.0695, toothClearance: 0.0005 },  // tooth tip above the hub's spline root
  // pressure plate x is its own, 0 at the clamping face
  pressurePlate: { ringThickness: 0.0045, ringInnerClearance: 0.0015, wallRadius: 0.0505, cover: 0.0075,
                   springFace: 0.0115, liftHoleRadius: 0.009, postHoleClearance: 0.001 },
  spring: { wire: 0.0011, turns: 5, deadTurns: 0.75 },
  starWheelMount: { boreRadius: 0.006 },
  detentArm: { length: 0.032, rollerRadius: 0.005, pivotRadius: 0.0075 },
  pedal: { length: 0.15, bossRadius: 0.011, bossLength: 0.024, pegRadius: 0.007, pegLength: 0.04 },
  wheelParts: { rimDepth: 0.015, flangeHeight: 0.011, flangeInset: 0.005, hubHalfWidth: 0.06,
                axleRadius: 0.012, spokes: 5, spokeHalfThickness: 0.012 },
} as const;

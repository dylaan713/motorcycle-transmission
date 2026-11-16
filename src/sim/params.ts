export const PARAMS = {
  dt: 1 / 2000,
  primary: { drive: 36, driven: 76 },
  // [teeth on input shaft, teeth on output shaft]; every pair sums to 50
  gears: { 1: [13, 37], 2: [17, 33], 3: [19, 31], 4: [21, 29], 5: [23, 27], 6: [24, 26] },
  final: { front: 16, rear: 45 },
  wheelRadius: 0.31,
  mass: 270, // bike plus rider, kg
  wheelInertia: 1.0, // both wheels, kg·m²
  cdA: 0.35, crr: 0.015, airDensity: 1.225, g: 9.81,
  brakeMaxTorque: 600, // N·m at the rear wheel
  engine: {
    inertia: 0.012, // at the crank
    // [rpm, N·m] at full throttle, linear between points
    torqueCurve: [[1000, 30], [4000, 42], [8000, 55], [11000, 60], [13500, 56], [15000, 48]],
    closedThrottle: { base: -4, perRpm: -0.0012 }, // N·m = base + perRpm * rpm
    idleRpm: 1300, idleMaxThrottle: 0.4, // tunable
    limiterRpm: 15000,
    overRevDrag: 0.1, // N·m of extra drag per rpm above limiterRpm, when the wheel forces it; tunable
    stallRpm: 400, startRpm: 600, starterTorque: 15,
  },
  clutch: {
    surfaces: 16, mu: 0.12, clampForce: 1800, meanRadius: 0.058, // capacity ≈ 200 N·m
    leverFullRelease: 0.7, // capacity is zero at and beyond this lever position
    dragCoeff: 0.004, dragMax: 1.5, // tunable
  },
  inputShaft: { inertia: 0.004, friction: 0.05 }, // tunable
  drum: {
    // detent angles in degrees
    detents: { 1: 0, N: 30, 2: 60, 3: 120, 4: 180, 5: 240, 6: 300 },
    inertia: 2e-4, friction: 0.05, damping: 0.5, // kg·m², N·m (sliding), N·m·s/rad; tunable
    staticFriction: 0.3, // N·m, holds a drum at rest; tunable
    detentPeak: 3.3, neutralDetentPeak: 1.65, // N·m, tunable
    grooveFullDeg: 8, grooveZeroDeg: 22,
    strokeDeg: 62, strokeFromNeutralDeg: 32,
    pawlStiffness: 3, footTorqueMax: 8, // N·m/deg and N·m at the drum, tunable
  },
  // which gear each slider locks when moved negative / positive
  sliders: {
    A: { shaft: 'output', neg: 1, pos: 3 },
    B: { shaft: 'output', neg: 4, pos: 2 },
    C: { shaft: 'input', neg: 5, pos: 6 },
  },
  dogs: {
    count: 5, windowDeg: 16, // 72° pitch; a dog can enter over 16° of it
    contactX: 0.5, // |x| at which dog faces meet
    radius: 0.03, mu: 0.15,
    // a fork can lag its groove by forkCompliance (in x units) before the drum goes solid
    forkCompliance: 0.25, forkForceMax: 400, sliderRate: 40, // x units, N, 1/s; tunable
  },
} as const;

import { PARAMS } from '../../src/sim/params';
import { deg, rpm } from '../../src/sim/units';
import { gearRatio, primaryRatio } from '../../src/sim/kinematics';
import { createSimulation, type Simulation } from '../../src/sim/simulation';
import { NEUTRAL_INPUTS, type GearId, type Inputs, type SliderId } from '../../src/sim/types';

export const inp = (o: Partial<Inputs> = {}): Inputs => ({ ...NEUTRAL_INPUTS, ...o });
export const run = (sim: Simulation, inputs: Inputs, seconds: number) => {
  for (let t = 0; t < seconds; t += PARAMS.dt) sim.step(inputs);
  return sim.getState();
};
export const inGear = (g: GearId, engineRpm: number) => {   // locked clutch, steady, in gear g
  const sim = createSimulation();
  const wOut = rpm(engineRpm) / primaryRatio / gearRatio(g);
  const drumDeg = PARAMS.drum.detents[g];
  const id = (['A', 'B', 'C'] as SliderId[]).find(
    (k) => PARAMS.sliders[k].neg === g || PARAMS.sliders[k].pos === g,
  )!;
  const x = PARAMS.sliders[id].neg === g ? -1 : 1;
  sim.setState({
    drum: { angle: deg(drumDeg), omega: 0 },
    sliders: { [id]: { x, phi: 0, locked: g, blocked: false } },
    lockedGear: g,
    engine: { omega: rpm(engineRpm), running: true },
    clutch: { locked: true },
    inputShaftOmega: wOut * gearRatio(g),
    outputShaftOmega: wOut,
  });
  return sim;
};

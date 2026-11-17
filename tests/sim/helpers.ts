import { PARAMS } from '../../src/sim/params';
import { createSimulation, type Simulation } from '../../src/sim/simulation';
import { inGearPatch } from '../../src/sim/states';
import { NEUTRAL_INPUTS, type GearId, type Inputs } from '../../src/sim/types';

export const inp = (o: Partial<Inputs> = {}): Inputs => ({ ...NEUTRAL_INPUTS, ...o });
export const run = (sim: Simulation, inputs: Inputs, seconds: number) => {
  for (let t = 0; t < seconds; t += PARAMS.dt) sim.step(inputs);
  return sim.getState();
};
export const inGear = (g: GearId, engineRpm: number) => {   // locked clutch, steady, in gear g
  const sim = createSimulation();
  sim.setState(inGearPatch(g, engineRpm));
  return sim;
};

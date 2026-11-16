import { createSimulation } from '../../src/sim/simulation';
import type { GearId, SimState } from '../../src/sim/types';

export interface StateFields {
  clutchTorque?: number;
  lockedGear?: GearId | null;
  dogTorque?: number;
  slip?: number;
  clutchLocked?: boolean;
}

/** A fresh simulation state with the named fields overridden. */
export function stateWith(o: StateFields): SimState {
  const s = createSimulation().getState();
  if (o.clutchTorque !== undefined) s.clutch.torque = o.clutchTorque;
  if (o.lockedGear !== undefined) s.lockedGear = o.lockedGear;
  if (o.dogTorque !== undefined) s.dogTorque = o.dogTorque;
  if (o.slip !== undefined) s.clutch.slip = o.slip;
  if (o.clutchLocked !== undefined) s.clutch.locked = o.clutchLocked;
  return s;
}

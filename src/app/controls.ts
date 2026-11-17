import { PARAMS } from '../sim/params';
import type { InputSource } from '../sim/inputScript';
import { NEUTRAL_INPUTS, type Inputs } from '../sim/types';
import { clamp } from '../sim/units';

export type Channel = 'throttle' | 'clutchLever' | 'brake' | 'pedalUp' | 'pedalDown';
type Action = Channel | 'starter' | 'ignition' | 'reset';
type Analog = 'throttle' | 'clutchLever' | 'brake' | 'pedal';

export const KEYMAP: Record<string, Action> = {
  ArrowUp: 'throttle',
  ArrowDown: 'brake',
  KeyC: 'clutchLever',
  KeyW: 'pedalUp',
  KeyS: 'pedalDown',
  Enter: 'starter',
  KeyI: 'ignition',
  KeyR: 'reset',
};

export type CameraAction = 'orbitLeft' | 'orbitRight' | 'zoomIn' | 'zoomOut' | 'resetCamera';
/** Keys that move the 3D camera. They are not deck keys: they never take over the ride. */
export const CAMERA_KEYS: Record<string, CameraAction> = {
  KeyQ: 'orbitLeft',
  KeyE: 'orbitRight',
  KeyZ: 'zoomIn',
  KeyX: 'zoomOut',
  Digit0: 'resetCamera',
};

export interface Controls {
  setKey(code: string, down: boolean): boolean; // returns true if the key is one of ours
  setPointer(channel: Analog, value: number | null): void; // null releases
  setStarter(down: boolean): void;
  toggleIgnition(): void;
  releaseAll(): void; // every key, pointer and starter let go, e.g. when the window loses focus
  seed(inputs: Inputs): void; // take over from these inputs; each channel then ramps from there
  reset(): void; // every channel at rest and the ignition on, as the simulation's reset leaves the bike
  update(dtSeconds: number): void; // advances the ramps
  inputs(): Inputs;
  readonly source: InputSource; // calls update with the step's dt, then inputs()
}

/** Seconds a held key takes to move a channel its full travel, and to return to rest. */
const RAMP: Record<Analog, { rise: number; fall: number }> = {
  throttle: { rise: 0.4, fall: 0.2 },
  brake: { rise: 0.25, fall: 0.1 },
  clutchLever: { rise: 0.12, fall: 0.6 }, // pulls fast, feeds out slowly
  pedal: { rise: 0.08, fall: 0.06 }, // toward ±1, back to 0
};

const RANGE: Record<Analog, [min: number, max: number]> = {
  throttle: [0, 1], brake: [0, 1], clutchLever: [0, 1], pedal: [-1, 1],
};

/** Moves `value` toward `target` by at most `rate × dt`, landing on it exactly. */
function approach(value: number, target: number, rate: number, dt: number): number {
  const stepSize = rate * dt;
  return Math.abs(target - value) <= stepSize ? target : value + Math.sign(target - value) * stepSize;
}

/**
 * Keyboard and pointer state turned into Inputs. Held keys move each analog channel along a
 * ramp, so a short tap is a short stroke. A pointer value overrides a channel's ramp until it
 * is released; the ramp then carries on from where the pointer left it, which is what makes an
 * on-screen widget spring back at the same rate a released key does.
 */
export function createControls(): Controls {
  const held = new Set<string>();
  const value: Record<Analog, number> = { throttle: 0, brake: 0, clutchLever: 0, pedal: 0 };
  const pointer: Record<Analog, number | null> = {
    throttle: null, brake: null, clutchLever: null, pedal: null,
  };
  let ignition = true;
  let starterKey = false;
  let starterButton = false;

  const isHeld = (channel: Channel): boolean => {
    for (const code of held) if (KEYMAP[code] === channel) return true;
    return false;
  };

  const target = (ch: Analog): number => {
    if (ch === 'pedal') return (isHeld('pedalUp') ? 1 : 0) - (isHeld('pedalDown') ? 1 : 0);
    return isHeld(ch) ? 1 : 0;
  };

  const update = (dt: number): void => {
    for (const ch of Object.keys(value) as Analog[]) {
      const p = pointer[ch];
      if (p !== null) { value[ch] = p; continue; }
      const goal = target(ch);
      const { rise, fall } = RAMP[ch];
      // a held key drives at the rise rate; with nothing held the channel returns at the fall rate
      value[ch] = approach(value[ch], goal, 1 / (goal !== 0 ? rise : fall), dt);
    }
  };

  const inputs = (): Inputs => ({
    ...NEUTRAL_INPUTS,
    throttle: pointer.throttle ?? value.throttle,
    brake: pointer.brake ?? value.brake,
    clutchLever: pointer.clutchLever ?? value.clutchLever,
    pedal: pointer.pedal ?? value.pedal,
    ignition,
    starter: starterKey || starterButton,
  });

  const seed = (from: Inputs): void => {
    for (const ch of Object.keys(value) as Analog[]) {
      const [lo, hi] = RANGE[ch];
      value[ch] = clamp(Number.isFinite(from[ch]) ? from[ch] : 0, lo, hi);
    }
    ignition = from.ignition;
  };

  return {
    setKey(code, down) {
      if (!Object.hasOwn(KEYMAP, code)) return false;
      const action = KEYMAP[code];
      if (action === 'starter') starterKey = down;
      else if (action === 'ignition') { if (down) ignition = !ignition; }
      else if (action !== 'reset') {
        if (down) held.add(code); else held.delete(code);
      }
      return true;
    },
    setPointer(channel, v) {
      if (v === null) { pointer[channel] = null; return; }
      const [lo, hi] = RANGE[channel];
      pointer[channel] = clamp(Number.isFinite(v) ? v : 0, lo, hi);
      value[channel] = pointer[channel];
    },
    setStarter(down) { starterButton = down; },
    toggleIgnition() { ignition = !ignition; },
    releaseAll() {
      held.clear();
      starterKey = false;
      starterButton = false;
      for (const ch of Object.keys(pointer) as Analog[]) pointer[ch] = null;
    },
    seed,
    reset() { seed({ ...NEUTRAL_INPUTS, ignition: true }); },
    update,
    inputs,
    source: () => { update(PARAMS.dt); return inputs(); },
  };
}

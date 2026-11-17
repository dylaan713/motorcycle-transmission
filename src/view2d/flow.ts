import { gearKind } from '../model/geometry';
import type { GearNo, PartId } from '../model/parts';
import type { TorquePath } from '../model/torquePath';
import type { SimState } from '../sim/types';
import { COLORS } from '../tokens';
import {
  AXIS_Y, CHAIN_PTS, CRANK, CRANK_Y, DRIVEN_R, GEAR_OF, I_PLATE0, IN_Y, INSET, MM, OUT_Y, PLATE_COUNT, PRIMARY_X,
  SLIDER_OF, SLIDERS, SPROCKET_X, gearIndex, gearX, sliderShift, type PartShape,
} from './layout';
import { DASH, NO_DASH, type Painter } from './paint';

const SLIDER_C = SLIDER_OF.C;

const MAX_FLOW = 48;

/** N·m at which the torque drawing reaches full strength. */
export const TORQUE_FULL = 150;
/** Opacity of the torque fill at the smallest torque shown, so low torque still reads as orange. */
export const HOT_ALPHA_FLOOR = 0.55;
/** Width of the torque line, CSS px, from the smallest torque shown to TORQUE_FULL and above. */
export const FLOW_WIDTH = [2.5, 5] as const;

const amount = (torque: number): number => Math.min(1, Math.abs(torque) / TORQUE_FULL);
/** Opacity of the orange fill on a part carrying `torque`. */
export const hotAlpha = (torque: number): number => HOT_ALPHA_FLOOR + (1 - HOT_ALPHA_FLOOR) * amount(torque);
/** Width of the torque line for `torque`: its magnitude is carried in the width, not the colour. */
export const flowWidth = (torque: number): number => FLOW_WIDTH[0] + (FLOW_WIDTH[1] - FLOW_WIDTH[0]) * amount(torque);

/**
 * The parts to fill as carrying torque: the path's parts, and the 3rd/4th sliding piece whole
 * whenever it drives (in 5th or 6th either half listed means both, since they are one rigid piece).
 */
export function torqueCarriers(path: TorquePath, state: SimState, out: Set<PartId>): void {
  out.clear();
  for (const id of path.parts) out.add(id);
  const cDrives = state.lockedGear === SLIDER_C.neg.free || state.lockedGear === SLIDER_C.pos.free;
  if (cDrives && (out.has('gear3in') || out.has('gear4in'))) { out.add('gear3in'); out.add('gear4in'); }
}

/**
 * The torque line: a polyline through the parts of the torque path in order. Shafts are followed
 * along their axis, the clutch through the upper half of its section, and a locked gear through
 * its slider's body and the engaged dogs.
 */
export interface Flow {
  build(state: SimState, path: TorquePath, shapes: readonly PartShape[]): void;
  draw(p: Painter, path: TorquePath): void;
  /** The line's points as x, y pairs, model metres (a copy, for tests). */
  points(): number[];
}

export function createFlow(): Flow {
  const flow = new Float64Array(MAX_FLOW * 2);
  let n = 0;

  function push(x: number, y: number): void {
    if (n > 0 && Math.abs(flow[2 * n - 2] - x) < 1e-6 && Math.abs(flow[2 * n - 1] - y) < 1e-6) return;
    if (n >= MAX_FLOW) return;
    flow[2 * n] = x; flow[2 * n + 1] = y; n++;
  }
  /** The slider body and the dogs between its face and the gear it has locked, on the shaft axis. */
  function pushDog(shapes: readonly PartShape[], state: SimState, g: GearNo): void {
    for (const s of SLIDERS) {
      for (const sideName of ['neg', 'pos'] as const) {
        const side = s[sideName];
        if (side.free !== g) continue;
        const face = shapes[gearIndex(s.shaft, side.face)], gear = shapes[gearIndex(s.shaft, side.free)];
        const fx = side.dir < 0 ? face.x : face.x + face.w, gx = side.dir < 0 ? gear.x + gear.w : gear.x;
        const body = s.restX + sliderShift(state, s.id);
        // on the axis: the line runs through the slider body and the engaged dogs
        if (s.shaft === 'output') { push((fx + gx) / 2, OUT_Y); push(body, OUT_Y); } else { push(body, IN_Y); push((fx + gx) / 2, IN_Y); }
      }
    }
  }

  return {
    build(state, path, shapes) {
      n = 0;
      const plates = shapes[I_PLATE0 + Math.floor(PLATE_COUNT / 2)];
      const stackX = plates.x + plates.w / 2;
      const parts = path.parts;
      for (let i = 0; i < parts.length; i++) {
        const id = parts[i];
        const next = parts[i + 1];
        switch (id) {
          case 'crank': push((CRANK.journal.x[0] + CRANK.stub.x[1]) / 2, CRANK_Y); break;
          case 'primaryDrive': push((PRIMARY_X[0] + PRIMARY_X[1]) / 2, CRANK_Y); break;
          case 'clutchBasket': push((PRIMARY_X[0] + PRIMARY_X[1]) / 2, -DRIVEN_R + 10 * MM); break;
          case 'frictionPlates': push(stackX, -DRIVEN_R + 10 * MM); break;
          case 'steelPlates': push(stackX, -40 * MM); break;
          case 'clutchHub': push(stackX, -22 * MM); break;
          case 'inputShaft': {
            push(stackX, IN_Y);
            if (next === undefined) push(0, IN_Y);
            break;
          }
          case 'outputShaft': break; // the line runs along its axis from the gear to the sprocket
          case 'sprocket': push((SPROCKET_X[0] + SPROCKET_X[1]) / 2, OUT_Y); break;
          case 'chain':
            // the loaded strand: the top one under drive, the bottom one when the wheel drives the engine
            if (path.torque < 0) { push(CHAIN_PTS.frontBottom.x, CHAIN_PTS.frontBottom.y); push(CHAIN_PTS.rearBottom.x, CHAIN_PTS.rearBottom.y); }
            else { push(CHAIN_PTS.frontTop.x, CHAIN_PTS.frontTop.y); push(CHAIN_PTS.rearTop.x, CHAIN_PTS.rearTop.y); }
            break;
          case 'rearSprocket': push(INSET.rear.x, INSET.rear.y); break;
          case 'rearWheel': push(INSET.rear.x, INSET.rear.y + INSET.wheel.r); break;
          default: {
            const gearOf = GEAR_OF[id];
            if (!gearOf) break;
            const { g, shaft } = gearOf;
            const kind = gearKind(shaft, g);
            // a slider that only locks the pair is on the line already: pushDog runs through its body
            if (kind === 'slider' && g !== state.lockedGear) break;
            const free = kind === 'free';
            // a free input gear takes its drive from the slider's dogs; a free output gear gives it to them
            if (shaft === 'input' && free) pushDog(shapes, state, g);
            push(gearX(state, shaft, g), AXIS_Y[shaft]);
            if (shaft === 'output' && free) pushDog(shapes, state, g);
          }
        }
      }
    },
    draw(p, path) {
      if (n < 2) return;
      const ctx = p.ctx;
      const trace = (): void => {
        ctx.beginPath();
        ctx.moveTo(p.X(flow[0]), p.Y(flow[1]));
        for (let i = 1; i < n; i++) ctx.lineTo(p.X(flow[2 * i]), p.Y(flow[2 * i + 1]));
      };
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      // engine braking: dashed, casing and all, so the parts show through the gaps
      ctx.setLineDash(path.torque < 0 ? DASH : NO_DASH);
      const w = flowWidth(path.torque);
      trace(); ctx.strokeStyle = COLORS.ground; ctx.lineWidth = w + 3.5; ctx.stroke();
      trace(); ctx.strokeStyle = COLORS.torque; ctx.lineWidth = w; ctx.stroke();
      ctx.setLineDash(NO_DASH);
      ctx.lineJoin = 'miter'; ctx.lineCap = 'butt';
    },
    points: () => Array.from(flow.subarray(0, 2 * n)),
  };
}

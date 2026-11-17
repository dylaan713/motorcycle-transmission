import type { PartId } from '../model/parts';
import type { TorquePath } from '../model/torquePath';
import type { SimState } from '../sim/types';

/** A drawing of the drivetrain: the 2D schematic and the 3D view. */
export interface View {
  /** True when `resize` draws the last frame again itself; otherwise the host renders after a resize. */
  readonly redrawsOnResize?: boolean;
  render(state: SimState, path: TorquePath): void;
  resize(width: number, height: number, dpr: number): void;
  pick(x: number, y: number): PartId | null; // CSS pixels relative to the view
  setHighlight(part: PartId | null): void;
  /** Arrival: 0 draws nothing, 1 everything; parts appear in torque-path order between. */
  setReveal?(progress: number): void;
  dispose(): void;
}

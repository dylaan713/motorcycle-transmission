import type { PartId } from '../model/parts';
import type { TorquePath } from '../model/torquePath';
import type { SimState } from '../sim/types';

/** A drawing of the drivetrain. The 2D schematic implements it now, the 3D view in stage 3. */
export interface View {
  render(state: SimState, path: TorquePath): void;
  resize(width: number, height: number, dpr: number): void;
  pick(x: number, y: number): PartId | null; // CSS pixels relative to the view
  setHighlight(part: PartId | null): void;
  /** Arrival: 0 draws nothing, 1 everything; parts appear in torque-path order between. */
  setReveal?(progress: number): void;
  dispose(): void;
}

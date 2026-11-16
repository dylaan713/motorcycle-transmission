import type { PartId } from '../model/parts';

/** The part the visitor has selected, shared by the views and the information panel. */
export interface Selection {
  get(): PartId | null;
  set(id: PartId | null): void;
  subscribe(fn: (id: PartId | null) => void): () => void; // returns unsubscribe
}

export function createSelection(): Selection {
  let current: PartId | null = null;
  const listeners = new Set<(id: PartId | null) => void>();
  return {
    get: () => current,
    set(id) {
      if (id === current) return;
      current = id;
      for (const fn of [...listeners]) fn(id);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
  };
}

export const selection: Selection = createSelection();

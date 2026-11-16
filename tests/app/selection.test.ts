import { test, expect } from 'vitest';
import { createSelection } from '../../src/app/selection';

test('notifies on change only, and unsubscribes', () => {
  const sel = createSelection();
  const seen: (string | null)[] = [];
  const off = sel.subscribe((id) => seen.push(id));
  sel.set('gear3in'); sel.set('gear3in'); sel.set(null);
  off(); sel.set('chain');
  expect(seen).toEqual(['gear3in', null]);
  expect(sel.get()).toBe('chain');
});

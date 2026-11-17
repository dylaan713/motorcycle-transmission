import { test, expect } from 'vitest';
import { tabKeyTarget } from '../../src/ui/panel';

const plain = { altKey: false, ctrlKey: false, metaKey: false };

test('arrow keys move between tabs and wrap; Home and End jump to the ends', () => {
  expect(tabKeyTarget({ ...plain, key: 'ArrowRight' }, 5, 0)).toBe(1);
  expect(tabKeyTarget({ ...plain, key: 'ArrowRight' }, 5, 4)).toBe(0);
  expect(tabKeyTarget({ ...plain, key: 'ArrowLeft' }, 5, 0)).toBe(4);
  expect(tabKeyTarget({ ...plain, key: 'ArrowLeft' }, 5, 3)).toBe(2);
  expect(tabKeyTarget({ ...plain, key: 'Home' }, 5, 3)).toBe(0);
  expect(tabKeyTarget({ ...plain, key: 'End' }, 5, 1)).toBe(4);
});
test('other keys, and any key with a browser modifier held, are left alone', () => {
  expect(tabKeyTarget({ ...plain, key: 'ArrowUp' }, 5, 2)).toBeNull();
  expect(tabKeyTarget({ ...plain, key: 'Enter' }, 5, 2)).toBeNull();
  expect(tabKeyTarget({ ...plain, key: 'ArrowLeft', altKey: true }, 5, 2)).toBeNull();
  expect(tabKeyTarget({ ...plain, key: 'ArrowRight', ctrlKey: true }, 5, 2)).toBeNull();
  expect(tabKeyTarget({ ...plain, key: 'Home', metaKey: true }, 5, 2)).toBeNull();
});

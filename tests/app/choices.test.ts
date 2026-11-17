import { expect, test } from 'vitest';
import { createChoice } from '../../src/app/choices';

test('until the visitor chooses, the default follows the width; after, their choice holds across 900 px', () => {
  const labels = createChoice((wide) => wide);
  expect(labels.value(true)).toBe(true);
  expect(labels.value(false)).toBe(false); // crossing below 900 px, untouched: the narrow default
  expect(labels.chosen).toBe(false);
  labels.choose(true); // switched on while narrow
  expect(labels.value(false)).toBe(true);
  expect(labels.value(true)).toBe(true);
  labels.choose(false); // switched off while wide
  expect(labels.value(true)).toBe(false);
  expect(labels.value(false)).toBe(false);
  expect(labels.chosen).toBe(true);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { splitBounds } from '../../src/main/lifecycle/split-bounds.mjs';
import {
  defaultPreferences,
  validatePreferences,
} from '../../src/shared/preferences/preferences.mjs';
test('split bounds preserve every DIP', () => {
  for (const width of [0, 1, 7, 820, 1281, 1920])
    for (const ratio of [0.25, 0.5, 0.75]) {
      const [left, right] = splitBounds({ x: 11, y: 20, width, height: 600 }, ratio);
      assert.equal(right.x + right.width, 11 + width);
      assert.ok(left.width >= 0 && right.width >= 0);
      assert.equal(left.height, right.height);
    }
});
test('split preferences validate and migrate', () => {
  const preferences = defaultPreferences();
  delete preferences.split;
  delete preferences.mutedServices;
  assert.deepEqual(validatePreferences(preferences).split, { secondaryId: null, ratio: 0.5 });
  for (const ratio of [NaN, Infinity, 0, 1, '0.5'])
    assert.throws(() =>
      validatePreferences({ ...defaultPreferences(), split: { secondaryId: null, ratio } }),
    );
  assert.throws(() => validatePreferences({ ...defaultPreferences(), mutedServices: ['x', 'x'] }));
});

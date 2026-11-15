import test from 'node:test';
import assert from 'node:assert/strict';
import { inventory } from '../../scripts/release/supply-chain.mjs';
test('license inventory fails closed', () => {
  assert.throws(() => inventory({ UNKNOWN: [] }, ['MIT']));
  assert.throws(() => inventory({}, ['MIT']));
  assert.throws(() => inventory({ MIT: [{ name: 'bad/name/extra', versions: ['1.0'] }] }, ['MIT']));
});
test('inventory removes local paths', () => {
  const components = inventory(
    { MIT: [{ name: '@scope/pkg', versions: ['1.0.0', '2.0.0'], paths: ['/private/user/path'] }] },
    ['MIT'],
  );
  assert.equal(components.length, 2);
  assert.equal(components[0].purl, 'pkg:npm/%40scope/pkg@1.0.0');
  assert.ok(!JSON.stringify(components).includes('/private'));
});

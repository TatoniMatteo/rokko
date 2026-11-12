import test from 'node:test';
import assert from 'node:assert/strict';
import { loadError } from '../../src/shared/apps/load-errors.mjs';
test('actionable load errors', () => {
  for (const [code,title] of [[-106,'You appear to be offline'],[-105,'Website not found'],[-118,'The website took too long'],
    [-202,'Secure connection failed'],['blocked','Navigation blocked'],[-2,'Could not load this application']]) {
    const error=loadError(code);assert.equal(error.title,title);assert.ok(error.message.length>20);
    assert.ok(!error.message.includes('disable'));
  }
});

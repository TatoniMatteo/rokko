import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHttpsUrl, validTitle, validBounds } from '../../src/shared/security/validation.mjs';

test('normalizes HTTPS URLs', () => {
  assert.equal(normalizeHttpsUrl('github.com'), 'https://github.com/');
  assert.equal(normalizeHttpsUrl(' https://example.com/a '), 'https://example.com/a');
});
test('rejects privileged and non HTTPS URLs', () => {
  for (const value of ['file:///etc/passwd', 'javascript:alert(1)', 'http://example.com',
    'https://bob:secret@example.com', 'data:text/html,x', 'localhost:3000', '']) {
    assert.throws(() => normalizeHttpsUrl(value), undefined, value);
  }
});
test('validates names and view bounds', () => {
  assert.equal(validTitle('  Work  '), 'Work');
  assert.throws(() => validTitle(' '.repeat(10)));
  assert.equal(validBounds({ x: 200, y: 40, width: 600, height: 400 }, 1200, 900), true);
  assert.equal(validBounds({ x: -1, y: 0, width: 20, height: 20 }, 1200, 900), false);
  assert.equal(validBounds({ x: 0, y: 0, width: 5000, height: 20 }, 1200, 900), false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { persistentRequest } from '../src/shared/persistent-notifications.mjs';
const origin = 'https://example.com';
const show = { action: 'show', scope: origin + '/worker/', title: 'Message', data: '{"id":1}' };
test('notification payload boundaries', () => {
  assert.deepEqual(persistentRequest(show, origin), { ...show, body: '', tag: '', silent: false, requireInteraction: false });
  for (const input of [null, { ...show, action: 'openExternal' }, { ...show, scope: 'https://other.example/' },
    { ...show, scope: 'file:///tmp/worker' }, { ...show, title: 'x'.repeat(257) }, { ...show, body: 'x'.repeat(4097) },
    { ...show, data: '{' }, { ...show, data: 'x'.repeat(16385) }, { ...show, silent: 'yes' }]) {
    assert.throws(() => persistentRequest(input, origin));
  }
});
test('notification list and close', () => {
  assert.deepEqual(persistentRequest({ action: 'list', scope: show.scope, tag: 'chat' }, origin),
    { action: 'list', scope: show.scope, tag: 'chat' });
  assert.equal(persistentRequest({ action: 'close', scope: show.scope, id: 'one' }, origin).id, 'one');
  assert.throws(() => persistentRequest({ action: 'close', scope: show.scope }, origin));
});

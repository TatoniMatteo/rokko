import test from 'node:test';
import assert from 'node:assert/strict';
import { notificationOrigin, validNotificationGrant, notificationAllowed } from '../../src/shared/notifications/notifications.mjs';
import { appInput, updateApp } from '../../src/shared/apps/registry.mjs';
const service = { id: 'a', url: 'https://example.com/path', notificationOrigin: 'https://example.com' };

test('notification origin scope', () => {
  assert.equal(notificationAllowed(service, 'notifications', 'https://example.com/worker'), true);
  for (const source of ['https://other.example/', 'http://example.com/', 'file:///etc/passwd', '', null]) {
    assert.equal(notificationAllowed(service, 'notifications', source), false);
  }
  for (const permission of ['media', 'geolocation', 'display-capture', 'midi', 'unknown']) {
    assert.equal(notificationAllowed(service, permission, service.url), false);
  }
  assert.equal(notificationAllowed({ ...service, notificationOrigin: undefined }, 'notifications', service.url), false);
  assert.equal(notificationAllowed(undefined, 'notifications', service.url), false);
  assert.equal(notificationOrigin('not a url'), null);
});

test('explicit grant and revocation', () => {
  assert.equal(validNotificationGrant(undefined, service.url), undefined);
  assert.equal(validNotificationGrant(null, service.url), undefined);
  assert.equal(validNotificationGrant(service.notificationOrigin, service.url), service.notificationOrigin);
  assert.throws(() => validNotificationGrant(true, service.url));
  assert.throws(() => validNotificationGrant('https://other.example', service.url));
  const data = { selectedWorkspaceId: 'w', workspaces: [{ id: 'w', name: 'W' }], apps: [{ ...service, workspaceId: 'w', partition: 'persist:rokko-a' }] };
  assert.equal(appInput(data, { name: 'A', url: service.url }).notificationOrigin, undefined);
  const revoked = updateApp(data, 'a', { name: 'A', url: service.url, notificationOrigin: null });
  assert.equal(revoked.apps[0].notificationOrigin, undefined);
  assert.equal(revoked.apps[0].partition, 'persist:rokko-a');
  assert.throws(() => updateApp(data, 'a', { name: 'A', url: 'https://other.example/', notificationOrigin: service.notificationOrigin }));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRamboxMetadata, planRamboxImport, importUrl } from '../../src/shared/import/rambox.mjs';
import { readMetadata } from '../../src/main/import/rambox-mcp.mjs';
const metadata = () => ({ format: 'rokko-rambox-metadata', version: 1, source: { adapter: 'mcp-list-apps' },
  services: [{ id: 'source-one', name: 'Team', url: 'https://chat.example/' },
    { id: 'source-two', name: 'Other account', url: 'https://chat.example/' }], workspaces: [] });
const state = () => ({ version: 1, selectedWorkspaceId: 'personal', workspaces: [{ id: 'personal', name: 'Personal' }],
  apps: [{ id: 'old', name: 'Original', url: 'https://old.example/', workspaceId: 'personal', partition: 'persist:rokko-old' }] });
const ids = () => { let i = 0; return () => `new-${++i}`; };

test('metadata whitelist', () => {
  const input = metadata();
  input.services[0].cookies = 'never'; input.services[0].notificationOrigin = 'https://chat.example';
  const rows = parseRamboxMetadata(input);
  assert.deepEqual(rows[0], { sourceId: 'source-one', name: 'Team', url: 'https://chat.example/' });
  assert.equal(rows.length, 2);
  assert.ok(!JSON.stringify(rows).includes('never'));
  for (const bad of [null, [], { ...input, version: 2 }, { ...input, workspaces: [{ id: 'guess' }] },
    { ...input, services: [input.services[0], input.services[0]] }]) assert.throws(() => parseRamboxMetadata(bad));
});
test('unsafe URLs need review', () => {
  for (const url of ['file:///etc/passwd', 'https://user:pass@example.com/', 'https://example.com/?api_key=secret',
    'https://example.com/#access_token=secret', 'http://127.0.0.1/', 'https://example.com/?sessionId=secret']) {
    assert.throws(() => importUrl(url));
    const input = metadata(); input.services[0].url = url;
    assert.equal(parseRamboxMetadata(input)[0].url, '');
  }
});
test('independent accounts and destinations', () => {
  const original = state(); const before = structuredClone(original);
  const input = { newWorkspaceName: 'Rambox', services: [
    { name: 'Team', url: 'https://chat.example/', workspaceId: null, partition: 'persist:source', notificationOrigin: 'https://chat.example' },
    { name: 'Other', url: 'https://chat.example/', workspaceId: 'personal' }] };
  const next = planRamboxImport(original, input, ids());
  assert.deepEqual(original, before);
  assert.equal(next.workspaces[1].name, 'Rambox');
  assert.equal(next.apps[1].workspaceId, next.workspaces[1].id);
  assert.equal(next.apps[2].workspaceId, 'personal');
  assert.equal(next.apps[1].url, next.apps[2].url);
  assert.notEqual(next.apps[1].partition, next.apps[2].partition);
  assert.notEqual(next.apps[1].partition, 'persist:source');
  assert.equal(next.apps[1].notificationOrigin, undefined);
  assert.deepEqual(next.apps[0], before.apps[0]);
});
test('invalid batch changes nothing', () => {
  const original = state(); const before = structuredClone(original);
  const valid = { name: 'Good', url: 'https://app.example/', workspaceId: 'personal' };
  for (const bad of [{ ...valid, url: 'javascript:alert(1)' }, { ...valid, name: '' },
    { ...valid, workspaceId: '' }, { ...valid, workspaceId: 'missing' }, null]) {
    assert.throws(() => planRamboxImport(original, { services: [valid, bad] }, ids()));
    assert.deepEqual(original, before);
  }
  assert.throws(() => planRamboxImport(original, { services: [{ ...valid, workspaceId: null }] }, ids()));
  assert.throws(() => planRamboxImport(original, { services: [] }, ids()));
  assert.throws(() => planRamboxImport(original, { services: Array(100).fill(valid) }, ids()));
  assert.throws(() => planRamboxImport(original, { newWorkspaceName: 'Personal', services: [{ ...valid, workspaceId: null }] }, ids()));
});
test('local MCP transport guards', async () => {
  let requests = 0; const fetcher = () => { requests++; throw new Error('Should not connect'); };
  for (const endpoint of ['https://127.0.0.1:7822/mcp', 'http://example.com/mcp',
    'http://127.0.0.1:7822/mcp?token=bad', 'http://user:pass@127.0.0.1:7822/mcp']) {
    await assert.rejects(readMetadata({ endpoint, token: 'temporary', fetcher }));
  }
  await assert.rejects(readMetadata({ endpoint: 'http://127.0.0.1:7822/mcp', token: 'x'.repeat(1025), fetcher }));
  assert.equal(requests, 0);
});

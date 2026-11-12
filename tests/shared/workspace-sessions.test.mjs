import test from 'node:test';
import assert from 'node:assert/strict';
import { appInput, updateApp, removeWorkspace } from '../../src/shared/apps/registry.mjs';
import { workspacePartition, sharesWorkspace, visibleApps } from '../../src/shared/apps/sessions.mjs';
import { planRamboxImport } from '../../src/shared/import/rambox.mjs';
import { shortcutTarget } from '../../src/main/navigation/shortcuts.mjs';
const state = () => ({ version: 1, selectedWorkspaceId: 'a', workspaces: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], apps: [
  { id: 'one', name: 'One', url: 'https://one.example/', workspaceId: 'a', partition: 'persist:rokko-one' },
  { id: 'global', name: 'Global', url: 'https://global.example/', workspaceId: null, partition: 'persist:rokko-global' },
  { id: 'two', name: 'Two', url: 'https://two.example/', workspaceId: 'b', partition: 'persist:rokko-two' }] });
test('global services stay visible', () => {
  const data = state();
  assert.deepEqual(visibleApps(data).map(a => a.id), ['global', 'one']);
  data.selectedWorkspaceId = 'b';
  assert.deepEqual(visibleApps(data).map(a => a.id), ['global', 'two']);
  assert.equal(appInput(data, { name: 'All', url: 'https://all.example', workspaceId: null }).workspaceId, null);
  assert.throws(() => appInput(data, { name: 'All', url: 'https://all.example', workspaceId: null, shareWorkspaceSession: true }));
});
test('workspace sharing is explicit', () => {
  const data = state();const before = structuredClone(data);
  assert.equal(updateApp(data, 'one', { name: 'One', url: 'https://one.example/', workspaceId: 'b' }).apps.at(-1).partition, 'persist:rokko-one');
  const next = updateApp(data, 'one', { name: 'One', url: 'https://one.example/', workspaceId: 'a', shareWorkspaceSession: true });
  const shared = next.apps.find(a => a.id === 'one');
  assert.ok(sharesWorkspace(shared));assert.equal(shared.partition, workspacePartition('a'));
  const moved = updateApp(next, 'one', { name: 'One', url: shared.url, workspaceId: 'b' }).apps.find(a => a.id === 'one');
  assert.equal(moved.partition, workspacePartition('b'));
  const global = updateApp(next, 'one', { name: 'One', url: shared.url, workspaceId: null, shareWorkspaceSession: false }).apps.at(-1);
  assert.equal(global.partition, 'persist:rokko-one');assert.equal(global.workspaceId, null);
  assert.deepEqual(data, before);
  assert.throws(() => appInput(data, { name: 'One', url: shared.url, shareWorkspaceSession: 'yes' }));
});
test('workspace removal preserves globals', () => {
  const data = state();data.apps[0].partition = workspacePartition('a');
  const next = removeWorkspace(data, 'a', 'b');
  assert.equal(next.apps.find(a => a.id === 'one').partition, workspacePartition('b'));
  assert.deepEqual(next.apps.find(a => a.id === 'global'), data.apps[1]);
});
test('global shortcuts follow sidebar order', () => {
  const data = state();
  assert.equal(shortcutTarget(data, 'one', { type: 'keyDown', key: '1', alt: true }).appId, 'global');
  assert.equal(shortcutTarget(data, 'global', { type: 'keyDown', key: 'PageDown', alt: true }).appId, 'global');
  assert.equal(shortcutTarget(data, 'global', { type: 'keyDown', key: 'Tab', control: true }).appId, 'one');
});
test('import can choose global services', () => {
  let id = 0;const data = state();
  const next = planRamboxImport(data, { services: [{ name: 'New global', url: 'https://new.example/', workspaceId: null, global: true }] }, () => `new-${++id}`);
  assert.equal(next.apps.at(-1).workspaceId, null);assert.equal(next.selectedWorkspaceId, 'a');
  assert.equal(next.workspaces.length, 2);
});

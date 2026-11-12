import test from 'node:test';
import assert from 'node:assert/strict';
import { appInput, updateApp, renameWorkspace, removeWorkspace, reorderApp } from '../../src/shared/apps/registry.mjs';

const state = () => ({ version: 1, selectedWorkspaceId: 'a',
  workspaces: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], apps: [
    { id: '1', name: 'One', url: 'https://one.example/', workspaceId: 'a', partition: 'persist:rokko-1' },
    { id: '2', name: 'Two', url: 'https://two.example/', workspaceId: 'b', partition: 'persist:rokko-2' },
    { id: '3', name: 'Three', url: 'https://three.example/', workspaceId: 'a', partition: 'persist:rokko-3' }
  ] });

test('edit and move app', () => {
  const original = state();
  const updated = updateApp(original, '1', { name: 'Work', url: 'new.example', workspaceId: 'b' });
  const app = updated.apps.find(item => item.id === '1');
  assert.equal(app.url, 'https://new.example/');
  assert.equal(app.partition, 'persist:rokko-1');
  assert.deepEqual(updated.apps.filter(item => item.workspaceId === 'b').map(item => item.id), ['2', '1']);
  assert.equal(original.apps[0].name, 'One');
  assert.throws(() => updateApp(original, 'missing', {}));
  assert.throws(() => appInput(original, { name: 'X', url: 'file:///etc/passwd' }));
  assert.throws(() => appInput(original, { name: 'X', url: 'https://example.com', workspaceId: 'missing' }));
});

test('workspace transfer', () => {
  assert.equal(renameWorkspace(state(), 'a', ' New ').workspaces[0].name, 'New');
  const transferred = removeWorkspace(state(), 'a', 'b');
  assert.equal(transferred.selectedWorkspaceId, 'b');
  assert.equal(transferred.apps.length, 3);
  assert.ok(transferred.apps.every(item => item.workspaceId === 'b'));
  assert.deepEqual(transferred.apps.map(item => item.partition), ['persist:rokko-2', 'persist:rokko-1', 'persist:rokko-3']);
  assert.throws(() => removeWorkspace(state(), 'a', 'a'));
  assert.throws(() => removeWorkspace(state(), 'a', 'missing'));
  assert.throws(() => removeWorkspace(transferred, 'b', 'a'));
  assert.throws(() => renameWorkspace(state(), 'missing', 'X'));
  assert.throws(() => renameWorkspace(state(), 'a', ''));
});

test('workspace-local ordering', () => {
  const reordered = reorderApp(state(), '3', -1);
  assert.deepEqual(reordered.apps.map(item => item.id), ['3', '2', '1']);
  assert.equal(reordered.apps[1].workspaceId, 'b');
  assert.deepEqual(reorderApp(reordered, '3', 1), state());
  assert.deepEqual(reorderApp(state(), '1', -1), state());
  assert.throws(() => reorderApp(state(), '1', 0));
  assert.throws(() => reorderApp(state(), 'missing', 1));
});

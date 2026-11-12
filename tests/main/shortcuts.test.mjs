import test from 'node:test';
import assert from 'node:assert/strict';
import { shortcutTarget } from '../../src/main/navigation/shortcuts.mjs';
const data = { selectedWorkspaceId: 'work', workspaces: [{ id: 'work' }, { id: 'personal' }, { id: 'empty' }],
  apps: [{ id: 'one', workspaceId: 'work' }, { id: 'other', workspaceId: 'personal' },
    { id: 'two', workspaceId: 'work' }] };
const input = (key, modifiers = {}) => ({ type: 'keyDown', key, ...modifiers });
test('cycle current workspace', () => {
  const forward = input('Tab', { control: true });
  const backward = input('Tab', { control: true, shift: true });
  assert.deepEqual(shortcutTarget(data, 'one', forward), { appId: 'two', workspaceId: 'work' });
  assert.deepEqual(shortcutTarget(data, 'two', forward), { appId: 'one', workspaceId: 'work' });
  assert.deepEqual(shortcutTarget(data, 'one', backward), { appId: 'two', workspaceId: 'work' });
  assert.equal(shortcutTarget(data, null, backward).appId, 'two');
  assert.equal(shortcutTarget(data, null, forward).appId, 'one');
});
test('numbered application', () => {
  assert.equal(shortcutTarget(data, 'one', input('2', { alt: true })).appId, 'two');
  assert.equal(shortcutTarget(data, 'one', input('9', { alt: true })), null);
  assert.equal(shortcutTarget(data, 'one', input('1', { alt: true })), null);
});
test('workspace and home', () => {
  assert.deepEqual(shortcutTarget(data, 'one', input('PageDown', { alt: true })), { appId: null, workspaceId: 'personal' });
  assert.deepEqual(shortcutTarget(data, 'one', input('PageUp', { alt: true })), { appId: null, workspaceId: 'empty' });
  assert.deepEqual(shortcutTarget(data, 'one', input('Home', { alt: true })), { appId: null, workspaceId: 'work' });
  const empty = { ...data, selectedWorkspaceId: 'empty' };
  assert.equal(shortcutTarget(empty, null, input('Tab', { control: true })), null);
});
test('leave page shortcuts alone', () => {
  for (const event of [input('Tab'), input('c', { control: true }), input('w', { control: true }),
    input('k', { control: true }), input('1', { control: true, alt: true }), input('Tab', { control: true, meta: true }),
    input('2', { alt: true, shift: true }), input('Home', { control: true }),
    { ...input('Tab', { control: true }), type: 'keyUp' }]) assert.equal(shortcutTarget(data, 'one', event), null);
});
test('preserve forms and IME', () => {
  const event = input('Tab', { control: true });
  assert.equal(shortcutTarget(data, 'one', event, true), null);
  assert.equal(shortcutTarget(data, 'one', { ...event, isComposing: true }), null);
  assert.equal(shortcutTarget(data, 'one', { ...event, isAutoRepeat: true }), null);
  const single = { selectedWorkspaceId: 'work', workspaces: [{ id: 'work' }], apps: [data.apps[0]] };
  assert.equal(shortcutTarget(single, 'one', event), null);
  assert.equal(shortcutTarget(single, 'one', input('PageDown', { alt: true })), null);
});

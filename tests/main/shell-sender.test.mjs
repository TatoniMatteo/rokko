import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isShellSender } from '../../src/main/security/shell-sender.mjs';

test('shell frame only', () => {
  const mainFrame = {};
  const shell = { mainFrame, isDestroyed: () => false };
  assert.equal(isShellSender({sender:shell, senderFrame:mainFrame},shell),true);
  assert.equal(isShellSender({sender:shell, senderFrame:{}},shell),false);
  assert.equal(isShellSender({sender:{}, senderFrame:mainFrame},shell),false);
  assert.equal(isShellSender({sender:shell, senderFrame:null},shell),false);
  assert.equal(isShellSender({sender:shell, senderFrame:mainFrame},null),false);
  shell.isDestroyed = () => true;
  assert.equal(isShellSender({sender:shell, senderFrame:mainFrame},shell),false);
});

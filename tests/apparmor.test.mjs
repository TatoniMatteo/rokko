import test from 'node:test';
import assert from 'node:assert/strict';
import { profileForExecutable, profileName } from '../scripts/linux/apparmor.mjs';

test('AppArmor profile grants userns only to requested executable', () => {
  const binary = '/home/test/rokko/node_modules/electron/dist/electron';
  const policy = profileForExecutable(binary);
  assert.match(policy, /userns,/);
  assert.match(policy, /flags=\(unconfined\)/);
  assert.ok(policy.includes(`"${binary}"`));
  assert.ok(!policy.includes('no-sandbox'));
  assert.equal(profileName(binary), profileName(binary));
  assert.notEqual(profileName(binary), profileName('/other/electron'));
});

test('AppArmor policy refuses unsafe executable paths', () => {
  assert.throws(() => profileForExecutable('/tmp/electron\" {\n  capability sys_admin,'));
  assert.throws(() => profileForExecutable('relative/electron'));
});

test('AppArmor profile uses real lines', () => {
  const policy = profileForExecutable('/home/test/rokko/electron');
  assert.ok(policy.includes('\n  userns,\n}\n'));
  assert.ok(!policy.includes('\\n'));
});

test('AppArmor accepts ordinary paths', () => {
  assert.doesNotThrow(() => profileForExecutable('/home/matato/Projects/Personale/rokko/electron'));
});

test('AppArmor rejects control characters and patterns', () => {
  for (const character of ['\r', '\n', '\0', '"', '\\', '{', '}', '*', '?', '[', ']']) {
    assert.throws(() => profileForExecutable(`/tmp/elect${character}on`));
  }
});

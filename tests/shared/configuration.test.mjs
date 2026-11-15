import test from 'node:test';
import assert from 'node:assert/strict';
import {
  exportConfiguration,
  validateConfiguration,
  planConfigurationImport,
} from '../../src/shared/import/configuration.mjs';
import { emptyProfile } from '../../src/main/storage/profile-state.mjs';
const options = { duplicates: 'skip', appearance: false };
const fixture = () => {
  const profile = emptyProfile();
  profile.data.apps = [
    {
      id: 'one',
      name: 'Mail',
      url: 'https://example.com/',
      workspaceId: 'personal',
      partition: 'persist:rokko-workspace-personal',
      notificationOrigin: 'https://example.com',
    },
    {
      id: 'two',
      name: 'Global',
      url: 'https://example.org/',
      workspaceId: null,
      partition: 'persist:rokko-two',
    },
  ];
  return profile;
};
test('portable configuration excludes sessions', () => {
  const p = fixture(),
    exported = exportConfiguration(p.data, p.preferences);
  assert.ok(!JSON.stringify(exported).includes('partition'));
  assert.ok(!JSON.stringify(exported).includes('notificationOrigin'));
  let id = 0;
  const imported = planConfigurationImport(
    emptyProfile().data,
    p.preferences,
    exported,
    options,
    () => `new-${++id}`,
  );
  assert.equal(imported.added, 2);
  assert.equal(imported.data.apps[0].workspaceId, 'personal');
  assert.notEqual(imported.data.apps[1].partition, p.data.apps[1].partition);
  assert.equal(imported.data.apps[1].workspaceId, null);
  assert.equal(imported.data.apps[0].notificationOrigin, undefined);
  const twice = planConfigurationImport(
    imported.data,
    p.preferences,
    exported,
    options,
    () => `new-${++id}`,
  );
  assert.equal(twice.added, 0);
  assert.equal(twice.skipped, 2);
  assert.equal(
    planConfigurationImport(
      twice.data,
      p.preferences,
      exported,
      { ...options, duplicates: 'copy' },
      () => `new-${++id}`,
    ).added,
    2,
  );
});
test('configuration rejects secrets and future formats', () => {
  const p = fixture(),
    file = exportConfiguration(p.data, p.preferences);
  for (const change of [
    (d) => (d.version = 2),
    (d) => (d.cookie = 'secret'),
    (d) => (d.services[0].partition = 'persist:foreign'),
    (d) => (d.services[0].url = 'https://example.com/?token=secret'),
    (d) => (d.services[0].workspaceKey = 'missing'),
    (d) => (d.services[1].shared = true),
  ]) {
    const invalid = structuredClone(file);
    change(invalid);
    assert.throws(() => validateConfiguration(invalid));
  }
  const before = structuredClone(p);
  assert.throws(() =>
    planConfigurationImport(p.data, p.preferences, file, { duplicates: 'replace' }, () => 'new'),
  );
  assert.deepEqual(p, before);
});
test('duplicate accounts survive import', () => {
  const p = fixture();
  p.data.apps.push({ ...p.data.apps[0], id: 'another' });
  const file = exportConfiguration(p.data, p.preferences);
  let n = 0;
  const imported = planConfigurationImport(
    emptyProfile().data,
    p.preferences,
    file,
    options,
    () => `new-${++n}`,
  );
  assert.equal(imported.added, 3);
  const twice = planConfigurationImport(
    imported.data,
    p.preferences,
    file,
    options,
    () => `new-${++n}`,
  );
  assert.equal(twice.skipped, 3);
});

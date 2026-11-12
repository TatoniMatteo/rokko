import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { artifactNames, describeArtifact, writeManifest, verifyManifest } from '../../scripts/release/artifacts.mjs';

test('artifact targets', () => {
  assert.deepEqual(artifactNames('0.1.0-alpha.3', 'arm64'),
    ['rokko-0.1.0-alpha.3-linux-arm64.AppImage', 'rokko-0.1.0-alpha.3-linux-arm64.deb']);
  for (const args of [['../bad', 'x64'], ['1.0.0', 'ia32'], ['1.0.0', 'x64', ['zip']],
    ['1.0.0', 'x64', ['deb', 'deb']]]) assert.throws(() => artifactNames(...args));
});

test('artifact integrity', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'rokko-artifacts-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const names = artifactNames('1.0.0', 'x64');
  await Promise.all(names.map(name => writeFile(join(directory, name), `package ${name}`)));
  const metadata = { version: '1.0.0', arch: 'x64', targets: ['AppImage', 'deb'] };
  await writeManifest(directory, metadata, names);
  assert.equal((await verifyManifest(directory)).artifacts.length, 2);
  await writeFile(join(directory, 'stale.deb'), 'old package');
  await assert.rejects(() => verifyManifest(directory), /Unexpected packages/);
  await rm(join(directory, 'stale.deb'));
  await writeFile(join(directory, names[0]), 'changed');
  await assert.rejects(() => verifyManifest(directory), /integrity/);
  await writeManifest(directory, metadata, names);
  await writeFile(join(directory, 'SHA256SUMS.txt'), 'incorrect');
  await assert.rejects(() => verifyManifest(directory), /Checksum/);
  await writeManifest(directory, metadata, names);
  const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
  manifest.artifacts.pop();
  await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest));
  await assert.rejects(() => verifyManifest(directory), /artifact set/);
});

test('missing and unsafe artifacts', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'rokko-artifacts-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await assert.rejects(() => describeArtifact(directory, '../secret'), /Invalid/);
  await assert.rejects(() => describeArtifact(directory, 'missing'));
  await writeFile(join(directory, 'empty'), '');
  await assert.rejects(() => describeArtifact(directory, 'empty'), /empty/);
  await writeFile(join(directory, 'original'), 'contents');
  await symlink('original', join(directory, 'linked'));
  await assert.rejects(() => describeArtifact(directory, 'linked'), /empty/);
});

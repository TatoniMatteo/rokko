import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { appImageOffset } from '../scripts/release/inspect-appimage.mjs';

test('AppImage header validation', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'rokko-header-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'fixture.AppImage');
  const header = Buffer.alloc(512);
  await writeFile(file, header);
  await assert.rejects(() => appImageOffset(file, 'x64'), /not ELF/);
  header.write('\x7fELF');
  header[4] = 2; header[5] = 1;
  header.writeUInt16LE(62, 18);
  await writeFile(file, header);
  await assert.rejects(() => appImageOffset(file, 'x64'), /No supported SquashFS/);
  header.write('hsqs', 64); // A magic string without a valid filesystem header is ignored.
  header.write('hsqs', 160);
  header.writeUInt16LE(4, 188);
  await writeFile(file, header);
  assert.equal(await appImageOffset(file, 'x64'), 160);
  await assert.rejects(() => appImageOffset(file, 'arm64'), /architecture/);
});

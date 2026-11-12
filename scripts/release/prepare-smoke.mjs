import { spawnSync } from 'node:child_process';
import { mkdir, realpath, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { verifyManifest } from './artifacts.mjs';
import { appImageOffset } from './inspect-appimage.mjs';
import { profileForExecutable } from '../linux/apparmor.mjs';

const { values } = parseArgs({ options: {
  artifacts: { type: 'string' }, output: { type: 'string', default: '.codex/tasks/linux-release/prepared-smoke' }
} });
if (!values.artifacts) throw new Error('Required: --artifacts DIRECTORY');
const directory = resolve(values.artifacts);
const manifest = await verifyManifest(directory);
if (manifest.arch !== process.arch) throw new Error('Package smoke requires a matching native host');
const artifact = manifest.artifacts.find(a => a.name.endsWith('.AppImage')) ?? manifest.artifacts[0];
const output = resolve(values.output);
await mkdir(dirname(output), { recursive: true });
await mkdir(output); // Refuse an existing directory rather than merge stale extracted files.
const payload = join(output, 'package');
const file = join(directory, artifact.name);
const image = artifact.name.endsWith('.AppImage');
const command = image ? 'unsquashfs' : 'dpkg-deb';
const args = image ? ['-no-progress', '-o', String(await appImageOffset(file)), '-d', payload, file]
  : ['--extract', file, payload];
const result = spawnSync(command, args, { stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`Package extraction failed: ${result.status}`);
const binary = await realpath(image ? join(payload, 'rokko') : join(payload, 'opt/Rokko/rokko'));
const executable = image ? join(payload, 'AppRun') : binary;
await writeFile(join(output, 'apparmor-profile'), profileForExecutable(binary));
await writeFile(join(output, 'prepared.json'), `${JSON.stringify({
  artifact: artifact.name, sha256: artifact.sha256, executable, binary,
  scope: 'extracted package; install hooks and desktop integration not tested'
}, null, 2)}\n`);
console.log(`Prepared ${artifact.name}. AppArmor profile generated, not installed or loaded.`);

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { artifactNames, writeManifest, verifyManifest } from './artifacts.mjs';
import { inspectAppImage } from './inspect-appimage.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const targets = process.argv.slice(2);
if (!targets.length) targets.push('AppImage', 'deb');
if (process.platform !== 'linux') throw new Error('Build Linux packages on a Linux runner');
const arch = process.arch;
const names = artifactNames(pkg.version, arch, targets);
if (targets.includes('deb') && (!pkg.homepage || !pkg.author?.name || !pkg.author?.email)) {
  throw new Error('DEB requires reviewed public homepage and author.name/author.email in package.json');
}
function run(binary, args) {
  const result = spawnSync(binary, args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${binary} failed (${result.status ?? result.signal})`);
}
const output = join(root, 'dist', `linux-${arch}`);
run('corepack', ['pnpm', 'exec', 'electron-builder', '--linux', ...targets, `--${arch}`, '--publish', 'never',
  `--config.directories.output=${output}`,
  `--config.artifactName=rokko-${pkg.version}-linux-${arch}.\${ext}`]);
const commit = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
const status = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' });
for (const name of names) {
  if (name.endsWith('.AppImage')) {
    await inspectAppImage(join(output, name), join(root, 'build/linux/AppRun'), pkg.desktopName);
  }
}
const manifest = await writeManifest(output, {
  version: pkg.version, platform: 'linux', arch, targets,
  commit: commit.status === 0 ? commit.stdout.trim() : null,
  dirty: status.status !== 0 || Boolean(status.stdout.trim()),
  builtAt: new Date().toISOString(), node: process.version, electron: pkg.devDependencies.electron,
  packageManager: pkg.packageManager, builder: pkg.devDependencies['electron-builder'],
  lockfileSha256: (await import('node:crypto')).createHash('sha256')
    .update(readFileSync(join(root, 'pnpm-lock.yaml'))).digest('hex')
}, names);
for (const artifact of manifest.artifacts) {
  if (artifact.name.endsWith('.deb')) {
    const control = spawnSync('dpkg-deb', ['--field', join(output, artifact.name), 'Architecture'],
      { encoding: 'utf8' });
    if (control.status !== 0 || control.stdout.trim() !== (arch === 'x64' ? 'amd64' : 'arm64')) {
      throw new Error('DEB architecture does not match the build host');
    }
  }
}
writeFileSync(join(output, 'BUILD-NOTES.txt'),
  'Experimental unsigned artifacts. Checksums verify integrity, not publisher identity.\n' +
  'Native host build only; clean install, upgrade and desktop compatibility require separate validation.\n');
await verifyManifest(output);
console.log(`Artifacts and checksums: ${output}`);

import { spawnSync } from 'node:child_process';
import { chmod, copyFile, mkdir, mkdtemp, readFile, realpath, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appImageOffset } from '../release/inspect-appimage.mjs';
import { profileForExecutable, profileName } from './apparmor.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const output = resolve(root, process.env.ROKKO_PACKAGE_OUTPUT ?? `dist/linux-${process.arch}`);
const manifest = JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8'));
const artifact = manifest.artifacts.find((item) => item.name.endsWith('.AppImage'));

if (manifest.version !== pkg.version || manifest.arch !== process.arch || !artifact) {
  throw new Error('The local AppImage manifest does not match this version and architecture.');
}

const local = join(homedir(), '.local');
const applications = join(local, 'Applications');
const icons = join(local, 'share', 'icons', 'hicolor', '512x512', 'apps');
const applicationsMenu = join(local, 'share', 'applications');
const bin = join(local, 'bin');
const installedImage = join(applications, 'Rokko.AppImage');
const desktopId = 'rokko.desktop';
const iconName = 'rokko';
const startupWmClass = pkg.desktopName.replace(/\.desktop$/, '');
const installedIcon = join(icons, `${iconName}.png`);
const desktopFile = join(applicationsMenu, desktopId);
const legacyDesktopFile = join(applicationsMenu, pkg.desktopName);
const legacyIcon = join(icons, `${pkg.desktopName}.png`);
const updater = join(bin, 'rokko-update');
const launcher = join(bin, 'rokko-launch');
const sourceImage = join(output, artifact.name);
const iconSource = join(root, 'assets', 'brand', 'rokko-dark-icon.png');
const runtimeParent = join(local, 'opt');
const runtime = join(runtimeParent, 'rokko');
const appRun = join(runtime, 'AppRun');
const quote = (value) => "'" + value.replaceAll("'", "'\\''") + "'";

await Promise.all([mkdir(applications, { recursive: true }), mkdir(icons, { recursive: true }),
  mkdir(applicationsMenu, { recursive: true }), mkdir(bin, { recursive: true }),
  mkdir(runtimeParent, { recursive: true })]);

const staging = await mkdtemp(join(runtimeParent, '.rokko-'));
const payload = join(staging, 'payload');
const previous = join(staging, 'previous');
let keepBackup = false;
try {
  const extraction = spawnSync('unsquashfs', [
    '-no-progress', '-o', String(await appImageOffset(sourceImage)), '-d', payload, sourceImage,
  ], { stdio: 'inherit' });
  if (extraction.error) throw extraction.error;
  if (extraction.status !== 0) throw new Error('Unable to extract the local AppImage.');
  const executable = join(await realpath(runtimeParent), 'rokko', 'rokko');
  const profile = profileForExecutable(executable);
  await writeFile(join(payload, 'apparmor-profile'), profile);
  try { await rename(runtime, previous); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  try { await rename(payload, runtime); }
  catch (error) {
    try { await rename(previous, runtime); }
    catch (restoreError) {
      if (restoreError.code !== 'ENOENT') {
        keepBackup = true;
        throw restoreError;
      }
    }
    throw error;
  }
  const policy = '/etc/apparmor.d/' + profileName(executable);
  const restricted = await readFile('/proc/sys/kernel/apparmor_restrict_unprivileged_userns', 'utf8')
    .catch(() => '0');
  if (restricted.trim() === '1' && await readFile(policy, 'utf8').catch(() => '') !== profile) {
    console.log('One-time Ubuntu AppArmor setup is required. Run from an interactive terminal:');
    console.log('sudo install -m 0644 ' + quote(join(runtime, 'apparmor-profile')) + ' ' + quote(policy));
    console.log('sudo apparmor_parser -r ' + quote(policy));
  }
} finally {
  if (!keepBackup) await rm(staging, { recursive: true, force: true });
}

const temporaryImage = `${installedImage}.new`;
await copyFile(sourceImage, temporaryImage);
await chmod(temporaryImage, 0o755);
await rename(temporaryImage, installedImage);
await copyFile(iconSource, installedIcon);
await writeFile(launcher, `#!/bin/sh\nexec ${quote(appRun)} "$@"\n`);
await chmod(launcher, 0o755);
await writeFile(desktopFile, `[Desktop Entry]\nType=Application\nName=Rokko\nComment=Le tue applicazioni web. Uno spazio tutto tuo.\nExec=${launcher} %U\nTryExec=${launcher}\nIcon=${iconName}\nTerminal=false\nCategories=Network;\nStartupWMClass=${startupWmClass}\n`);
await chmod(desktopFile, 0o755);
const updateScript = join(root, 'scripts', 'linux', 'update-installed.sh');
await writeFile(updater, `#!/bin/sh\nexec sh ${quote(updateScript)} "$@"\n`);
await chmod(updater, 0o755);

if (desktopId !== pkg.desktopName) {
  try {
    const legacyEntry = await readFile(legacyDesktopFile, 'utf8');
    if (legacyEntry.includes(installedImage)) await unlink(legacyDesktopFile);
  } catch { /* The previous launcher may already be removed. */ }
  await unlink(legacyIcon).catch(() => {});
}

console.log(`Installed Rokko ${manifest.version} in ${installedImage}`);
console.log(`Launch it from the applications menu. Run 'rokko-update' to rebuild and update it.`);

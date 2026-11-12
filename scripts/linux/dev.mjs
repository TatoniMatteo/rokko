#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { electronExecutable, profileForExecutable, profileName } from './apparmor.mjs';
import { ensureElectronInstalled } from './electron-install.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = new Set(process.argv.slice(2));
const isDoctor = args.has('--doctor');
const isSetup = args.has('--setup');

function command(binary, argv, options = {}) {
  return spawnSync(binary, argv, { stdio: 'inherit', ...options });
}
function readRestricted() {
  try { return readFileSync('/proc/sys/kernel/apparmor_restrict_unprivileged_userns', 'utf8').trim() === '1'; }
  catch { return false; }
}
function printFailure(message) {
  console.error(`\n[Rokko] ${message}`);
  process.exitCode = 1;
}

if (process.platform !== 'linux') {
  if (isSetup || isDoctor) console.log('[Rokko] Linux setup applies only to Linux.');
  else process.exit(command('corepack', ['pnpm', 'exec', 'electron-vite', 'dev'], { cwd: root }).status ?? 1);
} else {
  let executable;
  try {
    executable = ensureElectronInstalled(root, { electronExecutable });
  } catch (error) {
    printFailure(error.message);
  }

  if (executable) {
    const restriction = readRestricted();
    const name = profileName(executable);
    const destination = `/etc/apparmor.d/${name}`;
    const source = profileForExecutable(executable);
    let installed = false;
    try { installed = readFileSync(destination, 'utf8') === source; }
    catch { /* no profile */ }

    if (isDoctor) {
      console.log(`[Rokko] Electron: ${executable}`);
      console.log(`[Rokko] AppArmor user namespace restriction: ${restriction ? 'enabled' : 'not detected'}`);
      console.log(`[Rokko] Development profile: ${installed ? 'installed' : 'not installed'}`);
      console.log('[Rokko] No changes were made.');
    } else if (!restriction && isSetup) {
      console.log('[Rokko] This system does not report the AppArmor userns restriction. Nothing to configure.');
    } else {
      if (restriction && !installed) {
        if (!process.stdin.isTTY) {
          printFailure('AppArmor setup requires an interactive terminal. Run corepack pnpm linux:setup in a terminal.');
        } else {
          console.log('\n[Rokko] Ubuntu is restricting Chromium user namespaces.');
          console.log('[Rokko] Installing a dedicated development profile for this Electron binary.');
          console.log(`[Rokko] Target: ${destination}`);
          console.log('[Rokko] Administrative permission will be requested once via sudo.');
          console.log('[Rokko] This does not disable the Chromium sandbox or global AppArmor settings.\n');
          const dir = mkdtempSync(join(tmpdir(), 'rokko-apparmor-'));
          const temporaryProfile = join(dir, 'profile');
          try {
            writeFileSync(temporaryProfile, source, { mode: 0o600 });
            const install = command('sudo', ['install', '-m', '0644', temporaryProfile, destination]);
            if (install.status !== 0) {
              printFailure('Unable to install the AppArmor profile. No sandbox bypass was used.');
            } else {
              const reload = command('sudo', ['apparmor_parser', '-r', destination]);
              if (reload.status !== 0) printFailure('AppArmor rejected the profile. Review the output above.');
              else console.log('[Rokko] AppArmor profile installed.');
            }
          } finally { rmSync(dir, { recursive: true, force: true }); }
        }
      }
      if (!process.exitCode) {
        if (isSetup) console.log('[Rokko] Linux development setup complete.');
        else {
          const child = command('corepack', ['pnpm', 'exec', 'electron-vite', 'dev'], { cwd: root });
          process.exitCode = child.status ?? 1;
        }
      }
    }
  }
}

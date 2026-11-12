import { spawnSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Electron 42+ no longer downloads its executable during pnpm install.
 * electron-vite expects path.txt to exist before it starts, so explicitly
 * invoke Electron's bundled on-demand installer before starting electron-vite.
 * The installed executable remains sandboxed (we never pass --no-sandbox).
 */
export function ensureElectronInstalled(projectRoot, options = {}) {
  const exists = options.exists ?? existsSync;
  const realpath = options.realpath ?? realpathSync;
  const run = options.run ?? spawnSync;
  const electronDir = resolve(projectRoot, 'node_modules/electron');
  const installer = resolve(electronDir, 'install.js');
  const marker = resolve(electronDir, 'path.txt');

  if (!exists(installer)) {
    throw new Error('Electron npm package missing. Run: corepack pnpm install');
  }

  // Always check the marker and the binary: an interrupted download can leave
  // one of them missing. Electron's installer validates the platform binary.
  let executable;
  if (exists(marker)) {
    try {
      const { electronExecutable } = options;
      executable = electronExecutable ? electronExecutable(projectRoot) : null;
    } catch { /* will reinstall below */ }
  }
  if (executable && exists(executable)) return realpath(executable);

  console.log('[Rokko] Installing the Electron runtime (first launch only)...');
  const result = run(process.execPath, [installer], { cwd: projectRoot, stdio: 'inherit' });
  if (result.error || result.status !== 0) {
    throw new Error('Electron runtime download failed. Check network access and retry corepack pnpm dev.');
  }

  const getExecutable = options.electronExecutable;
  if (!getExecutable) {
    throw new Error('Missing Electron executable resolver');
  }
  try {
    executable = getExecutable(projectRoot);
  } catch {
    throw new Error('Electron installer finished without producing a usable executable.');
  }
  if (!exists(marker) || !exists(executable)) {
    throw new Error('Electron installer did not produce path.txt and an executable.');
  }
  return realpath(executable);
}

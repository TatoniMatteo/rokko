import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';

export function electronExecutable(projectRoot) {
  return realpathSync(resolve(projectRoot, 'node_modules/electron/dist/electron'));
}

export function profileName(executable) {
  return `rokko-dev-${createHash('sha256').update(executable).digest('hex').slice(0, 12)}`;
}

export function profileForExecutable(executable) {
  // Reject unexpected control chars and syntax metacharacters before writing a privileged policy.
  if (!executable.startsWith('/') || /[\r\n\0"\\{}*?\[\]]/.test(executable)) {
    throw new Error('Unsupported Electron installation path for AppArmor');
  }
  return `# Rokko development: generated for this local Electron executable.\n` +
    `# Not a full confinement policy; permits Chromium user namespaces only.\n` +
    `abi <abi/4.0>,\ninclude <tunables/global>\n` +
    `profile ${profileName(executable)} "${executable}" flags=(unconfined) {\n  userns,\n}\n`;
}

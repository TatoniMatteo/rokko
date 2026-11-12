import { open, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

export async function appImageOffset(file, arch = process.arch) {
  const handle = await open(file);
  let offset = -1;
  try {
    const header = Buffer.alloc(1024 * 1024);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    if (header.subarray(0, 4).toString('hex') !== '7f454c46') throw new Error('AppImage is not ELF');
    if (header[4] !== 2 || header[5] !== 1 ||
        header.readUInt16LE(18) !== ({ x64: 62, arm64: 183 })[arch]) {
      throw new Error('AppImage ELF architecture does not match build target');
    }
    for (let at = 0; at <= bytesRead - 96; at++) {
      if (header.toString('ascii', at, at + 4) === 'hsqs' &&
          header.readUInt16LE(at + 28) === 4 && header.readUInt16LE(at + 30) === 0) {
        offset = at;
        break;
      }
    }
  } finally { await handle.close(); }
  if (offset < 0) throw new Error('No supported SquashFS header in AppImage runtime');
  return offset;
}

export async function inspectAppImage(file, expectedLauncher, desktopName, arch = process.arch) {
  const offset = await appImageOffset(file, arch);
  function member(name) {
    const result = spawnSync('unsquashfs', ['-o', String(offset), '-cat', file, name], { encoding: 'utf8' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Unable to inspect AppImage ${name}: ${result.stderr}`);
    return result.stdout;
  }
  if (member('AppRun') !== await readFile(expectedLauncher, 'utf8')) {
    throw new Error('AppImage launcher differs from reviewed sandbox-preserving launcher');
  }
  const desktop = member(desktopName);
  if (!/^Exec=AppRun %U$/m.test(desktop) || /--no-sandbox|--disable-setuid-sandbox/.test(desktop)) {
    throw new Error('Unsafe or unexpected AppImage desktop entry');
  }
}

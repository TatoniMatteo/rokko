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
  function member(name, encoding = 'utf8') {
    const result = spawnSync('unsquashfs', ['-o', String(offset), '-cat', file, name], { encoding, maxBuffer:16*1024*1024 });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Unable to inspect AppImage ${name}: ${result.stderr}`);
    return result.stdout;
  }
  if (member('AppRun') !== await readFile(expectedLauncher, 'utf8')) {
    throw new Error('AppImage launcher differs from reviewed sandbox-preserving launcher');
  }
  const desktop = member(desktopName);
  if (!/^Type=Application$/m.test(desktop) || !/^Name=Rokko$/m.test(desktop) || !/^Exec=AppRun %U$/m.test(desktop) || /--no-sandbox|--disable-setuid-sandbox/.test(desktop)) {
    throw new Error('Unsafe or unexpected AppImage desktop entry');
  }
  const icon=desktop.match(/^Icon=([\w.-]+)$/m)?.[1];
  if (!icon || !member(icon+'.png',null).subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))) throw new Error('AppImage desktop icon is missing or invalid');
  for (const name of ['LICENSE.electron.txt','LICENSES.chromium.html','resources/licenses/ROKKO-LICENSE.txt','resources/licenses/ONEST-LICENSE.txt','resources/licenses/FONT-AWESOME-LICENSE.txt','resources/licenses/THIRD-PARTY-NOTICES.txt']) {
    if (!member(name).trim()) throw new Error('Missing packaged license: '+name);
  }
}

import { open, writeFile, rename, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { validateConfiguration, configurationLimit } from '../../shared/import/configuration.mjs';
export async function readConfiguration(path) {
  const file = await open(path, 'r');
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > configurationLimit)
      throw new Error('Unsupported configuration file.');
    const buffer = Buffer.alloc(configurationLimit + 1);
    let size = 0;
    while (size < buffer.length) {
      const { bytesRead } = await file.read(buffer, size, buffer.length - size, null);
      if (!bytesRead) break;
      size += bytesRead;
    }
    if (size > configurationLimit) throw new Error('Unsupported configuration file.');
    return validateConfiguration(JSON.parse(buffer.subarray(0, size).toString('utf8')));
  } finally {
    await file.close();
  }
}
export async function writeConfiguration(path, value) {
  const document = validateConfiguration(value);
  const temporary = path + '.' + randomUUID() + '.tmp';
  try {
    await writeFile(temporary, JSON.stringify(document, null, 2), { mode: 0o600, flag: 'wx' });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

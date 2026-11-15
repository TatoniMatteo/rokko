import {
  appendFileSync,
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const events = new Set([
  'startup',
  'load-failed',
  'renderer-crashed',
  'service-suspended',
  'service-resumed',
  'system-resume',
  'download-start',
  'download-completed',
  'download-cancelled',
  'download-interrupted',
  'permission-request',
  'permission-granted',
  'permission-denied',
]);
const maxBytes = 256 * 1024;
const maxAge = 7 * 86400000;
function entry(value, now) {
  if (
    !value ||
    !events.has(value.event) ||
    !Number.isSafeInteger(value.time) ||
    value.time > now ||
    now - value.time > maxAge
  )
    return null;
  return {
    time: value.time,
    event: value.event,
    ...(Number.isSafeInteger(value.code) && Math.abs(value.code) <= 9999
      ? { code: value.code }
      : {}),
  };
}
/** Fixed event vocabulary only: never accept arbitrary messages, URLs, IDs or exception objects. */
export class LocalLog {
  constructor(directory, { now = Date.now } = {}) {
    this.directory = join(directory, 'diagnostics');
    this.now = now;
    try {
      mkdirSync(this.directory, { recursive: true, mode: 0o700 });
      this.prune();
    } catch {
      /* Diagnostics must not prevent startup. */
    }
  }
  file(index) {
    return join(this.directory, `events-${index}.jsonl`);
  }
  safeDirectory() {
    try {
      const stat = lstatSync(this.directory);
      return stat.isDirectory() && !stat.isSymbolicLink();
    } catch {
      return false;
    }
  }
  prune() {
    if (!this.safeDirectory()) return;
    const now = this.now(),
      refresh = this.lastPrune === undefined || now - this.lastPrune >= 86400000;
    for (let index = 0; index < 3; index++) {
      const path = this.file(index);
      if (!existsSync(path)) continue;
      const stat = lstatSync(path);
      if (stat.isSymbolicLink() || stat.size > maxBytes || now - stat.mtimeMs > maxAge) {
        rmSync(path, { force: true });
        continue;
      }
      if (refresh) {
        const original = readFileSync(path, 'utf8');
        const lines = [];
        for (const line of original.split('\n')) {
          try {
            const value = entry(JSON.parse(line), now);
            if (value) lines.push(JSON.stringify(value));
          } catch {
            /* Discard invalid entries. */
          }
        }
        const text = lines.length ? lines.join('\n') + '\n' : '';
        if (text !== original) writeFileSync(path, text, { mode: 0o600 });
      }
    }
    this.lastPrune = now;
  }
  record(event, details = {}) {
    const value = entry({ time: this.now(), event, code: details.code }, this.now());
    if (!value || !this.safeDirectory()) return;
    try {
      this.prune();
      const path = this.file(0),
        line = JSON.stringify(value) + '\n';
      if (existsSync(path) && statSync(path).size + Buffer.byteLength(line) > maxBytes) {
        rmSync(this.file(2), { force: true });
        for (let index = 1; index >= 0; index--)
          if (existsSync(this.file(index))) renameSync(this.file(index), this.file(index + 1));
      }
      appendFileSync(path, line, { mode: 0o600 });
      chmodSync(path, 0o600);
    } catch {
      /* No remote reporting or logging of sensitive filesystem errors. */
    }
  }
  read() {
    const result = [];
    if (!this.safeDirectory()) return result;
    try {
      this.prune();
    } catch {
      return result;
    }
    for (let index = 2; index >= 0; index--) {
      try {
        const path = this.file(index);
        if (lstatSync(path).isSymbolicLink() || statSync(path).size > maxBytes) continue;
        for (const line of readFileSync(path, 'utf8').split('\n')) {
          try {
            const value = entry(JSON.parse(line), this.now());
            if (value) result.push(value);
          } catch {
            /* Ignore invalid lines. */
          }
        }
      } catch {
        /* No log yet. */
      }
    }
    return result;
  }
  clear() {
    if (!this.safeDirectory()) throw new Error('Diagnostic directory unavailable');
    for (let index = 0; index < 3; index++) rmSync(this.file(index), { force: true });
  }
}
export function diagnosticReport(info, entries) {
  const versions = {};
  for (const key of ['app', 'electron', 'chrome', 'node'])
    if (typeof info.versions?.[key] === 'string' && /^[\w.+-]{1,64}$/.test(info.versions[key]))
      versions[key] = info.versions[key];
  const counts = {};
  for (const key of ['services', 'workspaces', 'loaded', 'suspended'])
    if (
      Number.isSafeInteger(info.counts?.[key]) &&
      info.counts[key] >= 0 &&
      info.counts[key] <= 1000
    )
      counts[key] = info.counts[key];
  return {
    format: 1,
    versions,
    platform: ['linux', 'darwin', 'win32'].includes(info.platform) ? info.platform : 'unknown',
    arch: ['x64', 'arm64', 'ia32'].includes(info.arch) ? info.arch : 'unknown',
    display: info.display === 'wayland' ? 'wayland' : 'x11',
    counts,
    events: entries.map((value) => entry(value, Date.now())).filter(Boolean),
  };
}
export function exportDiagnostics(path, report) {
  const temporary = path + '.' + randomUUID() + '.tmp';
  try {
    writeFileSync(temporary, JSON.stringify(report, null, 2), { mode: 0o600, flag: 'wx' });
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}

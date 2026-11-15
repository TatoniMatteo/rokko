import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  LocalLog,
  diagnosticReport,
  exportDiagnostics,
} from '../../src/main/diagnostics/local-log.mjs';
function profile(fn) {
  const root = mkdtempSync(join(tmpdir(), 'rokko-log-'));
  try {
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
test('diagnostics exclude arbitrary data', () =>
  profile((root) => {
    const log = new LocalLog(root);
    log.record('startup', { url: 'https://secret.test', cookie: 'secret' });
    log.record('secret');
    writeFileSync(
      join(root, 'diagnostics/events-1.jsonl'),
      JSON.stringify({ time: Date.now(), event: 'load-failed', code: -202, secret: 'private' }) +
        '\n' +
        JSON.stringify({ time: Date.now(), event: 'secret' }),
    );
    const report = diagnosticReport(
      {
        versions: { app: '0.1.0', node: 'v24.1', cookie: 'private' },
        platform: 'linux',
        arch: 'x64',
        display: 'wayland',
        counts: { services: 3, secret: 42 },
      },
      log.read(),
    );
    assert.equal(report.events.length, 2);
    assert.equal(JSON.stringify(report).includes('secret'), false);
    assert.equal(JSON.stringify(report).includes('private'), false);
    const path = join(root, 'export.json');
    exportDiagnostics(path, report);
    assert.deepEqual(JSON.parse(readFileSync(path)), report);
    assert.equal(statSync(path).mode & 0o777, 0o600);
    log.clear();
    assert.equal(log.read().length, 0);
  }));
test('logs rotate and expire', () =>
  profile((root) => {
    let now = Date.now();
    const log = new LocalLog(root, { now: () => now });
    for (let i = 0; i < 16000; i++) log.record('load-failed', { code: -105 });
    const files = readdirSync(join(root, 'diagnostics'));
    assert.ok(files.length <= 3);
    for (const file of files) {
      const stat = statSync(join(root, 'diagnostics', file));
      assert.ok(stat.size <= 256 * 1024);
      assert.equal(stat.mode & 0o777, 0o600);
    }
    now += 8 * 86400000;
    assert.equal(log.read().length, 0);
  }));
test('log paths never follow symlinks', () =>
  profile((root) => {
    const target = join(root, 'private');
    writeFileSync(target, 'private content');
    const log = new LocalLog(root);
    symlinkSync(target, join(root, 'diagnostics/events-0.jsonl'));
    log.record('startup');
    assert.equal(readFileSync(target, 'utf8'), 'private content');
    assert.equal(log.read().length, 1);
  }));

test('old entries are removed even in a recently written file', () =>
  profile((root) => {
    new LocalLog(root);
    const path = join(root, 'diagnostics/events-0.jsonl');
    writeFileSync(
      path,
      JSON.stringify({ time: Date.now() - 8 * 86400000, event: 'startup' }) +
        '\n' +
        JSON.stringify({ time: Date.now(), event: 'startup' }) +
        '\n',
    );
    const reopened = new LocalLog(root);
    assert.equal(reopened.read().length, 1);
    assert.equal(readFileSync(path, 'utf8').trim().split('\n').length, 1);
  }));
test('diagnostics never use a linked directory', () =>
  profile((root) => {
    const parent = mkdtempSync(join(tmpdir(), 'rokko-log-target-'));
    try {
      writeFileSync(join(parent, 'events-0.jsonl'), 'private');
      symlinkSync(parent, join(root, 'diagnostics'));
      const log = new LocalLog(root);
      log.record('startup');
      assert.equal(log.read().length, 0);
      assert.throws(() => log.clear());
      assert.equal(readFileSync(join(parent, 'events-0.jsonl'), 'utf8'), 'private');
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  }));

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, copyFileSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('launcher preserves sandbox and arguments', t => {
  const directory = mkdtempSync(join(tmpdir(), 'rokko launcher '));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  copyFileSync('build/linux/AppRun', join(directory, 'AppRun'));
  chmodSync(join(directory, 'AppRun'), 0o755);
  writeFileSync(join(directory, 'rokko'), '#!/bin/sh\nprintf "%s\\n" "$@"\n', { mode: 0o755 });
  const env = { ...process.env };
  delete env.APPDIR;
  const result = spawnSync(join(directory, 'AppRun'), ['a space', 'https://example.com/?a=b&c=d'],
    { env, encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, 'a space\nhttps://example.com/?a=b&c=d\n');
  for (const flag of ['--no-sandbox', '--disable-setuid-sandbox']) {
    const denied = spawnSync(join(directory, 'AppRun'), [flag], { env, encoding: 'utf8' });
    assert.equal(denied.status, 1);
    assert.match(denied.stderr, /requires Chromium sandboxing/);
    assert.equal(denied.stdout, '');
  }
});

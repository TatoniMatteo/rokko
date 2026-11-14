import assert from 'node:assert/strict';
import { writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readDatabase } from '../../src/main/storage/database.mjs';
import { createRuntime } from '../qa/runtime.mjs';

async function smoke() {
  const { launch, config, output, values } = await createRuntime(
    '.codex/tasks/linux-release/smoke',
  );

  try {
    const first = await launch('first-launch');
    try {
      const initial = await first.evaluate('window.rokko.getSnapshot()');
      assert.equal(initial.data.apps.length, 0);
      assert.equal(initial.data.workspaces.length, 1);
      await first.evaluate('window.rokko.addWorkspace("Package QA")');
      assert.equal(
        await first.evaluate(
          'window.rokko.addApp({name:"Rejected",url:"file:///etc/passwd"}).then(() => false, () => true)',
        ),
        true,
      );
      await first.screenshot();
    } finally {
      await first.stop();
    }
    const restored = await launch('restored-launch');
    try {
      const snapshot = await restored.evaluate('window.rokko.getSnapshot()');
      assert.equal(snapshot.data.workspaces.length, 2);
      assert.equal(snapshot.data.apps.length, 0);
      assert.equal(
        snapshot.data.workspaces.find((w) => w.id === snapshot.data.selectedWorkspaceId)?.name,
        'Package QA',
      );
      const persisted = readDatabase(join(config, 'rokko/rokko.sqlite')).data;
      assert.equal(persisted.apps.length, 0);
      assert.equal(persisted.workspaces.length, 2);
      await restored.screenshot();
    } finally {
      await restored.stop();
    }
    await writeFile(
      join(output, 'result.json'),
      `${JSON.stringify(
        {
          passed: true,
          platform: process.platform,
          arch: process.arch,
          node: process.version,
          display: values.x11 ? 'x11' : (process.env.XDG_SESSION_TYPE ?? 'unspecified'),
          checks: [
            'packaged-renderer',
            'preload-ipc',
            'no-node-globals',
            'shared-icons',
            'invalid-url',
            'restart-persistence',
          ],
        },
        null,
        2,
      )}\n`,
    );
    console.log(
      'PASS: packaged renderer/IPC, icons, rejected URL and persistence across two launches',
    );
  } finally {
    await rm(config, { recursive: true, force: true });
  }
}

if (resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await smoke();

import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureElectronInstalled } from '../../scripts/linux/electron-install.mjs';

const root = '/tmp/rokko-test';
const marker = `${root}/node_modules/electron/path.txt`;
const installer = `${root}/node_modules/electron/install.js`;
const executable = `${root}/node_modules/electron/dist/electron`;

test('uses previously downloaded Electron binary', () => {
  let calls = 0;
  const result = ensureElectronInstalled(root, {
    exists: path => [marker, installer, executable].includes(path),
    realpath: path => path,
    electronExecutable: () => executable,
    run: () => { calls++; return { status: 0 }; },
  });
  assert.equal(result, executable);
  assert.equal(calls, 0);
});

test('first launch downloads Electron before querying its executable', () => {
  let installed = false;
  let calls = 0;
  const result = ensureElectronInstalled(root, {
    exists: path => path === installer || (installed && [marker, executable].includes(path)),
    realpath: path => path,
    electronExecutable: () => {
      if (!installed) throw new Error('Electron uninstall');
      return executable;
    },
    run: (_bin, argv) => {
      assert.deepEqual(argv, [installer]);
      calls++;
      installed = true;
      return { status: 0 };
    },
  });
  assert.equal(result, executable);
  assert.equal(calls, 1);
});

test('clearly reports failed downloads without bypassing the sandbox', () => {
  assert.throws(() => ensureElectronInstalled(root, {
    exists: path => path === installer,
    electronExecutable: () => { throw new Error('Electron uninstall'); },
    run: () => ({ status: 1 }),
  }), /runtime download failed/);
});

test('reports missing electron package', () => {
  assert.throws(() => ensureElectronInstalled(root, { exists: () => false }), /npm package missing/);
});

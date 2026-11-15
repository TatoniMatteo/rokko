import test from 'node:test';
import assert from 'node:assert/strict';
import { safeDownloadName } from '../../src/shared/security/download-name.mjs';
test('download names stay local and bounded', () => {
  for (const [input, expected] of [
    ['../../secret.txt', 'secret.txt'],
    ['C:\\folder\\doc.pdf', 'doc.pdf'],
    ['.hidden', 'hidden'],
    ['..', 'download'],
    ['NUL.txt', 'download-NUL.txt'],
    ['a\u202etxt.exe', 'a_txt.exe'],
    ['photo.png', 'photo.png'],
  ])
    assert.equal(safeDownloadName(input), expected);
  assert.ok(safeDownloadName('x'.repeat(500)).length <= 128);
  assert.equal(safeDownloadName(null), 'download');
});

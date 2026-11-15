import test from 'node:test';
import assert from 'node:assert/strict';
import { externalLink } from '../../src/shared/security/external-links.mjs';
test('supported external destinations', () => {
  for (const url of [
    'https://example.com/path?q=x',
    'mailto:hello@example.com?subject=Hello',
    'tel:+3901234567',
  ])
    assert.ok(externalLink(url), url);
});
test('external handlers reject unsafe input', () => {
  for (const url of [
    'file:///etc/passwd',
    'javascript:alert(1)',
    'data:text/html,a',
    'ftp://example.com',
    'https://u:p@example.com',
    'mailto:a@example.com?bcc=secret@example.com',
    'mailto:a@example.com?subject=x%0d%0aBcc:secret',
    'mailto:a@example.com?subject=x%250d%250aBcc:secret',
    'mailto://u@host/address@example.com',
    'tel:javascript:1',
    'https://example.com/\n',
    null,
  ])
    assert.equal(externalLink(url), null, String(url));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { serviceUserAgent } from '../../src/main/navigation/user-agent.mjs';

const engine = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko)';
const ua = `${engine} rokko/0.1.0-alpha.3 Chrome/156.0.8078.96 Electron/45.3.0 Safari/537.36`;

test('WhatsApp keeps the installed engine', () => {
  const expected = `${engine} Chrome/156.0.8078.96 Safari/537.36`;
  assert.equal(serviceUserAgent('https://web.whatsapp.com/', ua), expected);
  assert.equal(serviceUserAgent('https://web.whatsapp.com/?lang=it', ua), expected);
  assert.equal(serviceUserAgent('https://web.whatsapp.com/', expected), expected);
});

test('other origins retain their identity', () => {
  for (const url of ['https://accounts.google.com/', 'https://whatsapp.com/',
    'https://web.whatsapp.com.example.org/', 'https://example.org/web.whatsapp.com',
    'http://web.whatsapp.com/', 'https://web.whatsapp.com:8443/', 'invalid']) {
    assert.equal(serviceUserAgent(url, ua), ua);
  }
});

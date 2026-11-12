import test from 'node:test';
import assert from 'node:assert/strict';
import { rasterIcon, validIcon, fetchFavicon } from '../../src/shared/services/service-icons.mjs';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9XkAAAAASUVORK5CYII=', 'base64');

test('raster icon validation', () => {
  const icon = rasterIcon(png);
  assert.equal(validIcon(icon), icon);
  assert.equal(validIcon(null), undefined);
  for (const value of ['https://example.com/a.png', 'data:image/svg+xml;base64,PHN2Zz4=',
    'data:image/png;base64,PGh0bWw+', 'data:image/png;base64,' + 'A'.repeat(100000)]) {
    assert.throws(() => validIcon(value));
  }
  assert.throws(() => rasterIcon(Buffer.alloc(70000)));
});

test('credential-free favicon', async () => {
  const calls = [];
  const icon = await fetchFavicon('https://example.com/private?secret=test', async (url, options) => {
    calls.push({ url, options }); return new Response(png);
  });
  assert.equal(icon, rasterIcon(png));
  assert.equal(calls[0].url, 'https://example.com/favicon.ico');
  assert.equal(calls[0].options.credentials, 'omit');
  assert.equal(calls[0].options.referrerPolicy, 'no-referrer');
  assert.equal(calls[0].options.redirect, 'manual');
});

test('favicon limits and redirects', async () => {
  let calls = 0;
  assert.equal(await fetchFavicon('https://example.com/', async () => {
    calls++; return new Response(null, { status: 302, headers: { location: 'https://other.example/icon.png' } });
  }), null);
  assert.equal(calls, 1);
  assert.equal(await fetchFavicon('https://example.com/', async () => new Response(Buffer.alloc(70000))), null);
  assert.equal(await fetchFavicon('https://example.com/', async () => new Response('<svg/>')), null);
  calls = 0;
  const icon = await fetchFavicon('https://example.com/', async () => ++calls === 1
    ? new Response(null, { status: 302, headers: { location: '/icon.png' } }) : new Response(png));
  assert.equal(icon, rasterIcon(png));
});

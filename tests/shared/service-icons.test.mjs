import test from 'node:test';
import assert from 'node:assert/strict';
import { rasterIcon, validIcon, fetchFavicon, faviconLinks, faviconIcon } from '../../src/shared/services/service-icons.mjs';
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
    calls++; return calls === 1 ? new Response(null, { status: 302, headers: { location: 'https://cdn.example/icon.png' } }) : new Response(png);
  }), rasterIcon(png));
  assert.equal(calls, 2);
  assert.equal(await fetchFavicon('https://example.com/', async () => new Response(Buffer.alloc(70000))), null);
  assert.equal(await fetchFavicon('https://example.com/', async () => new Response('<svg/>')), null);
  calls = 0;
  const icon = await fetchFavicon('https://example.com/', async () => ++calls === 1
    ? new Response(null, { status: 302, headers: { location: '/icon.png' } }) : new Response(png));
  assert.equal(icon, rasterIcon(png));
});

test('discovers declared icons', async () => {
  const requests=[];
  const icon=await fetchFavicon('https://example.com/private?token=secret',async(url,options)=>{
    requests.push(url);assert.equal(options.credentials,'omit');assert.equal(options.referrerPolicy,'no-referrer');
    if(url.endsWith('/favicon.ico'))return new Response(null,{status:404});
    if(url==='https://example.com/')return new Response('<head><!-- <link rel="icon" href="https://bad.example/x"> --><script>"<link rel=icon href=x>"</script><link sizes="32x32" href="https://cdn.example/icon.png?a=1&amp;b=2" rel="shortcut icon"></head>'+'x'.repeat(300000));
    assert.equal(url,'https://cdn.example/icon.png?a=1&b=2');return new Response(png);
  });
  assert.equal(icon,rasterIcon(png));assert.equal(requests.length,3);
  assert.ok(!requests.some(url=>url.includes('secret')));
});
test('icon URL boundaries', async()=>{
  assert.deepEqual(faviconLinks('<link rel=icon href="http://cdn.example/x"><link rel=icon href="https://user:password@cdn.example/x"><link rel=icon href="https://127.0.0.1/x"><link rel=icon href="file:///x"><link rel=icon href="/good.png">','https://example.com/'),['https://example.com/good.png']);
  for(const location of ['http://cdn.example/a','https://127.0.0.1/a','https://user:pass@cdn.example/a','file:///a']){
    const urls=[];await fetchFavicon('https://example.com/',async(url)=>{urls.push(url);return new Response(null,{status:302,headers:{location}})});
    assert.ok(urls.every(url=>url.startsWith('https://example.com/')));
  }
});
test('bounded inert SVG',async()=>{
  const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><path d="M0 0h16v16H0z"/></svg>');
  assert.ok(faviconIcon(svg).startsWith('data:image/svg+xml;base64,'));
  assert.throws(()=>validIcon(faviconIcon(svg))); // Persistent custom icons stay raster-only.
  for(const text of ['<svg onload="alert(1)"></svg>','<svg><script>alert(1)</script></svg>',
    '<!DOCTYPE svg><svg/>','<svg><image href="https://other.example/a"/></svg>',
    '<svg><foreignObject/></svg>','<svg><style>@import "x";</style></svg>']) assert.throws(()=>faviconIcon(Buffer.from(text)));
  assert.throws(()=>faviconIcon(Buffer.alloc(70000)));
  assert.equal(await fetchFavicon('https://example.com/',async()=>new Response(svg)),faviconIcon(svg));
});
test('live favicon candidates',async()=>{
  const urls=[];
  assert.equal(await fetchFavicon('https://example.com/',async url=>{urls.push(url);return new Response(png)},['https://assets.example/declared.png']),rasterIcon(png));
  assert.deepEqual(urls,['https://assets.example/declared.png']);
});

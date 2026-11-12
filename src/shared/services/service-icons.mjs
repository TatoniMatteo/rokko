import { isIP } from 'node:net';
import { normalizeHttpsUrl } from '../security/validation.mjs';

const MAX_ICON_BYTES = 64 * 1024;
export function rasterIcon(bytes) {
  if (!bytes.length || bytes.length > MAX_ICON_BYTES) throw new Error('Icona troppo grande o vuota');
  let mime;
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) mime = 'image/png';
  else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) mime = 'image/jpeg';
  else if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') mime = 'image/webp';
  else if (bytes.subarray(0, 4).equals(Buffer.from([0, 0, 1, 0]))) mime = 'image/x-icon';
  else throw new Error('Usa un’immagine PNG, JPEG, WebP o ICO');
  return `data:${mime};base64,${bytes.toString('base64')}`;
}
export function validIcon(value) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || value.length > 90000 ||
      !/^data:image\/(png|jpeg|webp|x-icon);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error('Icona non valida');
  const canonical = rasterIcon(Buffer.from(value.split(',')[1], 'base64'));
  if (canonical !== value) throw new Error('Icona non valida');
  return value;
}
// Remote SVGs are transient image sources, never persisted or inserted as DOM markup.
export function faviconIcon(bytes) {
  try { return rasterIcon(bytes); } catch { /* Try a bounded SVG image. */ }
  const text = bytes.toString('utf8').trim().replace(/^<\?xml[^>]*\?>\s*/i, '');
  if (!bytes.length || bytes.length > MAX_ICON_BYTES || !/^<svg[\s>]/i.test(text) ||
      /<!|<\s*(?:script|foreignObject|iframe|object|embed|image|animate|set)\b|\bon\w+\s*=|@import|@keyframes|animation\s*:|(?:href|src)\s*=/i.test(text) ||
      /url\(\s*['"]?(?!#)/i.test(text)) throw new Error('Invalid favicon image');
  return `data:image/svg+xml;base64,${bytes.toString('base64')}`;
}
function iconUrl(value, base, origin) {
  try {
    const url = new URL(value, base);
    if (url.protocol !== 'https:' || url.username || url.password || url.href.length > 4096) return null;
    const hostname = url.hostname.replace(/\.$/, '');
    if (url.origin !== origin && (isIP(hostname.replace(/^\[|\]$/g, '')) ||
        /^(?:localhost)$|\.(?:localhost|local|internal)$/i.test(hostname) || !hostname.includes('.'))) return null;
    url.hash = '';
    return url.href;
  } catch { return null; }
}
export function faviconLinks(html, pageUrl, origin = new URL(pageUrl).origin) {
  const head = html.split(/<\/head\s*>/i)[0].replace(/<!--[\s\S]*?(?:-->|$)|<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  const decode = value => value.replace(/&amp;/gi, '&').replace(/&#(x[\da-f]+|\d+);/gi, (_, n) => {
    const code = n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : Number(n);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
  });
  const links = [];
  for (const tag of head.match(/<link\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi) ?? []) {
    const attributes = {};
    for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
      attributes[match[1].toLowerCase()] ??= decode(match[2] ?? match[3] ?? match[4]);
    }
    if (!/(?:^|\s)(?:icon|apple-touch-icon(?:-precomposed)?)(?:\s|$)/i.test(attributes.rel ?? '')) continue;
    const url = attributes.href && iconUrl(attributes.href, pageUrl, origin);
    if (url && !links.includes(url)) links.push(url);
    if (links.length === 6) break;
  }
  return links.sort((a, b) => Number(/\.svg(?:\?|$)/i.test(a)) - Number(/\.svg(?:\?|$)/i.test(b)));
}
export async function fetchFavicon(site, fetcher = fetch, hints = []) {
  const origin = new URL(normalizeHttpsUrl(site)).origin;
  const signal = AbortSignal.timeout(10000);
  async function download(input, html = false) {
    let url = iconUrl(input, origin, origin);
    try {
      for (let redirects = 0; url && redirects < 4; redirects++) {
        const response = await fetcher(url, { redirect: 'manual', credentials: 'omit', referrerPolicy: 'no-referrer',
          signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]) });
        if (response.status >= 300 && response.status < 400) {
          await response.body?.cancel();
          const location = response.headers.get('location');
          url = location ? iconUrl(location, url, origin) : null;
          continue;
        }
        if (!response.ok || !response.body) { await response.body?.cancel(); return null; }
        const limit = html ? 256 * 1024 : MAX_ICON_BYTES;
        if (!html && Number(response.headers.get('content-length')) > limit) { await response.body.cancel(); return null; }
        const reader = response.body.getReader();
        const chunks = []; let size = 0;
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            if (!html && size + value.length > limit) return null;
            const chunk = Buffer.from(value).subarray(0, limit - size); chunks.push(chunk); size += chunk.length;
            if (html && (size >= limit || Buffer.concat(chunks).toString().includes('</head>'))) break;
          }
          const bytes = Buffer.concat(chunks);
          return html ? { url, html: bytes.toString('utf8') } : faviconIcon(bytes);
        } finally { await reader.cancel().catch(() => {}); }
      }
    } catch { /* Network, format, redirect and timeout failures use the next candidate. */ }
    return null;
  }
  const tried = new Set();
  async function candidate(url) {
    const safe = iconUrl(url, origin, origin);
    if (!safe || tried.has(safe) || signal.aborted) return null;
    tried.add(safe); return download(safe);
  }
  for (const url of hints.slice(0, 6)) { const icon = await candidate(url); if (icon) return icon; }
  const conventional = await candidate(`${origin}/favicon.ico`);
  if (conventional) return conventional;
  const page = await download(origin + '/', true);
  if (page) for (const url of faviconLinks(page.html, page.url, origin)) {
    const icon = await candidate(url); if (icon) return icon;
  }
  return null;
}

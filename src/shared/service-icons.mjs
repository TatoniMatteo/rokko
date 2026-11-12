import { normalizeHttpsUrl } from './validation.mjs';

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
export async function fetchFavicon(site, fetcher = fetch) {
  const origin = new URL(normalizeHttpsUrl(site)).origin;
  let url = `${origin}/favicon.ico`;
  const signal = AbortSignal.timeout(5000);
  for (let redirects = 0; redirects < 4; redirects++) {
    const response = await fetcher(url, { redirect: 'manual', credentials: 'omit', referrerPolicy: 'no-referrer', signal });
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      const next = new URL(response.headers.get('location') ?? '', url);
      if (next.origin !== origin || next.protocol !== 'https:') return null;
      url = next.href;
      continue;
    }
    if (!response.ok || !response.body) { await response.body?.cancel(); return null; }
    if (Number(response.headers.get('content-length')) > MAX_ICON_BYTES) {
      await response.body.cancel(); return null;
    }
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > MAX_ICON_BYTES) { await reader.cancel(); return null; }
        chunks.push(Buffer.from(value));
      }
      return rasterIcon(Buffer.concat(chunks));
    } catch { await reader.cancel().catch(() => {}); return null; }
  }
  return null;
}

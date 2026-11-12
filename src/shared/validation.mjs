/** Pure validation shared by the Electron main process and dependency-free tests. */
export function normalizeHttpsUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('URL non valido');
  const trimmed = value.trim();
  if (!trimmed) throw new Error('Inserisci un URL');
  const candidate = trimmed.includes('://') ? trimmed : `https://${trimmed}`;
  let url;
  try { url = new URL(candidate); } catch { throw new Error('URL non valido'); }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password ||
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname.toLowerCase())) {
    throw new Error('Sono consentiti solo URL HTTPS senza credenziali');
  }
  return url.toString();
}
export function validTitle(value) {
  if (typeof value !== 'string') throw new Error('Nome non valido');
  const title = value.trim();
  if (!title || title.length > 48) throw new Error('Il nome deve contenere da 1 a 48 caratteri');
  return title;
}
export function validBounds(value, maxWidth, maxHeight) {
  if (!value || typeof value !== 'object') return false;
  const { x, y, width, height } = value;
  if (![x, y, width, height].every(Number.isSafeInteger)) return false;
  return x >= 0 && y >= 0 && width >= 0 && height >= 0 && x + width <= maxWidth && y + height <= maxHeight;
}

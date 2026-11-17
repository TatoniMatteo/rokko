import { normalizeHttpsUrl } from './validation.mjs';
export function externalLink(value) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const decoded = decodeURIComponent(value);
    if ([...decoded].some(char => char.charCodeAt(0)<32 || char.charCodeAt(0)===127) || /%(?:0[\da-f]|1[\da-f]|7f)/i.test(decoded))
      return null;
    const url = new URL(value);
    if (url.protocol === 'https:') return { url: normalizeHttpsUrl(value), label: url.origin };
    if (
      url.protocol === 'http:' &&
      url.hostname &&
      !url.username &&
      !url.password &&
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname.toLowerCase())
    )
      return { url: url.href, label: url.origin };
    if (url.host || url.username || url.password) return null;
    if (url.protocol === 'mailto:') {
      const addresses = decodeURIComponent(url.pathname).split(',');
      if (
        addresses.length > 10 ||
        !addresses.every((value) =>
          /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(value),
        )
      )
        return null;
      if ([...url.searchParams.keys()].some((key) => key !== 'subject')) return null;
      return { url: url.href, label: 'mailto:' + addresses.join(',') };
    }
    if (
      url.protocol === 'tel:' &&
      /^\+?[0-9() .-]{3,40}$/.test(decodeURIComponent(url.pathname)) &&
      !url.search &&
      !url.hash
    )
      return { url: url.href, label: decoded };
  } catch {
    /* Unrecognized or malformed links are not handed to the operating system. */
  }
  return null;
}

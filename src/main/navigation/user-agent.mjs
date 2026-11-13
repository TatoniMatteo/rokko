// WhatsApp's browser check rejects Electron's additional product tokens.
// Keep the actual Chromium version and platform; leave other services unchanged.
export function serviceUserAgent(url, userAgent) {
  try {
    if (new URL(url).origin === 'https://web.whatsapp.com') {
      return userAgent.replace(/ (?:rokko|Electron)\/\S+/gi, '');
    }
  } catch { /* Invalid URLs do not receive compatibility overrides. */ }
  return userAgent;
}

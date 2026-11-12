export function loadError(code) {
  if (code === -106) return { title: 'You appear to be offline', message: 'Check your connection, then try again.' };
  if (code === -105 || code === -137) return { title: 'Website not found', message: 'Check the website address or try again later.' };
  if (code === -7 || code === -118) return { title: 'The website took too long', message: 'The service may be busy. Try again in a moment.' };
  if (code <= -200 && code >= -299) return { title: 'Secure connection failed', message: 'The website certificate could not be verified. Try again later or check the site in your browser.' };
  if (code === 'blocked') return { title: 'Navigation blocked', message: 'This destination is outside the allowed HTTPS navigation policy.' };
  return { title: 'Could not load this application', message: 'Check your connection and website address, then try again.' };
}

import { normalizeHttpsUrl } from './validation.mjs';

export function notificationOrigin(url) {
  try { return new URL(normalizeHttpsUrl(url)).origin; } catch { return null; }
}
export function validNotificationGrant(value, url) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string' || value !== notificationOrigin(url)) throw new Error('Review notification permission for this website');
  return value;
}
export function notificationAllowed(app, permission, requestingOrigin) {
  if (!app || permission !== 'notifications' || typeof app.notificationOrigin !== 'string') return false;
  const origin = notificationOrigin(app.url);
  return origin !== null && app.notificationOrigin === origin && notificationOrigin(requestingOrigin) === origin;
}

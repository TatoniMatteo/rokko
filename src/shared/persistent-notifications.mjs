import { notificationOrigin } from './notifications.mjs';

export function persistentRequest(value, origin) {
  if (!value || typeof value !== 'object' || !['show', 'list', 'close'].includes(value.action)) {
    throw new Error('Invalid notification request');
  }
  if (typeof value.scope !== 'string' || value.scope.length > 2048 || notificationOrigin(value.scope) !== origin) {
    throw new Error('Invalid notification scope');
  }
  const text = (value, limit) => {
    if (typeof value !== 'string' || value.length > limit) throw new Error('Invalid notification text');
    return value;
  };
  const result = { action: value.action, scope: value.scope, tag: text(value.tag ?? '', 128) };
  if (value.action === 'close') return { ...result, id: text(value.id, 64) };
  if (value.action !== 'show') return result;
  const data = text(value.data ?? 'null', 16384);
  JSON.parse(data);
  if (value.silent !== undefined && typeof value.silent !== 'boolean') throw new Error('Invalid notification options');
  if (value.requireInteraction !== undefined && typeof value.requireInteraction !== 'boolean') {
    throw new Error('Invalid notification options');
  }
  return { ...result, title: text(value.title, 256), body: text(value.body ?? '', 4096), data,
    silent: value.silent === true, requireInteraction: value.requireInteraction === true };
}

import data from './service-catalog.json' with { type: 'json' };
import { normalizeHttpsUrl, validTitle } from '../security/validation.mjs';

export function validateServiceCatalog(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.templates)) throw new Error('Invalid service catalog');
  const ids = new Set();
  const templates = value.templates.map(template => {
    if (!template || typeof template.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(template.id) ||
        ids.has(template.id) || typeof template.icon !== 'string' || !/^[A-Z0-9]$/.test(template.icon) ||
        Object.keys(template).some(key => !['id', 'name', 'url', 'icon', 'faviconUrl'].includes(key))) {
      throw new Error('Invalid service template');
    }
    ids.add(template.id);
    return Object.freeze({ id: template.id, name: validTitle(template.name),
      url: normalizeHttpsUrl(template.url), icon: template.icon,
      ...(template.faviconUrl === undefined ? {} : { faviconUrl: normalizeHttpsUrl(template.faviconUrl) }) });
  });
  return Object.freeze({ version: 1, templates: Object.freeze(templates) });
}

export const serviceCatalog = validateServiceCatalog(data);

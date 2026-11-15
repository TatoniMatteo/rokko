import data from './service-catalog.json' with { type: 'json' };
import { normalizeHttpsUrl, validTitle } from '../security/validation.mjs';

export const serviceCategories = Object.freeze([
  {id:'email',name:'Email'}, {id:'messaging',name:'Messaging'},
  {id:'calendar',name:'Calendars and meetings'}, {id:'files',name:'Documents and files'},
  {id:'productivity',name:'Notes and projects'}, {id:'ai',name:'AI and writing'},
  {id:'development',name:'Development'}, {id:'design',name:'Design'},
  {id:'social',name:'Social and media'}, {id:'other',name:'Other services'}
].map(category=>Object.freeze(category)));

export function validateServiceCatalog(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.templates) || value.templates.length > 100 || Object.keys(value).some(key => !['version','templates'].includes(key))) throw new Error('Invalid service catalog');
  const ids = new Set();
  const templates = value.templates.map(template => {
    if (!template || typeof template.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(template.id) ||
        ids.has(template.id) || typeof template.icon !== 'string' || !/^[A-Z0-9]$/.test(template.icon) ||
        Object.keys(template).some(key => !['id', 'name', 'url', 'icon', 'faviconUrl', 'category'].includes(key))) {
      throw new Error('Invalid service template');
    }
    const category = template.category ?? 'other';
    if (!serviceCategories.some(value => value.id === category)) throw new Error('Invalid service category');
    ids.add(template.id);
    return Object.freeze({ id: template.id, category, name: validTitle(template.name),
      url: normalizeHttpsUrl(template.url), icon: template.icon,
      ...(template.faviconUrl === undefined ? {} : { faviconUrl: normalizeHttpsUrl(template.faviconUrl) }) });
  });
  return Object.freeze({ version: 1, templates: Object.freeze(templates) });
}

export const serviceCatalog = validateServiceCatalog(data);

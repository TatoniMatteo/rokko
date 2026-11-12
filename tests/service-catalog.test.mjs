import test from 'node:test';
import assert from 'node:assert/strict';
import { serviceCatalog, validateServiceCatalog } from '../src/shared/service-catalog.mjs';

const template = { id: 'example', name: 'Example', url: 'https://example.com/', icon: 'E' };

test('starter catalog', () => {
  assert.equal(serviceCatalog.version, 1);
  assert.ok(serviceCatalog.templates.some(service => service.id === 'gmail'));
  assert.ok(serviceCatalog.templates.some(service => service.id === 'github'));
  assert.equal(new Set(serviceCatalog.templates.map(service => service.id)).size, serviceCatalog.templates.length);
  assert.ok(Object.isFrozen(serviceCatalog.templates));
  for (const service of serviceCatalog.templates) {
    assert.equal(new URL(service.url).protocol, 'https:');
    assert.ok(Object.isFrozen(service));
  }
});

test('rejects unsafe templates', () => {
  for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'http://example.com/', 'https://user:pass@example.com/']) {
    assert.throws(() => validateServiceCatalog({ version: 1, templates: [{ ...template, url }] }));
  }
  assert.throws(() => validateServiceCatalog({ version: 1, templates: [{ ...template, script: 'alert(1)' }] }));
  assert.throws(() => validateServiceCatalog({ version: 1, templates: [{ ...template, icon: 'https://example.com/icon.svg' }] }));
});

test('catalog validation', () => {
  for (const value of [null, {}, { version: 2, templates: [] }, { version: 1, templates: null },
    { version: 1, templates: [template, template] }, { version: 1, templates: [null] },
    { version: 1, templates: [{ ...template, id: '../invalid' }] },
    { version: 1, templates: [{ ...template, name: '' }] }]) {
    assert.throws(() => validateServiceCatalog(value));
  }
  const normalized = validateServiceCatalog({ version: 1, templates: [{ ...template, name: ' Example ', url: 'example.com' }] });
  assert.equal(normalized.templates[0].name, 'Example');
  assert.equal(normalized.templates[0].url, 'https://example.com/');
});

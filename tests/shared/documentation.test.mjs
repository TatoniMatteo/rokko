import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { guideSections, searchGuide } from '../../src/shared/documentation/guide.mjs';
const guide = name => guideSections(readFileSync(new URL(`../../.github/${name}`, import.meta.url), 'utf8'));
test('guide topics match across languages', () => {
  const it = guide('GUIDA-UTENTE.md'), en = guide('USER-GUIDE.md');
  assert.equal(it.length, en.length);
  assert.ok(it.length >= 12);
  for (const sections of [it, en]) {
    assert.equal(new Set(sections.map(section => section.id)).size, sections.length);
    for (const section of sections) assert.ok(section.title && section.body);
  }
});
test('search reads articles and ignores accents', () => {
  const sections = guide('GUIDA-UTENTE.md');
  assert.ok(searchGuide(sections, 'inattivita').some(section => section.body.includes('inattività')));
  assert.ok(searchGuide(sections, 'cookie sessioni').length);
  assert.equal(searchGuide(sections, 'zzzzzzzz').length, 0);
  assert.equal(searchGuide(sections, '  ').length, sections.length);
});

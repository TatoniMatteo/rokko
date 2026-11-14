import test from 'node:test';
import assert from 'node:assert/strict';
import { componentCss, paletteFromVariables, attached } from '../../scripts/design/figcraft.mjs';
const paint = color => [{ type: 'solid', color }];
const label = { type: 'TEXT', fontFamily: 'Onest', fontSize: 14, fontStyle: 'Bold', x: 16, fills: paint('#172334') };
const button = { height: 44, cornerRadius: 9, fills: paint('#245dc5'), strokes: paint('#245dc5'), strokeWeight: 1, children: [label] };
test('saved geometry changes CSS', () => {
  assert.match(componentCss({ primary: button }), /min-height:44px/);
  const css = componentCss({ primary: { ...button, height: 48, cornerRadius: 12 } });
  assert.match(css, /min-height:48px/); assert.match(css, /border-radius:12px/);
});
test('semantic colors stay dynamic', () => {
  const css = componentCss({ primary: { ...button, boundVariables: { fill: 'accent' } } }, { accent: { name: 'accent' } });
  assert.match(css, /background:var\(--accent\)/);
});
test('unsupported changes fail before output', () => {
  assert.throws(() => componentCss({ primary: { ...button, height: -1 } }), /height/);
  assert.throws(() => componentCss({ primary: { ...button, fills: [{ type: 'gradient' }] } }), /solid/);
  assert.throws(() => componentCss({ primary: { ...button, children: [{ ...label, fontFamily: 'Unknown' }] } }), /font/);
});
test('REST palette preserves both modes', () => {
  const palette = paletteFromVariables({ meta: {
    variableCollections: { 'VariableCollectionId:1': { modes: [{ modeId: '1', name: 'Chiaro' }, { modeId: '2', name: 'Scuro' }] } },
    variables: { a: { name: 'accent', variableCollectionId: 'VariableCollectionId:1', valuesByMode: { '1': { r: 0, g: 0.5, b: 1, a: 1 }, '2': '#aabbcc' } } }
  } });
  assert.equal(palette.light.accent, '#0080ff'); assert.equal(palette.dark.accent, '#aabbcc');
  assert.throws(() => paletteFromVariables({ variables: {}, variableCollections: {} }), /palette/);
});
test('card uses its content inset', () => {
  assert.match(componentCss({ card: { ...button, children: [{ ...label, x: 24 }] } }), /padding:24px/);
});
test('missing FigCraft does not hang', async () => {
  await assert.rejects(attached(7979, () => {}, '/rokko-nonexistent-figcraft'), /ENOENT/);
});
test('focus does not shift the label', () => {
  const css = componentCss({ primary: button, primaryFocus: { ...button, strokeWeight: 3 } });
  assert.match(css, /:focus-visible\{[^}]*border:1px solid/);
  assert.match(css, /box-shadow:inset 0 0 0 2px/);
});
test('asymmetric card spacing is preserved', () => {
  const css = componentCss({ card: { ...button, layout: { padding: [8, 16, 24, 32] } } });
  assert.match(css, /padding:8px 16px 24px 32px/);
});

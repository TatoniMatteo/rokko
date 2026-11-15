import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { themeTokens, accessibleTheme, contrast } from '../../src/shared/preferences/theme.mjs';

function check(tokens, label) {
  for (const surface of ['bg', 'panel', 'panel2', 'accent-container']) {
    for (const foreground of ['text', 'muted', 'accent', 'danger']) {
      assert.ok(
        contrast(tokens[foreground], tokens[surface]) >= 4.5,
        `${label}: ${foreground}/${surface}`,
      );
    }
    assert.ok(contrast(tokens.border, tokens[surface]) >= 3, `${label}: border/${surface}`);
  }
  assert.ok(contrast(tokens['on-accent'], tokens.accent) >= 4.5, `${label}: button label`);
}
test('contrast across the color space', () => {
  for (let red = 0; red <= 255; red += 51) {
    for (let green = 0; green <= 255; green += 51) {
      for (let blue = 0; blue <= 255; blue += 51) {
        const seed =
          '#' + [red, green, blue].map((value) => value.toString(16).padStart(2, '0')).join('');
        for (const dark of [false, true]) check(themeTokens(seed, dark), `${seed}/${dark}`);
      }
    }
  }
});
test('linked FigCraft palettes keep contrast', () => {
  const snapshot = JSON.parse(
    readFileSync(new URL('../../src/renderer/styles/generated/figcraft.json', import.meta.url)),
  );
  for (const dark of [false, true]) {
    check(
      accessibleTheme('#245dc5', dark, snapshot.palettes[dark ? 'dark' : 'light']),
      `FigCraft/${dark}`,
    );
  }
});

test('unsafe design surfaces fall back', () => {
  assert.deepEqual(
    accessibleTheme('#245dc5', false, { bg: '#000000', panel: '#ffffff' }),
    themeTokens('#245dc5', false),
  );
});

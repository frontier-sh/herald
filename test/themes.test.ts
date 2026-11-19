import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  CHANGELOG_THEMES,
  DEFAULT_THEME_ID,
  resolveThemeId,
  themeFontsHref,
} from '../src/services/themes.ts';

test('every theme id is unique and the default is registered', () => {
  const ids = CHANGELOG_THEMES.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes(DEFAULT_THEME_ID));
});

test('stored theme ids from earlier releases still resolve to themselves', () => {
  for (const id of ['herald', 'opencode', 'notion']) {
    assert.equal(resolveThemeId(id), id);
  }
});

test('unknown, empty or missing theme ids fall back to the default', () => {
  assert.equal(resolveThemeId('retro'), DEFAULT_THEME_ID);
  assert.equal(resolveThemeId(''), DEFAULT_THEME_ID);
  assert.equal(resolveThemeId(undefined), DEFAULT_THEME_ID);
  assert.equal(resolveThemeId(null), DEFAULT_THEME_ID);
});

test('only themes that need extra fonts load them', () => {
  assert.match(themeFontsHref('gazette') ?? '', /^https:\/\/fonts\.googleapis\.com\//);
  assert.equal(themeFontsHref('herald'), undefined);
  assert.equal(themeFontsHref('unknown'), undefined);
});

test('every non-default theme has a token block in the stylesheet', () => {
  const css = readFileSync(new URL('../src/client/styles/main.css', import.meta.url), 'utf8');
  for (const { id } of CHANGELOG_THEMES) {
    if (id === DEFAULT_THEME_ID) continue;
    assert.ok(
      css.includes(`.theme-thumb)[data-theme="${id}"] {`),
      `missing token block for theme "${id}"`,
    );
  }
});

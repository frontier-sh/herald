/**
 * Regression tests for the AI changelog parser and prompt.
 *
 * Run with: npm test  (node --test, native TypeScript — no extra deps).
 *
 * The headline case is `truncated JSON` — the exact failure that used to leave
 * the title unrenamed and dump a half-finished `{"title": ...` blob into the
 * changelog body.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSummary,
  buildSummarizationPrompt,
  buildSummarizationRequest,
  normalizeCategory,
  SUMMARY_CATEGORIES,
} from '../src/services/changelog-format.ts';
import { CATEGORIES } from '../src/db/schema.ts';

test('parses a clean JSON object', () => {
  const r = parseSummary('{"title": "Faster search", "body": "Search now returns results instantly."}');
  assert.equal(r.title, 'Faster search');
  assert.equal(r.content, 'Search now returns results instantly.');
});

test('parses JSON wrapped in ```json fences', () => {
  const r = parseSummary('```json\n{"title": "Dark mode", "body": "You can now switch to a dark theme."}\n```');
  assert.equal(r.title, 'Dark mode');
  assert.equal(r.content, 'You can now switch to a dark theme.');
});

test('parses JSON with leading prose before the object', () => {
  const r = parseSummary('Sure! Here is the entry:\n{"title": "Exports", "body": "Reports can be exported to CSV."}');
  assert.equal(r.title, 'Exports');
  assert.equal(r.content, 'Reports can be exported to CSV.');
});

test('maps a {"content": ...} variant to the body', () => {
  const r = parseSummary('{"title": "Logins", "content": "Sign-in is more reliable."}');
  assert.equal(r.title, 'Logins');
  assert.equal(r.content, 'Sign-in is more reliable.');
});

test('REGRESSION: truncated JSON (no closing brace) salvages title and clean body', () => {
  // Reproduces the reported bug: max_tokens cut the reply off mid-body, so the
  // JSON never closed. Old behaviour: title empty (kept commit subject) and the
  // raw `{"title": ...` string dumped as the body.
  const truncated =
    '{"title": "Search-aware product filters", "body": "Fixed an issue where the **Spend by Product** filters did not reflect the active search. The pickers now stay in sync as you narrow the';

  const r = parseSummary(truncated);

  // Title is recovered (so it is NOT left empty / unrenamed).
  assert.equal(r.title, 'Search-aware product filters');
  // Body is clean prose, never the raw JSON envelope.
  assert.ok(!r.content.startsWith('{'), 'body must not start with {');
  assert.ok(!r.content.includes('"title"'), 'body must not contain the JSON title key');
  assert.ok(!r.content.includes('"body"'), 'body must not contain the JSON body key');
  assert.ok(r.content.startsWith('Fixed an issue where'), 'body keeps the readable prose');
});

test('truncated JSON with escaped quotes in the body still decodes', () => {
  const truncated = '{"title": "Copy button", "body": "Added a \\"Copy\\" button so you can grab the value';
  const r = parseSummary(truncated);
  assert.equal(r.title, 'Copy button');
  assert.ok(r.content.startsWith('Added a "Copy" button'));
});

test('plain prose (no JSON) becomes the body with an empty title', () => {
  const r = parseSummary('We improved performance across the dashboard.');
  assert.equal(r.title, '');
  assert.equal(r.content, 'We improved performance across the dashboard.');
});

test('empty / whitespace input yields an empty entry', () => {
  assert.deepEqual(parseSummary(''), { title: '', content: '' });
  assert.deepEqual(parseSummary('   \n  '), { title: '', content: '' });
});

test('REGRESSION: request disables model reasoning so the answer is never starved to empty', () => {
  // Reproduces the reported "AI does nothing" bug: the default model (Kimi K2.6)
  // is a reasoning model whose hidden reasoning is billed against max_tokens. On
  // a large commit it spent the whole budget reasoning and returned an empty
  // body, which the queue then silently replaced with the raw commit. Disabling
  // thinking is what keeps the model answering directly.
  const request = buildSummarizationRequest({
    content: 'feat: add CSV export to reports',
    category: 'added',
    personality: 'neutral',
  }) as { chat_template_kwargs?: Record<string, unknown> };

  assert.equal(request.chat_template_kwargs?.thinking, false); // Kimi switch
  assert.equal(request.chat_template_kwargs?.enable_thinking, false); // Qwen/GLM switch
});

test('prompt instructs public-facing output, category choice, and the JSON shape', () => {
  const { system, user } = buildSummarizationPrompt({
    content: 'feat: add CSV export to reports',
    category: 'added',
    personality: 'neutral',
  });
  // Audience + privacy guardrails.
  assert.match(system, /public changelog/i);
  assert.match(system, /NEVER expose internal details/);
  assert.match(system, /no commit hashes/i);
  // The requested response shape now includes a category field.
  assert.match(system, /\{"title": "\.\.\.", "category": "\.\.\.", "body": "\.\.\."\}/);
  // The model is asked to choose a category and the allowed values are listed.
  assert.match(system, /Choose the single category/i);
  for (const cat of SUMMARY_CATEGORIES) {
    assert.match(system, new RegExp(`"${cat}"`));
  }
  // A provided category is only a hint the model may override.
  assert.match(system, /Suggested category \(you may override\): added/);
  assert.match(user, /add CSV export to reports/);
});

test('prompt omits the suggested-category hint when no category is provided', () => {
  const { system } = buildSummarizationPrompt({
    content: 'feat: add CSV export to reports',
  });
  assert.ok(!/Suggested category/.test(system), 'no hint line when category is absent');
  // It still asks the model to choose one.
  assert.match(system, /Choose the single category/i);
});

test('prompt includes product name and description as background context', () => {
  const { system } = buildSummarizationPrompt({
    content: 'feat: add CSV export to reports',
    projectName: 'Acme Analytics',
    projectDescription: 'A dashboard for tracking sales metrics.',
  });
  assert.match(system, /Product context/);
  assert.match(system, /Product name: Acme Analytics/);
  assert.match(system, /What it does: A dashboard for tracking sales metrics\./);
});

test('prompt omits the product context block when neither name nor description is set', () => {
  const { system } = buildSummarizationPrompt({
    content: 'feat: add CSV export to reports',
  });
  assert.ok(!/Product context/.test(system), 'no context block when product details are absent');
});

test('prompt includes only the product name when description is blank', () => {
  const { system } = buildSummarizationPrompt({
    content: 'feat: add CSV export to reports',
    projectName: 'Acme Analytics',
    projectDescription: '   ',
  });
  assert.match(system, /Product name: Acme Analytics/);
  assert.ok(!/What it does:/.test(system), 'no description line when description is blank');
});

test('parses a valid category from a clean object', () => {
  const r = parseSummary('{"title": "Faster search", "category": "fixed", "body": "Search is snappier."}');
  assert.equal(r.category, 'fixed');
});

test('normalizes category case-insensitively', () => {
  assert.equal(normalizeCategory('Fixed'), 'fixed');
  assert.equal(normalizeCategory('  SECURITY '), 'security');
});

test('an unknown or missing category yields undefined', () => {
  assert.equal(normalizeCategory('bugfix'), undefined);
  assert.equal(normalizeCategory(undefined), undefined);
  const r = parseSummary('{"title": "Faster search", "category": "bananas", "body": "Search is snappier."}');
  assert.equal(r.category, undefined);
  const noCat = parseSummary('{"title": "Faster search", "body": "Search is snappier."}');
  assert.equal(noCat.category, undefined);
});

test('salvages a category from truncated JSON', () => {
  const truncated =
    '{"title": "Search-aware filters", "category": "fixed", "body": "Fixed an issue where the filters did not reflect the active search and the';
  const r = parseSummary(truncated);
  assert.equal(r.title, 'Search-aware filters');
  assert.equal(r.category, 'fixed');
  assert.ok(r.content.startsWith('Fixed an issue where'));
});

test('SUMMARY_CATEGORIES stays in sync with the DB CATEGORIES enum', () => {
  // changelog-format.ts re-declares the list to stay import-free for node --test.
  // This guard makes sure it never drifts from the single source of truth.
  assert.deepEqual([...SUMMARY_CATEGORIES], [...CATEGORIES]);
});

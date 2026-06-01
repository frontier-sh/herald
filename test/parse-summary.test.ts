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
} from '../src/services/changelog-format.ts';

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

test('prompt instructs public-facing output and the JSON shape', () => {
  const { system, user } = buildSummarizationPrompt({
    content: 'feat: add CSV export to reports',
    category: 'added',
    personality: 'neutral',
  });
  // Audience + privacy guardrails.
  assert.match(system, /public changelog/i);
  assert.match(system, /NEVER expose internal details/);
  assert.match(system, /no commit hashes/i);
  // The requested response shape.
  assert.match(system, /\{"title": "\.\.\.", "body": "\.\.\."\}/);
  // Category is interpolated; the raw content rides in the user message.
  assert.match(system, /Category: added/);
  assert.match(user, /add CSV export to reports/);
});

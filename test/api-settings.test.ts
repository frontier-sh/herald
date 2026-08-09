import test from 'node:test';
import assert from 'node:assert/strict';

import { PER_APP_SETTING_KEYS } from '../src/services/settings.ts';

// GET/PUT /api/settings read and write ONLY the calling key's app_settings, and
// only the keys on this allowlist. These tests pin that contract: an API key is
// scoped to one app, so instance-wide settings must never be readable or
// writable through it.

const GLOBAL_SETTING_KEYS = ['ai_model', 'base_url', 'onboarding_completed'];

test('the API settings allowlist excludes every global setting', () => {
  for (const key of GLOBAL_SETTING_KEYS) {
    assert.equal(
      PER_APP_SETTING_KEYS.includes(key),
      false,
      `${key} is global and must not be exposed via /api/settings`,
    );
  }
});

test('the API settings allowlist covers the per-app keys the API must serve', () => {
  // Spot-check the ones GitHub Actions users and the admin UI depend on.
  for (const key of [
    'project_name',
    'project_description',
    'auto_publish',
    'ai_enabled',
    'ai_personality',
    'slack_webhook_url',
    'slack_notifications_enabled',
    'source_repo',
  ]) {
    assert.ok(PER_APP_SETTING_KEYS.includes(key), `${key} should be settable per app`);
  }
});

test('filtering a settings payload through the allowlist drops unknown keys', () => {
  // Mirrors the PUT /api/settings loop: allowlisted keys are applied, anything
  // else (global or unrecognised) is ignored rather than rejecting the request.
  const payload: Record<string, string> = {
    project_name: 'Tiller',
    ai_enabled: 'true',
    ai_model: 'some-global-model',
    nonsense: 'x',
  };
  const applied = Object.keys(payload).filter((k) => PER_APP_SETTING_KEYS.includes(k));
  assert.deepEqual(applied, ['project_name', 'ai_enabled']);
});

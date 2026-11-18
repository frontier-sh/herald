import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AI_MODELS,
  DEFAULT_AI_MODEL,
  modelRequestParams,
  resolveModelId,
} from '../src/services/models.ts';
import { buildSummarizationRequest } from '../src/services/changelog-format.ts';

// Models Herald used to offer that Cloudflare has since retired. Requests to a
// retired model fail with HTTP 410, so none may come back into the registry,
// and a stored setting naming one must fall back to the current default.
const RETIRED_MODEL_IDS = [
  '@cf/moonshotai/kimi-k2.6', // retired 2026-11-20
  '@cf/qwen/qwen3-30b-a3b-fp8', // retired 2026-11-20
  '@cf/meta/llama-3.1-8b-instruct-fast', // gone from the catalog
];

test('the registry offers no retired Workers AI models', () => {
  const ids = AI_MODELS.map((m) => m.id);
  for (const id of RETIRED_MODEL_IDS) {
    assert.equal(ids.includes(id), false, `${id} is retired and must not be offered`);
  }
  assert.equal(new Set(ids).size, ids.length, 'model ids must be unique');
});

test('a stored retired model resolves to the current default', () => {
  for (const id of RETIRED_MODEL_IDS) {
    assert.equal(resolveModelId(id), DEFAULT_AI_MODEL.id);
  }
  assert.equal(resolveModelId(''), DEFAULT_AI_MODEL.id);
  assert.equal(resolveModelId(undefined), DEFAULT_AI_MODEL.id);
});

test('reasoning_effort is only sent to models that accept it', () => {
  // GLM-4.7 Flash rejects reasoning_effort with a 400 "Invalid input".
  assert.deepEqual(modelRequestParams('@cf/zai-org/glm-4.7-flash'), {});
  // GLM-5.3 can't disable reasoning: "none" silently maps to "max".
  assert.equal(modelRequestParams('@cf/zai-org/glm-5.3').reasoning_effort, 'low');
  assert.deepEqual(modelRequestParams('not-a-model'), {});
});

test('per-model params are merged into the summarization request', () => {
  const request = buildSummarizationRequest({
    content: 'feat: add CSV export to reports',
    modelParams: modelRequestParams('@cf/deepseek-ai/deepseek-v4.1-flash-1017'),
  }) as Record<string, unknown>;
  assert.equal(request.reasoning_effort, 'none');
  assert.ok(request.messages, 'the base request is preserved');
});

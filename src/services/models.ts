/**
 * Central registry of available Cloudflare Workers AI models.
 *
 * Every place that needs to reference a model identifier or present the list of
 * models to the user should import from here so there is a single source of truth.
 *
 * Keep this list in step with the Workers AI catalog
 * (https://developers.cloudflare.com/workers-ai/models/). Cloudflare retires
 * models on a schedule; requests to a retired model fail with HTTP 410. A stored
 * `ai_model` setting that no longer appears here falls back to the default via
 * resolveModelId(), so dropping a retired entry migrates installs automatically.
 */

export interface AIModel {
  /** The Cloudflare Workers AI model identifier, e.g. `@cf/zai-org/glm-4.7-flash`. */
  id: string;
  /** Human-readable label shown in the UI. */
  label: string;
  /**
   * Extra request parameters this model needs, merged into every call.
   *
   * Used for `reasoning_effort`, which isn't safe to send to every model:
   * GLM-4.7 Flash rejects it with a 400, and GLM-5.3 maps `"none"` to `"max"`
   * because its reasoning can't be turned off. Set it only per model, and only
   * after checking the model page for the supported levels.
   */
  requestParams?: Readonly<Record<string, unknown>>;
}

/**
 * Ordered list of available models.  The first entry is the default.
 */
export const AI_MODELS: readonly AIModel[] = [
  {
    id: '@cf/deepseek-ai/deepseek-v4.1-flash-1017',
    label: 'DeepSeek V4.1 Flash',
    requestParams: { reasoning_effort: 'none' },
  },
  {
    id: '@cf/zai-org/glm-5.3',
    label: 'GLM-5.3',
    // Reasoning can't be disabled and defaults to "max" (~1,300 tokens per entry).
    requestParams: { reasoning_effort: 'low' },
  },
  {
    id: '@cf/thinkingmachines/inkling-2-small',
    label: 'Inkling 2 Small (Workers Paid plan)',
    requestParams: { reasoning_effort: 'none' },
  },
  {
    id: '@cf/qwen/qwen3.8-27b',
    label: 'Qwen3.8 27B',
  },
  {
    id: '@cf/google/gemma-4-26b-a4b-it',
    label: 'Gemma 4 26B IT',
  },
  {
    id: '@cf/zai-org/glm-4.7-flash',
    label: 'GLM-4.7 Flash',
  },
  {
    id: '@cf/meta/llama-4-scout-17b-16e-instruct',
    label: 'Llama 4 Scout 17B Instruct',
  },
  {
    id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    label: 'Llama 3.3 70B Instruct FP8 Fast',
  },
] as const;

/** The default model (first in the list). */
export const DEFAULT_AI_MODEL: AIModel = AI_MODELS[0];

/** Lookup of registered models by ID. */
const modelsById = new Map<string, AIModel>(AI_MODELS.map((m) => [m.id, m]));

/**
 * Return `value` if it is a recognised model ID, otherwise fall back to the
 * default model ID.  Useful when reading a setting from the database that may
 * contain a stale or empty value.
 */
export function resolveModelId(value: string | undefined | null): string {
  if (value && modelsById.has(value)) {
    return value;
  }
  return DEFAULT_AI_MODEL.id;
}

/**
 * The per-model request parameters for `modelId` (see AIModel.requestParams),
 * or an empty object for models that need none.
 */
export function modelRequestParams(modelId: string): Record<string, unknown> {
  return { ...modelsById.get(modelId)?.requestParams };
}

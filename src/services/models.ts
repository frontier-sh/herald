/**
 * Central registry of available Cloudflare Workers AI models.
 *
 * Every place that needs to reference a model identifier or present the list of
 * models to the user should import from here so there is a single source of truth.
 */

export interface AIModel {
  /** The Cloudflare Workers AI model identifier, e.g. `@cf/zai-org/glm-4.7-flash`. */
  id: string;
  /** Human-readable label shown in the UI. */
  label: string;
}

/**
 * Ordered list of available models.  The first entry is the default.
 */
export const AI_MODELS: readonly AIModel[] = [
  {
    id: '@cf/moonshotai/kimi-k2.6',
    label: 'Kimi K2.6',
  },
  {
    id: '@cf/google/gemma-4-26b-a4b-it',
    label: 'Gemma 4 26B IT',
  },
  {
    id: '@cf/meta/llama-4-scout-17b-16e-instruct',
    label: 'Llama 4 Scout 17B Instruct',
  },
  {
    id: '@cf/zai-org/glm-4.7-flash',
    label: 'GLM-4.7 Flash',
  },
  {
    id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    label: 'Llama 3.3 70B Instruct FP8 Fast',
  },
  {
    id: '@cf/meta/llama-3.1-8b-instruct-fast',
    label: 'Llama 3.1 8B Instruct Fast',
  },
  {
    id: '@cf/google/gemma-3-12b-it',
    label: 'Gemma 3 12B IT',
  },
  {
    id: '@cf/qwen/qwen3-30b-a3b-fp8',
    label: 'Qwen3 30B A3B FP8',
  },
] as const;

/** The default model (first in the list). */
export const DEFAULT_AI_MODEL: AIModel = AI_MODELS[0];

/** Set of valid model IDs for quick validation. */
const validModelIds = new Set<string>(AI_MODELS.map((m) => m.id));

/**
 * Return `value` if it is a recognised model ID, otherwise fall back to the
 * default model ID.  Useful when reading a setting from the database that may
 * contain a stale or empty value.
 */
export function resolveModelId(value: string | undefined | null): string {
  if (value && validModelIds.has(value)) {
    return value;
  }
  return DEFAULT_AI_MODEL.id;
}
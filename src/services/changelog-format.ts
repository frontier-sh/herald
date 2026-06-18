/**
 * Pure prompt-building and response-parsing logic for AI changelog generation.
 *
 * This module deliberately has NO imports so it can be unit-tested directly with
 * `node --test` (native TypeScript) without pulling in the Workers AI runtime.
 * The Workers AI call itself lives in ./ai.
 */

/**
 * The categories the AI is allowed to pick from.
 *
 * Must stay in sync with `CATEGORIES` in ../db/schema. We re-declare them here
 * (rather than import) so this module keeps its zero-import property and can be
 * unit-tested directly with `node --test`. A guard test in
 * test/parse-summary.test.ts asserts the two lists never drift.
 */
export const SUMMARY_CATEGORIES = [
  'added',
  'changed',
  'fixed',
  'removed',
  'deprecated',
  'security',
] as const;

/**
 * Validate/normalise a model-supplied category. Returns the canonical
 * lower-case value when it's one of SUMMARY_CATEGORIES, otherwise `undefined`
 * so callers can fall back to the existing category.
 */
export function normalizeCategory(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  return (SUMMARY_CATEGORIES as readonly string[]).includes(normalized)
    ? normalized
    : undefined;
}

/** A polished changelog entry produced by the AI. */
export interface SummarizedEntry {
  /** Rewritten, user-facing headline. Empty when the AI didn't provide one. */
  title: string;
  /** The changelog entry body in Markdown. */
  content: string;
  /**
   * The category the AI picked, validated against SUMMARY_CATEGORIES.
   * `undefined` when the model omitted it or returned an unknown value.
   */
  category?: string;
}

/** The system + user messages sent to the model. */
export interface PromptParts {
  system: string;
  user: string;
}

/** Tone guidance keyed by the `ai_personality` setting. */
const PERSONALITY_INSTRUCTIONS: Record<string, string> = {
  neutral: 'Write in a clear, straightforward tone.',
  professional: 'Write in a formal, polished, corporate tone.',
  casual: 'Write in a friendly, conversational tone. Keep it light and approachable.',
};

/**
 * Build the exact prompt used to turn raw commit messages into a public-facing
 * changelog entry. Exported so the local harness and tests exercise the same
 * prompt the queue worker uses in production (no drift).
 */
export function buildSummarizationPrompt(opts: {
  content: string;
  category?: string;
  personality?: string;
}): PromptParts {
  const toneInstruction =
    PERSONALITY_INSTRUCTIONS[opts.personality || 'neutral'] || PERSONALITY_INSTRUCTIONS.neutral;

  // An optional hint the model may override — never a hard constraint.
  const hint = normalizeCategory(opts.category);
  const hintLine = hint ? `\nSuggested category (you may override): ${hint}` : '';

  const system = `You are writing a public changelog for the end users of a software product.
Your readers are customers, not engineers — most have never seen the code. Turn the raw commit messages or notes below into a single short, friendly changelog entry that tells users what changed and why it helps them.

Tone: ${toneInstruction}${hintLine}

Choose the single category that best fits the change, from exactly these values:
- "added": a new feature or capability users didn't have before.
- "changed": an existing feature behaves differently or was improved.
- "fixed": a bug or broken behaviour was corrected.
- "removed": a feature or option was taken away.
- "deprecated": a feature still works but is being phased out.
- "security": a security issue was addressed.

Respond with ONLY a JSON object, no Markdown fences or extra prose, in exactly this shape:
{"title": "...", "category": "...", "body": "..."}

- "title": a short, benefit-focused headline of 8 words or fewer. Rewrite it from the user's point of view — never reuse the raw commit subject. No trailing period.
- "category": one of added, changed, fixed, removed, deprecated, security.
- "body": 1-3 short sentences of plain prose, in Markdown.

Rules:
- Write for non-technical users, in past tense.
- Describe the visible change and how it benefits users — not how it was built.
- NEVER expose internal details: no file, class, function, table, column, or variable names; no commit hashes; no ticket or issue IDs (e.g. ES2-288, #161); no library, framework, service, or infrastructure names.
- Don't mention tests, refactors, or internal cleanup users can't see. If a change is purely internal, summarise its user-visible effect or keep it very general.
- Keep it brief. Merge related changes into one coherent entry.`;

  const user = `Summarize these changes into a polished, user-facing changelog entry:\n\n${opts.content}`;

  return { system, user };
}

/**
 * Token budget for a summarization. Reasoning is disabled (see
 * DISABLE_THINKING) so the model answers directly in ~100-200 tokens; the
 * generous cap is just headroom for a long multi-paragraph body and costs
 * nothing extra when unused.
 */
export const SUMMARIZATION_MAX_TOKENS = 8192;

/**
 * Disable the model's extended "thinking" / reasoning phase.
 *
 * Reasoning models (the default Kimi K2.6, plus Qwen3 and GLM in the registry)
 * emit hidden reasoning BEFORE the answer, and that reasoning is billed against
 * the same `max_tokens` budget. On a large commit the reasoning can consume the
 * entire budget, so the model is cut off (`finish_reason: "length"`) before it
 * writes a single character of the answer — yielding an empty reply that the
 * caller then silently replaced with the raw commit (the "AI does nothing" bug).
 *
 * Reformatting a commit into a one-line changelog needs no chain-of-thought, so
 * we turn it off: `thinking` is Kimi's switch and `enable_thinking` is the
 * Qwen/GLM equivalent. Models that don't recognise these keys ignore them, so
 * it is safe to send to every model in the registry.
 */
export const DISABLE_THINKING = { thinking: false, enable_thinking: false } as const;

/**
 * JSON-mode schema constraining the model to a {title, category, body} object.
 * `category` is `required` and constrained to the allowed values so models that
 * honour JSON mode always emit a valid category (constrained decoding won't let
 * them skip it). The parser stays tolerant for models that don't — a missing or
 * unknown category just falls back to the entry's existing one rather than
 * failing the whole generation.
 */
export const SUMMARIZATION_RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      category: { type: 'string', enum: [...SUMMARY_CATEGORIES] },
      body: { type: 'string' },
    },
    required: ['title', 'category', 'body'],
  },
} as const;

/**
 * The full Workers AI request body for a summarization (everything except the
 * model id). Shared by the production call and the local harness so they send
 * byte-identical requests.
 */
export function buildSummarizationRequest(opts: {
  content: string;
  category?: string;
  personality?: string;
}) {
  const { system, user } = buildSummarizationPrompt(opts);
  return {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    max_tokens: SUMMARIZATION_MAX_TOKENS,
    response_format: SUMMARIZATION_RESPONSE_FORMAT,
    // Reasoning is billed against max_tokens and can starve the answer to empty
    // on large commits — turn it off (see DISABLE_THINKING).
    chat_template_kwargs: DISABLE_THINKING,
  };
}

/**
 * Extract the text content from a Workers AI response.
 *
 * Older/smaller models return `{ response: string }` while newer models using
 * the OpenAI-compatible endpoint return
 * `{ choices: [{ message: { content: string } }] }`.  This helper handles both
 * shapes so callers don't have to worry about it.
 */
export function extractAIText(response: unknown): string {
  if (response == null) return '';
  if (typeof response === 'string') return response;

  const res = response as Record<string, unknown>;

  // Legacy shape: { response: string }
  if (typeof res.response === 'string') {
    return res.response;
  }

  // OpenAI-compatible shape: { choices: [{ message: { content: string } }] }
  if (Array.isArray(res.choices) && res.choices.length > 0) {
    const choice = res.choices[0] as any;
    const content = choice?.message?.content ?? choice?.text;
    if (typeof content === 'string') {
      return content;
    }
  }

  // Some models nest the payload (e.g. { result: {...} } or { response: {...} }).
  for (const nested of [res.result, res.response]) {
    if (nested && typeof nested === 'object') {
      const text = extractAIText(nested);
      if (text) return text;
    }
  }

  // Other single-string fields seen across models.
  for (const key of ['output_text', 'text', 'content', 'generated_text']) {
    if (typeof res[key] === 'string') return res[key] as string;
  }

  // Never stringify a raw object — that yields "[object Object]" in the UI.
  return '';
}

/** Build a SummarizedEntry from a plain object if it carries a title/body. */
function objectToSummary(obj: Record<string, unknown>): SummarizedEntry | null {
  const title = typeof obj.title === 'string' ? obj.title.trim() : '';
  const body =
    typeof obj.body === 'string'
      ? obj.body.trim()
      : typeof obj.content === 'string'
        ? obj.content.trim()
        : '';
  const category = normalizeCategory(obj.category);
  if (title || body) return { title, content: body, category };
  return null;
}

/**
 * Some models honour `response_format` and return the parsed object directly
 * (commonly under `response` or `result`) instead of a JSON string. Pull a
 * title/body out of those shapes; returns null so callers fall back to text.
 */
export function extractStructuredSummary(response: unknown): SummarizedEntry | null {
  if (!response || typeof response !== 'object') return null;
  const res = response as Record<string, unknown>;
  for (const candidate of [res, res.response, res.result]) {
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      const summary = objectToSummary(candidate as Record<string, unknown>);
      if (summary) return summary;
    }
  }
  return null;
}

/**
 * Turn a raw Workers AI response (binding shape `{response|choices...}` or REST
 * shape `{...}` already unwrapped from `result`) into a SummarizedEntry. Prefers
 * a directly-parsed JSON-mode object, then falls back to parsing the text reply.
 */
export function coerceSummary(response: unknown): SummarizedEntry {
  return extractStructuredSummary(response) ?? parseSummary(extractAIText(response));
}

/**
 * Parse the model's reply into a title and body. Models don't always honour the
 * requested JSON shape, so this is defensive:
 *  1. parse a clean `{ ... }` object;
 *  2. salvage the fields from malformed/truncated JSON (the failure mode that
 *     used to leak raw `{"title": ...` text into the changelog);
 *  3. otherwise treat the reply as plain prose — but never dump raw JSON.
 */
export function parseSummary(text: string): SummarizedEntry {
  const trimmed = (text || '').trim();
  if (!trimmed) return { title: '', content: '' };

  // 1. Clean JSON object.
  const jsonText = extractJsonObject(trimmed);
  if (jsonText) {
    try {
      const summary = objectToSummary(JSON.parse(jsonText) as Record<string, unknown>);
      if (summary) return summary;
    } catch {
      // Not valid JSON — fall through to salvage/plain-text handling.
    }
  }

  // 2. Looks like JSON but didn't parse (e.g. truncated before the closing
  //    brace). Salvage the fields rather than leaking the raw braces.
  if (/"(?:title|body|content)"\s*:/.test(trimmed)) {
    const salvaged = salvageJsonFields(trimmed);
    if (salvaged) return salvaged;
    // Unsalvageable JSON — better an empty entry than raw JSON in the changelog.
    return { title: '', content: '' };
  }

  // 3. Plain prose.
  return { title: '', content: trimmed };
}

/** Pull the outermost `{ ... }` out of a reply, stripping ```json fences. */
export function extractJsonObject(text: string): string | null {
  const unfenced = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '');
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start !== -1 && end > start) {
    return unfenced.slice(start, end + 1);
  }
  return null;
}

/** Decode a captured JSON string body (handles \n, \", \\ etc.). */
function unescapeJsonString(s: string): string {
  try {
    return JSON.parse(`"${s}"`);
  } catch {
    return s
      .replace(/\\"/g, '"')
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\\\/g, '\\');
  }
}

/**
 * Best-effort extraction of title/body from malformed or truncated JSON. The
 * body capture tolerates a missing closing quote (a reply cut off mid-body), so
 * a truncated response still yields a clean title and partial body instead of
 * dumping the raw `{"title": ...` string into the entry.
 */
function salvageJsonFields(text: string): SummarizedEntry | null {
  const titleMatch = text.match(/"title"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  const title = titleMatch ? unescapeJsonString(titleMatch[1]).trim() : '';

  const categoryMatch = text.match(/"category"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  const category = categoryMatch ? normalizeCategory(categoryMatch[1]) : undefined;

  const bodyMatch = text.match(/"(?:body|content)"\s*:\s*"((?:[^"\\]|\\.)*)"?/);
  let body = '';
  if (bodyMatch) {
    body = unescapeJsonString(bodyMatch[1])
      .replace(/\\+$/, '') // drop a dangling backslash from a cut-off escape
      .trim();
  }

  if (title || body) return { title, content: body, category };
  return null;
}

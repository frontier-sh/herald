/**
 * AI service for generating polished changelog entries using Cloudflare Workers AI.
 */

import { resolveModelId } from './models';

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

interface SummarizeMessage {
  type: 'summarize';
  entryId: number;
  rawContent: string;
  timestamp: number;
}

/**
 * Enqueue an entry for AI summarization via Cloudflare Queues.
 */
export async function enqueueAISummarization(
  queue: Queue,
  entryId: number,
  rawContent: string,
): Promise<void> {
  await queue.send({
    type: 'summarize',
    entryId,
    rawContent,
    timestamp: Date.now(),
  } satisfies SummarizeMessage);
}

/** A polished changelog entry produced by the AI. */
export interface SummarizedEntry {
  /** Rewritten, user-facing headline. Empty when the AI didn't provide one. */
  title: string;
  /** The changelog entry body in Markdown. */
  content: string;
}

/**
 * Generate a polished changelog entry (title + body) from raw content using
 * Workers AI. The AI both rewrites the headline and cleans up the body; if it
 * fails to return a usable title, `title` comes back empty so callers can keep
 * the existing one.
 */
export async function summarizeContent(
  ai: Ai,
  content: string,
  category: string,
  model?: string,
  personality?: string,
): Promise<SummarizedEntry> {
  const personalityInstructions: Record<string, string> = {
    neutral: 'Write in a clear, straightforward tone.',
    professional: 'Write in a formal, polished, corporate tone. Use precise technical language.',
    casual: 'Write in a friendly, conversational tone. Keep it light and approachable.',
  };

  const toneInstruction = personalityInstructions[personality || 'neutral'] || personalityInstructions['neutral'];

  const systemPrompt = `You are a technical writer creating changelog entries.
Given raw commit messages or notes, create a clear, concise changelog entry.
Category: ${category}
Tone: ${toneInstruction}

Respond with ONLY a JSON object, no Markdown fences or extra prose, in exactly this shape:
{"title": "...", "body": "..."}

- "title": a short, user-facing headline (roughly 8 words or fewer). Rewrite it to be clear and benefit-focused; do not just copy the commit subject. No trailing period.
- "body": the changelog entry in Markdown.

Rules for the body:
- Write in past tense
- Be concise but informative
- Use Markdown formatting
- Focus on what changed and why it matters to users
- Don't include commit hashes or internal references
- Group related changes if there are multiple`;

  const response = await ai.run(
    resolveModelId(model) as any,
    {
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Summarize these changes into a polished changelog entry:\n\n${content}`,
        },
      ],
      max_tokens: 600,
    },
  );

  return parseSummary(extractAIText(response));
}

/**
 * Parse the model's reply into a title and body. Models don't always honour the
 * requested JSON shape, so this is defensive: it strips code fences, extracts
 * the outermost `{ ... }`, and falls back to treating the whole reply as the
 * body (with an empty title) when no usable JSON is found.
 */
function parseSummary(text: string): SummarizedEntry {
  const trimmed = (text || '').trim();
  const jsonText = extractJsonObject(trimmed);
  if (jsonText) {
    try {
      const obj = JSON.parse(jsonText) as Record<string, unknown>;
      const title = typeof obj.title === 'string' ? obj.title.trim() : '';
      const body =
        typeof obj.body === 'string'
          ? obj.body.trim()
          : typeof obj.content === 'string'
            ? obj.content.trim()
            : '';
      if (title || body) {
        return { title, content: body };
      }
    } catch {
      // Not valid JSON — fall through to plain-text handling.
    }
  }
  return { title: '', content: trimmed };
}

/** Pull the outermost `{ ... }` out of a reply, stripping ```json fences. */
function extractJsonObject(text: string): string | null {
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

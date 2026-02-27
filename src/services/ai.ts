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

  const res = response as Record<string, unknown>;

  // Legacy shape: { response: string }
  if (typeof res.response === 'string') {
    return res.response;
  }

  // OpenAI-compatible shape: { choices: [{ message: { content: string } }] }
  if (Array.isArray(res.choices) && res.choices.length > 0) {
    const content = (res.choices[0] as any)?.message?.content;
    if (typeof content === 'string') {
      return content;
    }
  }

  // Last resort – stringify whatever we got back
  return String(response);
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

/**
 * Generate a polished changelog entry from raw content using Workers AI.
 */
export async function summarizeContent(
  ai: Ai,
  content: string,
  category: string,
  model?: string,
): Promise<string> {
  const systemPrompt = `You are a technical writer creating changelog entries.
Given raw commit messages or notes, create a clear, concise changelog entry.
Category: ${category}
Rules:
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
      max_tokens: 500,
    },
  );

  return extractAIText(response);
}

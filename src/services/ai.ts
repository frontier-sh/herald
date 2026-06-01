/**
 * AI service for generating polished changelog entries using Cloudflare Workers AI.
 *
 * The pure prompt-building and response-parsing logic lives in ./changelog-format
 * so it can be unit-tested without the Workers AI runtime. This module owns the
 * actual `env.AI` call and the queue plumbing.
 */

import { resolveModelId } from './models';
import {
  buildSummarizationRequest,
  coerceSummary,
  type SummarizedEntry,
} from './changelog-format';

// Re-export the formatting helpers/types so existing importers of `./ai` keep working.
export { extractAIText, parseSummary, buildSummarizationPrompt } from './changelog-format';
export type { SummarizedEntry, PromptParts } from './changelog-format';

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
  const request = buildSummarizationRequest({ content, category, personality });

  // JSON mode constrains the model to valid {title, body}; the generous token
  // budget keeps large commits from truncating mid-reply. coerceSummary() is the
  // defensive parser for models that don't fully honour either.
  const response = await ai.run(resolveModelId(model) as any, request as any);

  return coerceSummary(response);
}

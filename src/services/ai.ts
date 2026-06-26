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
  // Set when this entry will be covered by a consolidated release notification,
  // so the queue worker skips the per-entry Slack message and avoids a duplicate.
  suppressEntryNotify?: boolean;
}

/**
 * Enqueue an entry for AI summarization via Cloudflare Queues.
 */
export async function enqueueAISummarization(
  queue: Queue,
  entryId: number,
  rawContent: string,
  suppressEntryNotify = false,
): Promise<void> {
  await queue.send({
    type: 'summarize',
    entryId,
    rawContent,
    timestamp: Date.now(),
    suppressEntryNotify,
  } satisfies SummarizeMessage);
}

/**
 * Generate a polished changelog entry (title + category + body) from raw
 * content using Workers AI. The AI rewrites the headline, cleans up the body,
 * and picks the most fitting category. `category` here is only an optional hint
 * (e.g. the entry's current category) the model may override; if the AI fails
 * to return a usable title or category, those come back empty/undefined so
 * callers can keep the existing values.
 */
export async function summarizeContent(
  ai: Ai,
  content: string,
  category?: string,
  model?: string,
  personality?: string,
  projectName?: string,
  projectDescription?: string,
): Promise<SummarizedEntry> {
  const request = buildSummarizationRequest({
    content,
    category,
    personality,
    projectName,
    projectDescription,
  });
  const modelId = resolveModelId(model);

  // JSON mode constrains the model to valid {title, body}; reasoning is disabled
  // so the answer can't be starved to empty by the token budget. coerceSummary()
  // is the defensive parser for models that don't fully honour either.
  let summary = coerceSummary(await ai.run(modelId as any, request as any));

  // A genuinely empty reply should be rare now, but it can still happen (a model
  // refusing, or an occasional blank). Retry once before giving up so a one-off
  // empty response doesn't surface as a failed generation.
  if (!summary.content.trim()) {
    summary = coerceSummary(await ai.run(modelId as any, request as any));
  }

  return summary;
}

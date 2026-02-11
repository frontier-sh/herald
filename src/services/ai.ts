/**
 * AI service for generating polished changelog entries using Cloudflare Workers AI.
 */

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
    (model || '@cf/meta/llama-4-scout-17b-16e-instruct') as any,
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

  // The AI response shape depends on the model, typically { response: string }
  return (response as any).response || String(response);
}

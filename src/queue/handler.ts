import type { Bindings } from '../bindings';
import { summarizeContent } from '../services/ai';
import { purgePublicCache, purgeReleasePages } from '../services/cache';
import { getReleaseVersionsForEntry } from '../services/releases';

interface QueueMessage {
  type: 'summarize';
  entryId: number;
  rawContent: string;
  timestamp: number;
}

export async function handleQueue(
  batch: MessageBatch<QueueMessage>,
  env: Bindings,
): Promise<void> {
  for (const message of batch.messages) {
    const { type, entryId, rawContent } = message.body;

    if (type !== 'summarize') {
      message.ack();
      continue;
    }

    try {
      // Mark as processing
      await env.DB.prepare(
        'UPDATE entries SET ai_status = ? WHERE id = ?',
      ).bind('processing', entryId).run();

      // Get the entry's current title/category and the AI model setting
      const entry = await env.DB.prepare(
        'SELECT title, category FROM entries WHERE id = ?',
      ).bind(entryId).first();

      const modelSetting = await env.DB.prepare(
        "SELECT value FROM settings WHERE key = 'ai_model'",
      ).first();

      const personalitySetting = await env.DB.prepare(
        "SELECT value FROM settings WHERE key = 'ai_personality'",
      ).first();

      if (!entry) {
        message.ack();
        continue;
      }

      // Run AI summarization (rewrites both the title and the body)
      const summary = await summarizeContent(
        env.AI,
        rawContent,
        entry.category as string,
        modelSetting?.value as string,
        (personalitySetting?.value as string) || 'neutral',
      );

      // Keep the existing title/content when the AI returns nothing usable.
      const title = summary.title || (entry.title as string);
      const content = summary.content || rawContent;

      // Update entry with AI-generated title and content
      await env.DB.prepare(
        'UPDATE entries SET title = ?, content = ?, ai_status = ?, updated_at = datetime(?) WHERE id = ?',
      ).bind(title, content, 'completed', new Date().toISOString(), entryId).run();

      // Purge cached public pages so the new content is visible
      if (env.BASE_URL) {
        const versions = await getReleaseVersionsForEntry(env.DB, entryId);
        await Promise.all([
          purgePublicCache(env.BASE_URL),
          purgeReleasePages(env.BASE_URL, versions),
        ]);
      }

      message.ack();
    } catch (error) {
      console.error(`AI processing failed for entry ${entryId}:`, error);

      // Mark as failed
      await env.DB.prepare(
        'UPDATE entries SET ai_status = ? WHERE id = ?',
      ).bind('failed', entryId).run();

      // Retry by not acking (will be retried by the queue)
      message.retry();
    }
  }
}

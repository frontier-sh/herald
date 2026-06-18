import type { Bindings } from '../bindings';
import { summarizeContent } from '../services/ai';
import { purgePublicCache, purgeReleasePages } from '../services/cache';
import { getReleaseVersionsForEntry } from '../services/releases';
import { getSetting } from '../services/settings';
import { BASE_URL_SETTING } from '../middleware/base-url';

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

      // If the AI produced no usable body, do NOT silently write the raw commit
      // back and mark it "completed" — that looks like a successful no-op to the
      // user (the reported "AI does nothing" bug). Mark it failed instead: the
      // UI shows an "AI Failed" badge plus a Regenerate button, and the existing
      // content is left untouched so the entry isn't blank.
      if (!summary.content.trim()) {
        await env.DB.prepare(
          'UPDATE entries SET ai_status = ? WHERE id = ?',
        ).bind('failed', entryId).run();
        message.ack();
        continue;
      }

      // The body is rewritten; keep the existing title only if the AI didn't
      // give us a better one.
      const title = summary.title || (entry.title as string);
      const content = summary.content;

      // Update entry with AI-generated title and content
      await env.DB.prepare(
        'UPDATE entries SET title = ?, content = ?, ai_status = ?, updated_at = datetime(?) WHERE id = ?',
      ).bind(title, content, 'completed', new Date().toISOString(), entryId).run();

      // Purge cached public pages so the new content is visible. The queue has
      // no request to read a host from, so fall back to the origin cached from
      // admin/api traffic when BASE_URL isn't set explicitly.
      const baseUrl =
        env.BASE_URL || (await getSetting(env.DB, BASE_URL_SETTING));
      if (baseUrl) {
        const versions = await getReleaseVersionsForEntry(env.DB, entryId);
        await Promise.all([
          purgePublicCache(baseUrl),
          purgeReleasePages(baseUrl, versions),
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

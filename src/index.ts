import { Hono } from 'hono';
import type { Bindings } from './bindings';
import admin from './routes/admin';
import api from './routes/api';
import pub from './routes/public';
import { handleQueue } from './queue/handler';

const app = new Hono<{ Bindings: Bindings }>();

// Mount route groups
app.route('/admin', admin);
app.route('/api', api);
app.route('/', pub);

export default app;

// Queue consumer handler for AI processing
export const queue = async (
  batch: MessageBatch,
  env: Bindings,
): Promise<void> => {
  await handleQueue(batch as any, env);
};

import { Hono } from 'hono';
import type { Bindings } from './bindings';
import { requireSetup } from './middleware/setup-check';
import auth from './routes/auth';
import admin from './routes/admin';
import api from './routes/api';
import pub from './routes/public';
import { handleQueue } from './queue/handler';

const app = new Hono<{ Bindings: Bindings }>();

// Block /admin and /auth routes if GitHub OAuth is not configured
app.use('/admin/*', requireSetup);
app.use('/auth/*', requireSetup);

// Mount route groups
app.route('/auth', auth);
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

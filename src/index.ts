import { Hono } from 'hono';
import type { Bindings } from './bindings';
import { requireSetup } from './middleware/setup-check';
import auth from './routes/auth';
import admin from './routes/admin';
import api from './routes/api';
import pub from './routes/public';
import setup from './routes/setup';
import { handleQueue } from './queue/handler';

const app = new Hono<{ Bindings: Bindings }>();

// /setup is the only admin-side route reachable before GitHub App config exists.
app.route('/setup', setup);

// Everything else under /admin and /auth requires App config in D1.
app.use('/admin/*', requireSetup);
app.use('/auth/*', requireSetup);

app.route('/auth', auth);
app.route('/admin', admin);
app.route('/api', api);
app.route('/', pub);

export default {
  fetch: app.fetch,
  queue: async (batch: MessageBatch, env: Bindings): Promise<void> => {
    await handleQueue(batch as any, env);
  },
};

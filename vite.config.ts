import { defineConfig } from 'vite';
import build from '@hono/vite-build/cloudflare-workers';
import devServer from '@hono/vite-dev-server';
import cloudflareAdapter from '@hono/vite-dev-server/cloudflare';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(async ({ mode }) => {
  if (mode === 'client') {
    return {
      plugins: [tailwindcss()],
      build: {
        outDir: './dist/assets',
        rollupOptions: {
          input: ['./src/client/main.ts', './src/client/styles/main.css', './src/client/embed.ts'],
          output: {
            entryFileNames: '[name].js',
            assetFileNames: '[name].[ext]',
          },
        },
        emptyOutDir: false,
        copyPublicDir: false,
      },
    };
  }
  return {
    plugins: [
      tailwindcss(),
      build({
        entry: './src/index.ts',
      }),
      devServer({
        adapter: await cloudflareAdapter(),
        entry: './src/index.ts',
      }),
    ],
  };
});

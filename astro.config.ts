import type { ServerResponse } from 'node:http';
import react from '@astrojs/react';
import vercel from '@astrojs/vercel';
import { defineConfig } from 'astro/config';
import type { Connect, Plugin, ViteDevServer } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const coiHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

function coiHeadersPlugin(): Plugin {
  return {
    name: 'coi-headers',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(
        (
          _: Connect.IncomingMessage,
          res: ServerResponse,
          next: Connect.NextFunction,
        ) => {
          res.setHeader(
            'Cross-Origin-Opener-Policy',
            coiHeaders['Cross-Origin-Opener-Policy'],
          );
          res.setHeader(
            'Cross-Origin-Embedder-Policy',
            coiHeaders['Cross-Origin-Embedder-Policy'],
          );
          next();
        },
      );
    },
  };
}

export default defineConfig({
  adapter: vercel({}),
  integrations: [react()],
  vite: {
    plugins: [
      coiHeadersPlugin(),
      viteStaticCopy({
        targets: [
          // Single-threaded ffmpeg core
          {
            src: 'node_modules/@ffmpeg/core/dist/esm/*',
            dest: 'ffmpeg-core',
          },
          // Multi-threaded ffmpeg core
          {
            src: 'node_modules/@ffmpeg/core-mt/dist/esm/*',
            dest: 'ffmpeg-core-mt',
          },
        ],
      }),
    ],
    optimizeDeps: {
      exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
    },
    ssr: {
      external: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
    },
    server: {
      headers: coiHeaders,
    },
  },
});

import type { ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import react from '@astrojs/react';
import vercel from '@astrojs/vercel';
import { defineConfig } from 'astro/config';
import type { Connect, Plugin, ViteDevServer } from 'vite';

const coiHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
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
  site: 'https://browser-audio-tools.d3sox.me',
  adapter: vercel({}),
  integrations: [react()],
  vite: {
    plugins: [coiHeadersPlugin()],
    resolve: {
      alias: {
        'wavesurfer.js/dist/plugins/regions.js': resolve(
          'node_modules/wavesurfer.js/dist/plugins/regions.js',
        ),
      },
    },
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

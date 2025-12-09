import react from '@astrojs/react';
import vercel from '@astrojs/vercel';
import { defineConfig } from 'astro/config';

const coiHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

function coiHeadersPlugin() {
  return {
    name: 'coi-headers',
    configureServer(server: any) {
      server.middlewares.use((_: unknown, res: any, next: () => void) => {
        res.setHeader('Cross-Origin-Opener-Policy', coiHeaders['Cross-Origin-Opener-Policy']);
        res.setHeader(
          'Cross-Origin-Embedder-Policy',
          coiHeaders['Cross-Origin-Embedder-Policy'],
        );
        next();
      });
    },
  };
}

export default defineConfig({
  adapter: vercel({}),
  integrations: [react()],
  vite: {
    plugins: [coiHeadersPlugin()],
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



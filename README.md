# Browser Audio Tools (Client-Side)

A Bun + TypeScript + React app for quick, in-browser audio tweaks: add pink/white noise and concatenate it with a track, extract the embedded cover image, retag WAV into MP3, or convert between audio formats. **All processing runs entirely in your browser** via `ffmpeg.wasm` — no server uploads, no size limits.

## Setup

```bash
# 1) Install deps
bun install

# 2) Run the dev server
bun run dev

# 3) Build static assets
bun run build
```

## Deploy to Vercel

This is a fully static site (no serverless functions needed):

- `vercel.json` is configured to build with Bun and output to `dist/`
- Deploy via `vercel` CLI or connect your repo in the dashboard
- Works on the free tier — it's just static files

## How it works

1. You pick an audio file in the browser
2. The app loads `ffmpeg.wasm` (~30 MB, cached after first load)
3. Processing happens locally in a Web Worker
4. You download the result directly — nothing leaves your machine

## Features

- **Add Noise + Concat**: Prepends pink or white noise to your track
  - Configurable duration, volume, and noise type
  - Output bitrate selection
- **Extract Cover**: Pulls the embedded album art as JPEG (if present)
- **Retag WAV into MP3**: Copy tags/artwork from an MP3 source onto a WAV render, output 320kbps MP3
- **Convert Audio**: Convert between audio formats with advanced options
  - Input: WAV, FLAC, AIFF, MP3, OGG, and more
  - Output: MP3, OGG, AAC (lossy) or WAV, FLAC, AIFF (lossless)
  - Configurable bitrate, sample rate, and channels

## Frontend

- Single-page React UI (`src/frontend/App.tsx`) with file upload, operation selector, noise options, and download/preview
- Minimal styling in `src/frontend/styles.css`
- Processing logic in `src/lib/audioProcessor.ts` using `@ffmpeg/ffmpeg`

## Implementation notes

- Uses `@ffmpeg/ffmpeg` with `@ffmpeg/core@0.12.10` loaded from jsdelivr CDN
- Noise pipeline: `anoisesrc` → optional `highpass/lowpass` for pink → `concat` with the uploaded track
- Cover extraction maps the embedded image stream with `-an -vcodec copy`
- No file size limits since everything runs client-side

## License

[MIT](./LICENSE)

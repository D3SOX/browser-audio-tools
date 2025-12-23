# Browser Audio Tools (Client-Side)

A Bun + TypeScript + Astro + React app for quick, in-browser audio tweaks: add pink/white noise and concatenate it with a track, extract the embedded cover image, retag WAV into MP3, fix up MP3 tags, or convert between audio formats. **All processing runs entirely in your browser** via `ffmpeg.wasm` — no server uploads, no size limits.

For broader, non-audio conversions, I recommend the open-source VERT project: [vert.sh](https://vert.sh/) / [github.com/VERT-sh/VERT](https://github.com/VERT-sh/VERT). This app stays focused on audio-specific workflows.

Another great recommendation for more browser-based tools is the open-source BrowseryTools project: [browserytools.com](https://browserytools.com/) / [github.com/aghyad97/browserytools](https://github.com/aghyad97/browserytools).

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

## PWA & Offline Support

This app is an installable Progressive Web App (PWA) that works fully offline:

- **Install it**: On supported browsers, you'll see an "Install" option in the browser's address bar or menu
- **Works offline**: After visiting once, the app and ffmpeg engine are cached locally. You can use it without an internet connection
- **Self-hosted ffmpeg**: The ffmpeg.wasm core files (~30 MB) are bundled with the app, not loaded from external CDNs, ensuring reliable offline operation
- **Offline indicator**: The footer shows "(offline ready)" when the service worker is active

Note: The first visit requires an internet connection to download and cache all assets. Subsequent visits work fully offline.

## Features

- **Add Noise + Concat**: Prepends pink or white noise to your track
  - Configurable duration, volume, and noise type
  - Output bitrate selection
- **Extract Cover**: Pulls the embedded album art as JPEG (if present)
- **Retag WAV into MP3**: Copy tags/artwork from an MP3 source onto a WAV render, output 320kbps MP3
- **Convert Audio**: Convert between audio formats with advanced options
  - Input: WAV, FLAC, AIFF, MP3, OGG, AAC/M4A, and more
  - Output: MP3, OGG, AAC/M4A (lossy) or WAV, FLAC, AIFF (lossless)
  - Configurable bitrate, sample rate, and channels
- **Retag MP3**: Edit ID3v2 tags on existing MP3 files without re-encoding
- **Audio Trimming**: Visually select a region, trim to it, and export in any supported format with optional silence removal (threshold + duration)
- **Waveform Generator**: Customize colors, bar style, normalization, and background opacity; export a transparent or colored PNG waveform for the selected track
- **Multi-file processing**: Most operations accept multiple files in one go, show per-file progress, and return a ZIP of all outputs

## Use cases

- **Noise + concat to dodge filters**: Add a short burst of pink/white noise up front to slightly change the fingerprint of a track. Useful when you already hold the rights but need to avoid automated takedowns on platforms like SoundCloud; keep it subtle so listeners barely notice.
- **Retag WAV into MP3**: When you have a clean WAV render but metadata lives in another file (e.g., an MP3 grabbed via `yt-dlp` from SoundCloud/YouTube), load both: pick the WAV as the target and the MP3 as the metadata source. The tool copies title/artist/album/artwork into a 320kbps MP3 and you can tidy ID3 tags like properly putting it into the respective fields for Title/Artist/Album (optional) or removing superflous text like `[FREE DOWNLOAD]` for a cleaner library.
- **Fix up MP3 tags**: Quickly edit ID3 tags on an existing MP3 — update metadata without re-encoding. Handy for cleaning up messy downloads or fixing typos in your music library.

## Multi-processing & batching

- The Tools Noise + Track, Extract Cover, and Convert Audio accept multiple files
- Outputs download as a ZIP with unique filenames
- Quick previews appear for each item
- Uses the multi-threaded ffmpeg core in the worker to speed up per-file execution where the browser allows

## Audio trimming workflow

- Upload a file, drag the highlighted region in the waveform, or type start/end times (`M:SS.xx` or seconds)
- Toggle **Remove silence** to strip quiet sections inside the trimmed window using `silenceremove` (threshold + minimum duration)
- Pick the output format/bitrate; exports keep the selected slice only

## Waveform generator

- Pick an audio file, adjust bar width/gap/height, normalization, and colors (with presets)
- Set background color/opacity or leave it transparent for overlays
- Export a PNG straight from the browser

## Frontend

- Single-page React UI (`src/frontend/App.tsx`) with file upload, operation selector, noise options, and download/preview
- Minimal styling in `src/frontend/styles.css`
- Processing logic in `src/lib/audioProcessor.ts` using `@ffmpeg/ffmpeg`
- Trimming UI (`src/frontend/components/TrimSection.tsx`) uses WaveSurfer regions for precise start/end selection plus optional silence stripping
- Waveform generator (`src/frontend/components/VisualizerSection.tsx`) renders WaveSurfer output and exports a PNG with your styling choices

## Implementation notes

- Uses `@ffmpeg/ffmpeg` with self-hosted `@ffmpeg/core-mt@0.12.10` for faster, parallelized processing (falls back to single-threaded core when SharedArrayBuffer is unavailable)
- ffmpeg core assets are copied to `/ffmpeg-core/` and `/ffmpeg-core-mt/` at build time via `vite-plugin-static-copy`
- Service worker (`public/sw.js`) precaches the app shell and ffmpeg assets for offline use
- Noise pipeline: `anoisesrc` → optional `highpass/lowpass` for pink → `concat` with the uploaded track
- Cover extraction maps the embedded image stream with `-an -vcodec copy`
- No file size limits since everything runs client-side

## License

[MIT](./LICENSE)

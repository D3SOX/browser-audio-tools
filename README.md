# Browser Audio Tools

Client-side audio utilities built with Bun, Astro, and React. All processing runs locally in the browser via `ffmpeg.wasm`.

## Features

- Add noise + concat
- Extract embedded cover art
- Retag WAV into MP3 / edit MP3 tags
- Convert audio formats
- Trim audio with optional silence removal
- Generate waveform PNGs
- Batch processing with ZIP output

## Development

```bash
# 1) Install deps
bun install

# 2) Run the dev server
bun run dev

# 3) Build static assets
bun run build
```

## License

[MIT](./LICENSE)

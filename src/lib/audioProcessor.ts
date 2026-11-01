import { FFmpeg } from '@ffmpeg/ffmpeg';

export type ProgressCallback = (progress: { percent: number }) => void;

export type NoiseType = 'white' | 'pink';

export interface NoiseOptions {
  durationSeconds?: number;
  noiseVolume?: number;
  noiseType?: NoiseType;
  bitrate?: string;
  prependNoise?: boolean;
}

export interface ProcessResult {
  data: Uint8Array;
  filename: string;
  mime: string;
}

// Core files are pinned by version and verified with Subresource Integrity.
// The single-threaded core has no separate worker file.
const CORE_VERSION = '0.12.10';
const CORES = {
  multi: {
    baseURL: `https://cdn.jsdelivr.net/npm/@ffmpeg/core-mt@${CORE_VERSION}/dist/esm`,
    js: 'sha384-CqK+fB7O3Dl0SbCkpBiLNrSGeKVUCxa/mwPUPzOGLIQwVNBZEO3OOBhsTz6WqRw3',
    wasm: 'sha384-IXnr5PE2UFcQ5DvI5LyubPqmMF46EkyIMlbdn4CNQR1iQ8/2irEkyhDFnVDxv4f/',
    worker:
      'sha384-mH8cZ9JWsDxI1nYKmKMTA3qGV40dhtv4c6nOLSi5O2rr+0bx3pzHPIkIi6++JFye',
  },
  single: {
    baseURL: `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/esm`,
    js: 'sha384-9KlAmgHu5wDqdgQvFhQGZOtKdCwGcMppDhM/kBkUpZ5LS7KGuAHbE+NgtJQEf84i',
    wasm: 'sha384-U1VDhkPYrM3wTCT4/vjSpSsKqG/UjljYrYCI4hBSJ02svbCkxuCi6U6u/peg5vpW',
    worker: null,
  },
} as const;

let ffmpeg: FFmpeg | null = null;
let loadPromise: Promise<void> | null = null;
let jobQueue: Promise<unknown> = Promise.resolve();
let tempFileCounter = 0;

function selectCore(): {
  core: (typeof CORES)[keyof typeof CORES];
  reason: string;
} {
  const missing: string[] = [];
  if (typeof SharedArrayBuffer === 'undefined') {
    missing.push('SharedArrayBuffer');
  }
  if (typeof Atomics === 'undefined') missing.push('Atomics');
  if (
    typeof crossOriginIsolated === 'undefined' ||
    crossOriginIsolated !== true
  ) {
    missing.push('crossOriginIsolated');
  }

  if (missing.length === 0) {
    return {
      core: CORES.multi,
      reason:
        'Using multi-threaded core: crossOriginIsolated with SAB/Atomics available.',
    };
  }

  return {
    core: CORES.single,
    reason: `Falling back to single-threaded core: missing ${missing.join(', ')}.`,
  };
}

function translateFFmpegLoadError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(
    `FFmpeg failed to load. A content or privacy blocker may be blocking blob: scripts. Try disabling blockers for this site or use a different browser. Error: ${message}`,
  );
}

async function fetchBlobURL(
  url: string,
  type: string,
  integrity: string,
): Promise<string> {
  const response = await fetch(url, { integrity });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
  }
  return URL.createObjectURL(
    new Blob([await response.arrayBuffer()], { type }),
  );
}

async function ensureFFmpegLoaded(): Promise<FFmpeg> {
  if (ffmpeg?.loaded) return ffmpeg;

  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        // In preview/static hosting environments we may not be cross-origin
        // isolated, so fall back to the single-threaded core to avoid
        // SharedArrayBuffer errors.
        const { core, reason } = selectCore();
        console.info('[ffmpeg] core selection', {
          version: CORE_VERSION,
          core:
            core === CORES.multi
              ? 'core-mt (multi-threaded)'
              : 'core (single-threaded)',
          reason,
        });
        ffmpeg = new FFmpeg();
        const [coreURL, wasmURL, workerURL] = await Promise.all([
          fetchBlobURL(
            `${core.baseURL}/ffmpeg-core.js`,
            'text/javascript',
            core.js,
          ),
          fetchBlobURL(
            `${core.baseURL}/ffmpeg-core.wasm`,
            'application/wasm',
            core.wasm,
          ),
          core.worker
            ? fetchBlobURL(
                `${core.baseURL}/ffmpeg-core.worker.js`,
                'text/javascript',
                core.worker,
              )
            : undefined,
        ]);
        await ffmpeg.load({ coreURL, wasmURL, workerURL });
      } catch (error) {
        ffmpeg = null;
        loadPromise = null;
        throw translateFFmpegLoadError(error);
      }
    })();
  }
  await loadPromise;
  if (!ffmpeg) {
    throw new Error('Failed to load FFmpeg.');
  }
  return ffmpeg;
}

/**
 * Run a job with exclusive access to FFmpeg. ffmpeg.wasm has one worker and
 * one in-memory file system, so overlapping jobs would mix up progress events
 * and could delete each other's files. Jobs run one after another instead.
 */
function withFFmpeg<T>(job: (ff: FFmpeg) => Promise<T>): Promise<T> {
  const run = jobQueue.then(async () => {
    try {
      return await job(await ensureFFmpegLoaded());
    } catch (error) {
      // The ffmpeg.wasm worker rejects with plain strings.
      throw error instanceof Error ? error : new Error(String(error));
    }
  });
  jobQueue = run.catch(() => {});
  return run;
}

async function cleanupFiles(ff: FFmpeg, names: string[]): Promise<void> {
  // Some files never get created (e.g. output of a failed run).
  await Promise.allSettled(names.map((name) => ff.deleteFile(name)));
}

// ffmpeg.wasm's writeFile transfers the Uint8Array's underlying ArrayBuffer to
// its worker, which detaches it for the caller. If the caller keeps a reference
// (e.g. cover art stored in React state and reused across invocations), the
// next call fails with "attempting to access detached ArrayBuffer". Copy
// buffers the caller keeps before handing them off.
async function writeFileCopy(
  ff: FFmpeg,
  path: string,
  data: Uint8Array,
): Promise<void> {
  await ff.writeFile(path, data.slice());
}

function createTempFileName(prefix: string, extension: string): string {
  tempFileCounter += 1;
  return `${prefix}_${tempFileCounter}.${extension}`;
}

function getSafeExtension(filename: string, fallback: string): string {
  const ext = filename.includes('.')
    ? filename.split('.').pop()?.toLowerCase()
    : undefined;
  return ext && /^[a-z0-9]+$/.test(ext) ? ext : fallback;
}

/**
 * Run FFmpeg and fail when it exits with a non-zero code. Returns the last
 * log lines, which help explain empty output.
 */
async function execWithProgress(
  ff: FFmpeg,
  args: string[],
  onProgress?: ProgressCallback,
): Promise<string[]> {
  let lastPercent = -1;
  const logs: string[] = [];

  const logHandler = ({ message }: { message: string }) => {
    if (logs.length >= 10) {
      logs.shift();
    }
    logs.push(message);
  };

  const progressHandler = ({ progress }: { progress: number }) => {
    // Clamp to 0-99 (we'll set 100 on completion)
    const percent = Math.max(0, Math.min(99, Math.round(progress * 100)));
    // Only emit if changed to reduce re-renders
    if (percent !== lastPercent) {
      lastPercent = percent;
      onProgress?.({ percent });
    }
  };

  ff.on('log', logHandler);
  if (onProgress) {
    ff.on('progress', progressHandler);
  }

  try {
    const exitCode = await ff.exec(args);
    if (exitCode !== 0) {
      throw new Error(
        `FFmpeg failed with exit code ${exitCode}.${formatLogDetails(logs)}`,
      );
    }
    // Signal completion
    onProgress?.({ percent: 100 });
    return logs;
  } finally {
    ff.off('log', logHandler);
    if (onProgress) {
      ff.off('progress', progressHandler);
    }
  }
}

function formatLogDetails(logs: string[]): string {
  return logs.length > 0 ? ` Details: ${logs.join(' | ')}` : '';
}

async function readOutputFile(ff: FFmpeg, path: string): Promise<Uint8Array> {
  const data = await ff.readFile(path);
  if (!(data instanceof Uint8Array)) {
    throw new Error('Unexpected ffmpeg output');
  }
  return data;
}

export function addNoiseAndConcat(
  input: Uint8Array,
  options: NoiseOptions = {},
  onProgress?: ProgressCallback,
): Promise<ProcessResult> {
  const noiseColor: NoiseType = options.noiseType ?? 'pink';
  const duration = Math.max(1, options.durationSeconds ?? 180);
  const amplitude = options.noiseVolume ?? 0.05;
  const bitrate = options.bitrate ?? '192k';
  const prependNoise = options.prependNoise ?? false;

  let filterComplex: string;
  if (noiseColor === 'pink') {
    // Always filter the noise (input 0)
    if (prependNoise) {
      // Prepend: filtered noise first, then audio
      filterComplex =
        '[0:a]highpass=f=20,lowpass=f=4000[n];[n][1:a]concat=n=2:v=0:a=1[aout]';
    } else {
      // Append: audio first, then filtered noise
      filterComplex =
        '[0:a]highpass=f=20,lowpass=f=4000[n];[1:a][n]concat=n=2:v=0:a=1[aout]';
    }
  } else {
    if (prependNoise) {
      // Prepend: noise first, then audio
      filterComplex = '[0:a][1:a]concat=n=2:v=0:a=1[aout]';
    } else {
      // Append: audio first, then noise
      filterComplex = '[1:a][0:a]concat=n=2:v=0:a=1[aout]';
    }
  }

  return withFFmpeg(async (ff) => {
    const inputName = createTempFileName('noise_input', 'mp3');
    const outputName = createTempFileName('noise_output', 'mp3');
    try {
      await ff.writeFile(inputName, input);
      await execWithProgress(
        ff,
        [
          '-f',
          'lavfi',
          '-i',
          `anoisesrc=color=${noiseColor}:duration=${duration}:amplitude=${amplitude}`,
          '-i',
          inputName,
          '-filter_complex',
          filterComplex,
          '-map',
          '[aout]',
          '-c:a',
          'libmp3lame',
          '-b:a',
          bitrate,
          '-y',
          outputName,
        ],
        onProgress,
      );
      return {
        data: await readOutputFile(ff, outputName),
        filename: 'output.mp3',
        mime: 'audio/mpeg',
      };
    } finally {
      await cleanupFiles(ff, [inputName, outputName]);
    }
  });
}

export function extractCover(
  input: Uint8Array,
  onProgress?: ProgressCallback,
): Promise<ProcessResult> {
  return withFFmpeg(async (ff) => {
    const inputName = createTempFileName('cover_input', 'mp3');
    const outputName = createTempFileName('cover_output', 'jpg');
    try {
      await ff.writeFile(inputName, input);
      try {
        await execWithProgress(
          ff,
          ['-i', inputName, '-an', '-vcodec', 'copy', '-y', outputName],
          onProgress,
        );
      } catch (error) {
        throw new Error(
          `No embedded cover art found. ${error instanceof Error ? error.message : ''}`.trim(),
        );
      }
      const data = await readOutputFile(ff, outputName);
      const mime = detectImageMimeType(data);
      return {
        data,
        filename: `cover.${IMAGE_EXTENSIONS[mime]}`,
        mime,
      };
    } finally {
      await cleanupFiles(ff, [inputName, outputName]);
    }
  });
}

export interface ID3Metadata {
  title: string;
  artist: string;
  album: string;
  year?: string;
  track?: string;
  genre?: string;
}

/**
 * Parse the global tags of an FFMETADATA file. Values may contain escaped
 * `=`, `;`, `#`, `\` and newline characters. Stream and chapter sections
 * follow the global tags and are ignored.
 */
export function parseFFMetadata(text: string): ID3Metadata {
  const metadata: ID3Metadata = {
    title: '',
    artist: '',
    album: '',
    year: '',
    track: '',
    genre: '',
  };

  let pending = '';
  for (const rawLine of text.split('\n')) {
    if (!pending) {
      if (rawLine.startsWith('[')) break;
      if (rawLine.startsWith(';') || rawLine.startsWith('#')) continue;
    }
    const line = pending + rawLine;
    // An odd number of trailing backslashes escapes the newline, so the value
    // continues on the next line.
    const trailingBackslashes = line.length - line.replace(/\\+$/, '').length;
    if (trailingBackslashes % 2 === 1) {
      pending = `${line.slice(0, -1)}\n`;
      continue;
    }
    pending = '';

    let key = '';
    let value = '';
    let inValue = false;
    for (let i = 0; i < line.length; i++) {
      let char = line[i];
      if (char === '\\' && i + 1 < line.length) {
        i++;
        char = line[i];
      } else if (char === '=' && !inValue) {
        inValue = true;
        continue;
      }
      if (inValue) value += char;
      else key += char;
    }
    if (!inValue) continue;

    switch (key.trim().toLowerCase()) {
      case 'title':
        metadata.title = value;
        break;
      case 'artist':
        metadata.artist = value;
        break;
      case 'album':
        metadata.album = value;
        break;
      case 'date':
      case 'year':
        metadata.year = value;
        break;
      case 'track':
        metadata.track = value;
        break;
      case 'genre':
        metadata.genre = value;
        break;
    }
  }

  return metadata;
}

export function readMetadata(
  input: Uint8Array,
  inputFilename: string,
  onProgress?: ProgressCallback,
): Promise<ID3Metadata> {
  return withFFmpeg(async (ff) => {
    const inputName = createTempFileName(
      'meta_input',
      getSafeExtension(inputFilename, 'bin'),
    );
    const outputName = createTempFileName('metadata', 'txt');
    try {
      await ff.writeFile(inputName, input);
      await execWithProgress(
        ff,
        ['-i', inputName, '-f', 'ffmetadata', '-y', outputName],
        onProgress,
      );
      const data = await ff.readFile(outputName);
      const text =
        data instanceof Uint8Array ? new TextDecoder().decode(data) : data;
      return parseFFMetadata(text);
    } finally {
      await cleanupFiles(ff, [inputName, outputName]);
    }
  });
}

function metadataArgs(metadata: Partial<ID3Metadata>): string[] {
  const fields: [keyof ID3Metadata, string][] = [
    ['title', 'title'],
    ['artist', 'artist'],
    ['album', 'album'],
    ['year', 'date'],
    ['track', 'track'],
    ['genre', 'genre'],
  ];
  const args: string[] = [];
  for (const [field, tag] of fields) {
    const value = metadata[field];
    // An empty value removes the tag.
    if (value !== undefined) {
      args.push('-metadata', `${tag}=${value}`);
      // Some files store the year as "year", which parseFFMetadata also reads.
      if (field === 'year') args.push('-metadata', 'year=');
    }
  }
  return args;
}

export function retagMp3(
  input: Uint8Array,
  metadata: ID3Metadata,
  outputFilename?: string,
  onProgress?: ProgressCallback,
  cover?: Uint8Array,
): Promise<ProcessResult> {
  return withFFmpeg(async (ff) => {
    const inputName = createTempFileName('retag_input', 'mp3');
    const coverName = createTempFileName('retag_cover', 'img');
    const outputName = createTempFileName('retag_output', 'mp3');
    try {
      await ff.writeFile(inputName, input);
      const args = ['-i', inputName];
      if (cover) {
        await writeFileCopy(ff, coverName, cover);
        args.push('-i', coverName);
      }

      args.push(
        '-map',
        '0:a',
        '-c:a',
        'copy',
        '-id3v2_version',
        '3',
        // Keep tags the form doesn't show (album artist, lyrics, ...).
        '-map_metadata',
        '0',
      );

      if (cover) {
        args.push(
          '-map',
          '1:v',
          '-c:v',
          'copy',
          '-metadata:s:v',
          'title=Album cover',
          '-metadata:s:v',
          'comment=Cover (front)',
        );
      }

      args.push(...metadataArgs(metadata), '-y', outputName);

      await execWithProgress(ff, args, onProgress);
      return {
        data: await readOutputFile(ff, outputName),
        filename: outputFilename ?? 'output.mp3',
        mime: 'audio/mpeg',
      };
    } finally {
      await cleanupFiles(ff, [inputName, coverName, outputName]);
    }
  });
}

export type ConvertOptions = Partial<ID3Metadata>;

export type OutputFormat = 'mp3' | 'ogg' | 'aac' | 'wav' | 'flac' | 'aiff';
export type TrimOutputFormat = OutputFormat | 'source';
export type SampleRate = 44100 | 48000 | 96000;
export type Channels = 1 | 2 | 'auto';

export interface GenericConvertOptions {
  format: OutputFormat;
  bitrate: string | null; // e.g., "128k", "192k", "320k" (null = encoder default, ignored for lossless)
  sampleRate: SampleRate | null; // null = preserve original
  channels: Channels;
}

export interface TrimOptions {
  startTime: number; // seconds
  endTime: number; // seconds
  format: TrimOutputFormat;
  bitrate: string;
  removeSilence: boolean;
  silenceThreshold: number; // dB (e.g., -50)
  silenceDuration: number; // seconds (minimum silence duration to remove)
}

const FORMAT_CONFIG: Record<
  OutputFormat,
  {
    codec: string;
    ext: string;
    mime: string;
    lossless: boolean;
    supportsCoverArt: boolean;
  }
> = {
  mp3: {
    codec: 'libmp3lame',
    ext: 'mp3',
    mime: 'audio/mpeg',
    lossless: false,
    supportsCoverArt: true,
  },
  ogg: {
    codec: 'libvorbis',
    ext: 'ogg',
    mime: 'audio/ogg',
    lossless: false,
    supportsCoverArt: true,
  }, // Via METADATA_BLOCK_PICTURE
  aac: {
    codec: 'aac',
    ext: 'm4a',
    mime: 'audio/mp4',
    lossless: false,
    supportsCoverArt: true,
  },
  wav: {
    codec: 'pcm_s16le',
    ext: 'wav',
    mime: 'audio/wav',
    lossless: true,
    supportsCoverArt: false,
  }, // WAV has no metadata
  flac: {
    codec: 'flac',
    ext: 'flac',
    mime: 'audio/flac',
    lossless: true,
    supportsCoverArt: true,
  },
  aiff: {
    codec: 'pcm_s16be',
    ext: 'aiff',
    mime: 'audio/aiff',
    lossless: true,
    supportsCoverArt: true,
  },
};

/**
 * Check if a format supports embedded cover art.
 * WAV: No metadata support at all.
 */
export function formatSupportsCoverArt(format: OutputFormat): boolean {
  return FORMAT_CONFIG[format]?.supportsCoverArt ?? false;
}

// Compatibility guardrails: avoid encoder/decoder failures by only allowing
// sample rate and channel combinations that are broadly supported in browsers
// for each output format.
export const FORMAT_CAPABILITIES: Record<
  OutputFormat,
  { sampleRates: SampleRate[]; channels: Channels[] }
> = {
  mp3: { sampleRates: [44100, 48000], channels: [1, 2] },
  ogg: { sampleRates: [44100, 48000, 96000], channels: [1, 2] },
  aac: { sampleRates: [44100, 48000, 96000], channels: [1, 2] },
  wav: { sampleRates: [44100, 48000, 96000], channels: [1, 2] },
  flac: { sampleRates: [44100, 48000, 96000], channels: [1, 2] },
  aiff: { sampleRates: [44100, 48000, 96000], channels: [1, 2] },
};

const VORBIS_Q_FOR_BITRATE: Record<string, number> = {
  '96k': 2.7,
  '128k': 4,
  '160k': 4.8,
  '192k': 5.5,
  '256k': 6.5,
  '320k': 7.5,
};

/**
 * Build a METADATA_BLOCK_PICTURE base64 string for OGG Vorbis cover art.
 * This follows the FLAC picture block format used in Vorbis comments.
 *
 * Structure (all integers are big-endian):
 * - Picture type (4 bytes): 3 = front cover
 * - MIME type length (4 bytes)
 * - MIME type (ASCII string)
 * - Description length (4 bytes)
 * - Description (UTF-8 string, can be empty)
 * - Width (4 bytes): 0 if unknown
 * - Height (4 bytes): 0 if unknown
 * - Color depth (4 bytes): 0 if unknown
 * - Number of colors (4 bytes): 0 for non-indexed
 * - Picture data length (4 bytes)
 * - Picture data (binary)
 */
function buildMetadataBlockPicture(
  imageData: Uint8Array,
  mimeType: string,
): string {
  const encoder = new TextEncoder();
  const mimeBytes = encoder.encode(mimeType);
  const description = encoder.encode(''); // Empty description

  // Calculate total size
  const totalSize =
    4 +
    4 +
    mimeBytes.length +
    4 +
    description.length +
    4 +
    4 +
    4 +
    4 +
    4 +
    imageData.length;
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  let offset = 0;

  // Picture type: 3 = front cover
  view.setUint32(offset, 3, false); // big-endian
  offset += 4;

  // MIME type length
  view.setUint32(offset, mimeBytes.length, false);
  offset += 4;

  // MIME type
  bytes.set(mimeBytes, offset);
  offset += mimeBytes.length;

  // Description length
  view.setUint32(offset, description.length, false);
  offset += 4;

  // Description (empty)
  bytes.set(description, offset);
  offset += description.length;

  // Width (0 = unknown)
  view.setUint32(offset, 0, false);
  offset += 4;

  // Height (0 = unknown)
  view.setUint32(offset, 0, false);
  offset += 4;

  // Color depth (0 = unknown)
  view.setUint32(offset, 0, false);
  offset += 4;

  // Number of colors (0 for non-indexed)
  view.setUint32(offset, 0, false);
  offset += 4;

  // Picture data length
  view.setUint32(offset, imageData.length, false);
  offset += 4;

  // Picture data
  bytes.set(imageData, offset);

  // Base64 encode
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

const IMAGE_EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
} as const;

type ImageMimeType = keyof typeof IMAGE_EXTENSIONS;

/**
 * Detect MIME type from image data by checking magic bytes.
 */
export function detectImageMimeType(data: Uint8Array): ImageMimeType {
  if (
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47
  ) {
    return 'image/png';
  }
  // JPEG (FF D8 FF) and anything unknown
  return 'image/jpeg';
}

/**
 * Try to extract cover art from input file using FFmpeg.
 * Returns null if no cover art is found.
 */
async function tryExtractCoverArt(
  ff: FFmpeg,
  inputName: string,
): Promise<Uint8Array | null> {
  const coverName = createTempFileName('extracted_cover', 'jpg');
  try {
    // Exits with a non-zero code when the file has no cover art
    const exitCode = await ff.exec([
      '-i',
      inputName,
      '-an',
      '-vcodec',
      'copy',
      '-y',
      coverName,
    ]);
    if (exitCode !== 0) return null;
    const data = await ff.readFile(coverName);
    return data instanceof Uint8Array && data.length > 0 ? data : null;
  } catch {
    return null;
  } finally {
    await cleanupFiles(ff, [coverName]);
  }
}

function parseBitrateKbps(bitrate: string): string {
  const match = /^(\d+)(k)$/i.exec(bitrate.trim());
  if (!match) {
    throw new Error(`Bitrate must look like "128k", got "${bitrate}"`);
  }
  return `${match[1]}k`.toLowerCase();
}

function assertGenericConvertCompatibility(options: GenericConvertOptions) {
  const caps = FORMAT_CAPABILITIES[options.format];
  // Only validate sample rate if it's explicitly set (not null)
  if (
    options.sampleRate !== null &&
    !caps.sampleRates.includes(options.sampleRate)
  ) {
    throw new Error(
      `${options.format.toUpperCase()} supports sample rates ${caps.sampleRates.join(
        ' / ',
      )}. Please pick one of those values.`,
    );
  }
  // Allow "auto" to pass through without forcing channel layout
  if (
    options.channels !== 'auto' &&
    !caps.channels.includes(options.channels)
  ) {
    throw new Error(
      `${options.format.toUpperCase()} supports channels ${caps.channels.join(
        ' or ',
      )}. Please pick a supported value.`,
    );
  }
}

const INPUT_EXT_TO_OUTPUT_FORMAT: Record<string, OutputFormat> = {
  mp3: 'mp3',
  mpeg: 'mp3',
  ogg: 'ogg',
  oga: 'ogg',
  aac: 'aac',
  m4a: 'aac',
  wav: 'wav',
  wave: 'wav',
  flac: 'flac',
  aiff: 'aiff',
  aif: 'aiff',
};

export function convertAudio(
  input: Uint8Array,
  inputFilename: string,
  options: GenericConvertOptions,
  outputBaseName?: string,
  onProgress?: ProgressCallback,
): Promise<ProcessResult> {
  assertGenericConvertCompatibility(options);
  const normalizedBitrate = options.bitrate
    ? parseBitrateKbps(options.bitrate)
    : null;
  const config = FORMAT_CONFIG[options.format];
  const baseName = outputBaseName ?? inputFilename.replace(/\.[^.]+$/, '');

  return withFFmpeg(async (ff) => {
    const inputName = createTempFileName(
      'convert_input',
      getSafeExtension(inputFilename, 'bin'),
    );
    const outputName = createTempFileName('convert_output', config.ext);
    try {
      await ff.writeFile(inputName, input);

      // For OGG, try to extract cover art first to embed via METADATA_BLOCK_PICTURE
      let oggCoverArtBase64: string | null = null;
      if (options.format === 'ogg') {
        const coverData = await tryExtractCoverArt(ff, inputName);
        if (coverData) {
          const mimeType = detectImageMimeType(coverData);
          oggCoverArtBase64 = buildMetadataBlockPicture(coverData, mimeType);
        }
      }

      const args = ['-i', inputName];

      // Map audio stream
      args.push('-map', '0:a:0');

      // Cover art handling
      // OGG uses METADATA_BLOCK_PICTURE (handled separately), not video stream mapping
      if (config.supportsCoverArt && options.format !== 'ogg') {
        // Map video stream (cover art) if present - the "?" makes it optional
        args.push('-map', '0:v?');
        args.push('-c:v', 'copy');
        args.push('-disposition:v', 'attached_pic');
        // Copy metadata from source
        args.push('-map_metadata', '0');
      } else if (options.format === 'ogg') {
        // OGG: strip video stream but copy metadata, we'll add cover via METADATA_BLOCK_PICTURE
        args.push('-vn');
        args.push('-map_metadata', '0');
      } else {
        // Strip video for formats that don't support cover art (WAV)
        args.push('-vn');
      }

      args.push('-c:a', config.codec);

      // Only set sample rate if explicitly provided (null = preserve original)
      if (options.sampleRate !== null) {
        args.push('-ar', String(options.sampleRate));
      }

      // Only set channel count when explicitly requested; "auto" preserves source layout.
      if (options.channels !== 'auto') {
        args.push('-ac', String(options.channels));
      }

      // Vorbis: prefer quality scale for stability across mono/stereo and bitrates
      if (options.format === 'ogg') {
        if (normalizedBitrate) {
          const quality = VORBIS_Q_FOR_BITRATE[normalizedBitrate] ?? 4;
          args.push('-qscale:a', String(quality));
        }
        // If bitrate is null, FFmpeg will use default quality

        // Add cover art via METADATA_BLOCK_PICTURE Vorbis comment
        if (oggCoverArtBase64) {
          args.push('-metadata', `METADATA_BLOCK_PICTURE=${oggCoverArtBase64}`);
        }
      } else if (!config.lossless && normalizedBitrate) {
        // Lossy formats: set explicit bitrate only if provided
        args.push('-b:a', normalizedBitrate);
      }
      // If bitrate is null, FFmpeg will use the encoder's default bitrate

      // AIFF: enable ID3v2 tags to store cover art
      if (options.format === 'aiff') {
        args.push('-write_id3v2', '1');
      }

      args.push('-y', outputName);

      const logs = await execWithProgress(ff, args, onProgress);
      const data = await readOutputFile(ff, outputName);
      if (data.length === 0) {
        throw new Error(
          `FFmpeg produced an empty ${options.format.toUpperCase()} file. Try 44.1/48 kHz and a standard bitrate.${formatLogDetails(logs)}`,
        );
      }
      return {
        data,
        filename: `${baseName}.${config.ext}`,
        mime: config.mime,
      };
    } finally {
      await cleanupFiles(ff, [inputName, outputName]);
    }
  });
}

export function convertWavToMp3WithMetadata(
  wavInput: Uint8Array,
  mp3Source: Uint8Array | undefined,
  options: ConvertOptions = {},
  outputFilename?: string,
  onProgress?: ProgressCallback,
  cover?: Uint8Array,
): Promise<ProcessResult> {
  return withFFmpeg(async (ff) => {
    const wavName = createTempFileName('retag_wav_input', 'wav');
    const mp3Name = createTempFileName('retag_wav_source', 'mp3');
    const coverName = createTempFileName('retag_wav_cover', 'img');
    const outputName = createTempFileName('retag_wav_output', 'mp3');
    try {
      await ff.writeFile(wavName, wavInput);

      // Build ffmpeg arguments based on available inputs
      const args: string[] = ['-i', wavName];

      if (mp3Source) {
        await ff.writeFile(mp3Name, mp3Source);
        args.push('-i', mp3Name);
      }

      // Track which input index the cover is at (for -map)
      const coverInputIndex = mp3Source ? 2 : 1;
      if (cover) {
        await writeFileCopy(ff, coverName, cover);
        args.push('-i', coverName);
      }

      args.push(
        '-map',
        '0:a',
        '-c:a',
        'libmp3lame',
        '-b:a',
        '320k',
        '-id3v2_version',
        '3',
      );

      // Copy metadata from MP3 source if provided
      if (mp3Source) {
        args.push('-map_metadata', '1');
      }

      if (cover) {
        // Use the provided cover image
        args.push(
          '-map',
          `${coverInputIndex}:v`,
          '-c:v',
          'copy',
          '-metadata:s:v',
          'title=Album cover',
          '-metadata:s:v',
          'comment=Cover (front)',
        );
      } else if (mp3Source) {
        // Use cover from MP3 source if available, without re-encoding it
        args.push('-map', '1:v?', '-c:v', 'copy');
      }

      args.push(...metadataArgs(options), '-y', outputName);

      await execWithProgress(ff, args, onProgress);
      return {
        data: await readOutputFile(ff, outputName),
        filename: outputFilename ?? 'output.mp3',
        mime: 'audio/mpeg',
      };
    } finally {
      await cleanupFiles(ff, [wavName, mp3Name, coverName, outputName]);
    }
  });
}

const PASSTHROUGH_EXT_ALIASES: Record<string, string> = {
  wave: 'wav',
  mpeg: 'mp3',
};

export function trimAudio(
  input: Uint8Array,
  inputFilename: string,
  options: TrimOptions,
  outputBaseName?: string,
  onProgress?: ProgressCallback,
): Promise<ProcessResult> {
  const duration = options.endTime - options.startTime;
  if (duration <= 0) {
    return Promise.reject(new Error('Trim end time must be after start time.'));
  }

  const inputExt = getSafeExtension(inputFilename, 'bin');
  const sourceFormat = INPUT_EXT_TO_OUTPUT_FORMAT[inputExt];
  const isPassthrough = options.format === 'source' && !options.removeSilence;
  const targetFormat =
    options.format === 'source' ? sourceFormat : options.format;
  // Stream copy works for any container; re-encoding needs a known format.
  if (!isPassthrough && !targetFormat) {
    return Promise.reject(
      new Error(
        `Removing silence while keeping the original format is not supported for ".${inputExt}" files. Pick an output format instead.`,
      ),
    );
  }
  const config = targetFormat ? FORMAT_CONFIG[targetFormat] : null;
  const baseName = outputBaseName ?? inputFilename.replace(/\.[^.]+$/, '');
  // Use an extension FFmpeg maps to the right muxer (".wave" isn't one).
  const outputExt =
    isPassthrough || !config
      ? (PASSTHROUGH_EXT_ALIASES[inputExt] ?? inputExt)
      : config.ext;

  return withFFmpeg(async (ff) => {
    const inputName = createTempFileName('trim_input', inputExt);
    const outputName = createTempFileName('trim_output', outputExt);
    try {
      await ff.writeFile(inputName, input);

      // For OGG, try to extract cover art first to embed via METADATA_BLOCK_PICTURE
      let oggCoverArtBase64: string | null = null;
      if (targetFormat === 'ogg' && options.format !== 'source') {
        const coverData = await tryExtractCoverArt(ff, inputName);
        if (coverData) {
          const mimeType = detectImageMimeType(coverData);
          oggCoverArtBase64 = buildMetadataBlockPicture(coverData, mimeType);
        }
      }

      // Seek and limit the input, so filters such as silence removal only
      // ever see the selected range.
      const args: string[] = [
        '-ss',
        String(options.startTime),
        '-t',
        String(duration),
        '-i',
        inputName,
      ];

      if (isPassthrough || !config) {
        // Copy the original audio (and attachments like cover art) without re-encoding
        args.push('-map_metadata', '0');
        args.push('-map', '0:a:0');
        args.push('-map', '0:v?');
        args.push('-c', 'copy');
      } else {
        // Silence removal filter if enabled
        if (options.removeSilence) {
          // silenceremove filter:
          // - stop_periods=-1: remove all silence periods
          // - stop_threshold: amplitude threshold in dB
          // - stop_duration: minimum duration of silence to remove
          const threshold = 10 ** (options.silenceThreshold / 20); // Convert dB to amplitude
          args.push(
            '-af',
            `silenceremove=stop_periods=-1:stop_duration=${options.silenceDuration}:stop_threshold=${threshold}`,
          );
        }

        // Output codec settings
        args.push('-map', '0:a:0');
        args.push('-map_metadata', '0');

        // Cover art handling
        // OGG uses METADATA_BLOCK_PICTURE (handled separately), not video stream mapping
        if (config.supportsCoverArt && targetFormat !== 'ogg') {
          // Map video stream (cover art) if present - the "?" makes it optional
          args.push('-map', '0:v?');
          args.push('-c:v', 'copy');
          args.push('-disposition:v', 'attached_pic');
        } else {
          // Strip video for OGG (uses METADATA_BLOCK_PICTURE) and WAV (no cover support)
          args.push('-vn');
        }

        args.push('-c:a', config.codec);

        // Bitrate for lossy formats (also when re-encoding the original format)
        if (!config.lossless) {
          args.push('-b:a', options.bitrate);
        }

        // OGG: add cover art via METADATA_BLOCK_PICTURE Vorbis comment
        if (oggCoverArtBase64) {
          args.push('-metadata', `METADATA_BLOCK_PICTURE=${oggCoverArtBase64}`);
        }

        // AIFF: enable ID3v2 tags to store cover art
        if (targetFormat === 'aiff') {
          args.push('-write_id3v2', '1');
        }
      }

      args.push('-y', outputName);

      const logs = await execWithProgress(ff, args, onProgress);
      const data = await readOutputFile(ff, outputName);
      if (data.length === 0) {
        throw new Error(
          `FFmpeg produced an empty trimmed file.${formatLogDetails(logs)}`,
        );
      }
      return {
        data,
        filename: `${baseName}_trimmed.${outputExt}`,
        mime: config?.mime ?? 'application/octet-stream',
      };
    } finally {
      await cleanupFiles(ff, [inputName, outputName]);
    }
  });
}

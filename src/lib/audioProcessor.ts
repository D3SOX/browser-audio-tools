import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

export type ProgressCallback = (progress: { percent: number }) => void;

export type NoiseType = 'white' | 'pink';

export interface NoiseOptions {
  durationSeconds?: number;
  noiseVolume?: number;
  noiseType?: NoiseType;
  bitrate?: string;
}

export interface ProcessResult {
  data: Uint8Array;
  filename: string;
  mime: string;
}

const CORE_VERSION = '0.12.10';
const CORE_MT_BASE_URL = `https://cdn.jsdelivr.net/npm/@ffmpeg/core-mt@${CORE_VERSION}/dist/esm`;
const CORE_SINGLE_BASE_URL = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/esm`;

let ffmpeg: FFmpeg | null = null;
let loadPromise: Promise<void> | null = null;
let coreSelectionLogged = false;

function selectCoreBaseURL(): { baseURL: string; reason: string } {
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
      baseURL: CORE_MT_BASE_URL,
      reason:
        'Using multi-threaded core: crossOriginIsolated with SAB/Atomics available.',
    };
  }

  return {
    baseURL: CORE_SINGLE_BASE_URL,
    reason: `Falling back to single-threaded core: missing ${missing.join(', ')}.`,
  };
}

function translateFFmpegLoadError(error: unknown): Error {
  if (error instanceof Error) {
    return new Error(
      `FFmpeg failed to load. A content or privacy blocker may be blocking blob: scripts. Try disabling blockers for this site or use a different browser. Error: ${error.message}`,
    );
  }
  return new Error(
    `FFmpeg failed to load. A content or privacy blocker may be blocking blob: scripts. Try disabling blockers for this site or use a different browser. Error: ${String(error)}`,
  );
}

async function ensureFFmpegLoaded(): Promise<FFmpeg> {
  if (ffmpeg?.loaded) return ffmpeg;

  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const { baseURL: coreBaseURL, reason } = selectCoreBaseURL();
        if (!coreSelectionLogged) {
          console.info('[ffmpeg] core selection', {
            version: CORE_VERSION,
            core: coreBaseURL.includes('core-mt')
              ? 'core-mt (multi-threaded)'
              : 'core (single-threaded)',
            reason,
          });
          coreSelectionLogged = true;
        }
        // In preview/static hosting environments we may not be cross-origin
        // isolated, so fall back to the single-threaded core to avoid
        // SharedArrayBuffer errors.
        ffmpeg = new FFmpeg();
        const coreURL = await toBlobURL(
          `${coreBaseURL}/ffmpeg-core.js`,
          'text/javascript',
        );
        const wasmURL = await toBlobURL(
          `${coreBaseURL}/ffmpeg-core.wasm`,
          'application/wasm',
        );
        const workerURL = await toBlobURL(
          `${coreBaseURL}/ffmpeg-core.worker.js`,
          'text/javascript',
        );
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

function cleanupFiles(ff: FFmpeg, names: string[]) {
  for (const name of names) {
    try {
      ff.deleteFile(name);
    } catch {
      // ignore
    }
  }
}

function createLogCollector(ff: FFmpeg) {
  const logs: string[] = [];
  const handler = ({ message }: { message: string }) => {
    if (logs.length >= 50) {
      logs.shift();
    }
    logs.push(message);
  };
  return {
    attach() {
      ff.on('log', handler);
    },
    detach() {
      ff.off('log', handler);
    },
    tail(count = 10) {
      return logs.slice(-count);
    },
  };
}

async function execWithProgress(
  ff: FFmpeg,
  args: string[],
  onProgress?: ProgressCallback,
): Promise<void> {
  let lastPercent = -1;

  const handler = onProgress
    ? ({ progress }: { progress: number }) => {
        // Clamp to 0-99 (we'll set 100 on completion)
        const percent = Math.max(0, Math.min(99, Math.round(progress * 100)));
        // Only emit if changed to reduce re-renders
        if (percent !== lastPercent) {
          lastPercent = percent;
          onProgress({ percent });
        }
      }
    : undefined;

  if (handler) {
    ff.on('progress', handler);
  }

  try {
    await ff.exec(args);
    // Signal completion
    onProgress?.({ percent: 100 });
  } finally {
    if (handler) {
      ff.off('progress', handler);
    }
  }
}

export async function addNoiseAndConcat(
  input: Uint8Array,
  options: NoiseOptions = {},
  onProgress?: ProgressCallback,
): Promise<ProcessResult> {
  const ff = await ensureFFmpegLoaded();

  const inputName = 'input.mp3';
  const outputName = 'output.mp3';
  const noiseColor: NoiseType = options.noiseType ?? 'pink';
  const duration = Math.max(1, options.durationSeconds ?? 180);
  const amplitude = options.noiseVolume ?? 0.05;
  const bitrate = options.bitrate ?? '192k';

  await ff.writeFile(inputName, input);

  const filterComplex =
    noiseColor === 'pink'
      ? '[0:a]highpass=f=20,lowpass=f=4000[n];[n][1:a]concat=n=2:v=0:a=1[aout]'
      : '[0:a][1:a]concat=n=2:v=0:a=1[aout]';

  try {
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

    const data = await ff.readFile(outputName);
    if (!(data instanceof Uint8Array)) {
      throw new Error('Unexpected ffmpeg output');
    }
    return {
      data,
      filename: outputName,
      mime: 'audio/mpeg',
    };
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? error.message
        : 'Failed to process audio with ffmpeg.wasm',
    );
  } finally {
    cleanupFiles(ff, [inputName, outputName]);
  }
}

export async function extractCover(
  input: Uint8Array,
  onProgress?: ProgressCallback,
): Promise<ProcessResult> {
  const ff = await ensureFFmpegLoaded();

  const inputName = 'input.mp3';
  const outputName = 'cover.jpg';

  await ff.writeFile(inputName, input);

  try {
    await execWithProgress(
      ff,
      ['-i', inputName, '-an', '-vcodec', 'copy', '-y', outputName],
      onProgress,
    );
    const data = await ff.readFile(outputName);
    if (!(data instanceof Uint8Array)) {
      throw new Error('Unexpected ffmpeg output');
    }

    return {
      data,
      filename: outputName,
      mime: 'image/jpeg',
    };
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : 'Failed to extract cover image',
    );
  } finally {
    cleanupFiles(ff, [inputName, outputName]);
  }
}

export interface ID3Metadata {
  title: string;
  artist: string;
  album: string;
  year?: string;
  track?: string;
}

export async function readMetadata(
  input: Uint8Array,
  inputFilename: string,
  onProgress?: ProgressCallback,
): Promise<ID3Metadata> {
  const ff = await ensureFFmpegLoaded();

  const ext = inputFilename?.split('.').pop()?.toLowerCase();
  const inputName = `meta_input.${ext}`;
  const outputName = 'metadata.txt';

  await ff.writeFile(inputName, input);

  try {
    await execWithProgress(
      ff,
      ['-i', inputName, '-f', 'ffmetadata', '-y', outputName],
      onProgress,
    );
    const data = await ff.readFile(outputName);
    const text =
      data instanceof Uint8Array
        ? new TextDecoder().decode(data)
        : (data as string);

    const metadata: ID3Metadata = {
      title: '',
      artist: '',
      album: '',
      year: '',
      track: '',
    };

    for (const line of text.split('\n')) {
      const eqIndex = line.indexOf('=');
      if (eqIndex === -1) continue;
      const key = line.slice(0, eqIndex).toLowerCase().trim();
      const value = line.slice(eqIndex + 1).trim();
      if (key === 'title') metadata.title = value;
      else if (key === 'artist') metadata.artist = value;
      else if (key === 'album') metadata.album = value;
      else if (key === 'date' || key === 'year') metadata.year = value;
      else if (key === 'track') metadata.track = value;
    }

    return metadata;
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : 'Failed to read metadata',
    );
  } finally {
    cleanupFiles(ff, [inputName, outputName]);
  }
}

export async function retagMp3(
  input: Uint8Array,
  metadata: ID3Metadata,
  outputFilename?: string,
  onProgress?: ProgressCallback,
  cover?: Uint8Array,
): Promise<ProcessResult> {
  const ff = await ensureFFmpegLoaded();

  const inputName = 'input.mp3';
  const coverName = 'cover.jpg';
  const outName = outputFilename ?? 'output.mp3';
  const filesToCleanup = [inputName, outName];

  await ff.writeFile(inputName, input);

  if (cover) {
    await ff.writeFile(coverName, cover);
    filesToCleanup.push(coverName);
  }

  const args = ['-i', inputName];

  if (cover) {
    args.push('-i', coverName);
  }

  args.push(
    '-map',
    '0:a',
    '-c:a',
    'copy',
    '-id3v2_version',
    '3',
    '-map_metadata',
    '-1', // Clear existing metadata
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

  if (metadata.title) {
    args.push('-metadata', `title=${metadata.title}`);
  }
  if (metadata.artist) {
    args.push('-metadata', `artist=${metadata.artist}`);
  }
  if (metadata.album) {
    args.push('-metadata', `album=${metadata.album}`);
  }
  if (metadata.year) {
    args.push('-metadata', `date=${metadata.year}`);
  }
  if (metadata.track) {
    args.push('-metadata', `track=${metadata.track}`);
  }

  args.push('-y', outName);

  try {
    await execWithProgress(ff, args, onProgress);
    const data = await ff.readFile(outName);
    if (!(data instanceof Uint8Array)) {
      throw new Error('Unexpected ffmpeg output');
    }
    return {
      data,
      filename: outName,
      mime: 'audio/mpeg',
    };
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : 'Failed to retag MP3',
    );
  } finally {
    cleanupFiles(ff, filesToCleanup);
  }
}

export interface ConvertOptions {
  title?: string;
  artist?: string;
  album?: string;
  year?: string;
  track?: string;
}

// Generic converter types (AAC removed due to wasm encoder issues)
export type OutputFormat = 'mp3' | 'ogg' | 'aac' | 'wav' | 'flac' | 'aiff';
export type TrimOutputFormat = OutputFormat | 'source';
export type SampleRate = 44100 | 48000 | 96000;
export type Channels = 1 | 2 | 'auto';

export interface GenericConvertOptions {
  format: OutputFormat;
  bitrate: string; // e.g., "128k", "192k", "320k" (ignored for lossless)
  sampleRate: SampleRate;
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
const FORMAT_CAPABILITIES: Record<
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

/**
 * Detect MIME type from image data by checking magic bytes.
 */
function detectImageMimeType(data: Uint8Array): string {
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47
  ) {
    return 'image/png';
  }
  // Default to JPEG
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
  const coverName = 'extracted_cover.jpg';
  try {
    // Try to extract cover art - this will fail silently if none exists
    await ff.exec(['-i', inputName, '-an', '-vcodec', 'copy', '-y', coverName]);
    const data = await ff.readFile(coverName);
    if (data instanceof Uint8Array && data.length > 0) {
      return data;
    }
  } catch {
    // No cover art found, that's fine
  } finally {
    try {
      ff.deleteFile(coverName);
    } catch {
      // Ignore cleanup errors
    }
  }
  return null;
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
  if (!caps.sampleRates.includes(options.sampleRate)) {
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

export async function convertAudio(
  input: Uint8Array,
  inputFilename: string,
  options: GenericConvertOptions,
  outputBaseName?: string,
  onProgress?: ProgressCallback,
): Promise<ProcessResult> {
  assertGenericConvertCompatibility(options);
  const normalizedBitrate = parseBitrateKbps(options.bitrate);

  const ff = await ensureFFmpegLoaded();
  const logs = createLogCollector(ff);

  const config = FORMAT_CONFIG[options.format];
  const inputExt = inputFilename.split('.').pop()?.toLowerCase() ?? 'wav';
  const inputName = `input.${inputExt}`;
  const baseName = outputBaseName ?? inputFilename.replace(/\.[^.]+$/, '');
  const outName = `${baseName}.${config.ext}`;

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

  args.push('-c:a', config.codec, '-ar', String(options.sampleRate));

  // Only set channel count when explicitly requested; "auto" preserves source layout.
  if (options.channels !== 'auto') {
    args.push('-ac', String(options.channels));
  }

  // Vorbis: prefer quality scale for stability across mono/stereo and bitrates
  if (options.format === 'ogg') {
    const quality = VORBIS_Q_FOR_BITRATE[normalizedBitrate] ?? 4;
    args.push('-qscale:a', String(quality));

    // Add cover art via METADATA_BLOCK_PICTURE Vorbis comment
    if (oggCoverArtBase64) {
      args.push('-metadata', `METADATA_BLOCK_PICTURE=${oggCoverArtBase64}`);
    }
  } else if (!config.lossless) {
    // Lossy formats: set explicit bitrate
    args.push('-b:a', normalizedBitrate);
  }

  // AIFF: enable ID3v2 tags to store cover art
  if (options.format === 'aiff') {
    args.push('-write_id3v2', '1');
  }

  args.push('-y', outName);

  logs.attach();
  try {
    await execWithProgress(ff, args, onProgress);
    const data = await ff.readFile(outName);
    if (!(data instanceof Uint8Array)) {
      throw new Error('Unexpected ffmpeg output');
    }
    if (data.length === 0) {
      const logTail = logs.tail().join(' | ');
      const extra = logTail ? ` Details: ${logTail}` : '';
      throw new Error(
        `FFmpeg produced an empty ${options.format.toUpperCase()} file. Try 44.1/48 kHz and a standard bitrate.${extra}`,
      );
    }
    return {
      data,
      filename: outName,
      mime: config.mime,
    };
  } catch (error) {
    const logTail = logs.tail().join(' | ');
    const extra = logTail ? ` Details: ${logTail}` : '';
    throw new Error(
      (error instanceof Error ? error.message : 'Failed to convert audio') +
        extra,
    );
  } finally {
    logs.detach();
    cleanupFiles(ff, [inputName, outName]);
  }
}

export async function convertWavToMp3WithMetadata(
  wavInput: Uint8Array,
  mp3Source: Uint8Array | undefined,
  options: ConvertOptions = {},
  outputFilename?: string,
  onProgress?: ProgressCallback,
  cover?: Uint8Array,
): Promise<ProcessResult> {
  const ff = await ensureFFmpegLoaded();

  const wavName = 'input.wav';
  const mp3Name = 'source.mp3';
  const coverName = 'cover.jpg';
  const outName = outputFilename ?? 'output.mp3';
  const filesToCleanup = [wavName, outName];

  await ff.writeFile(wavName, wavInput);

  if (mp3Source) {
    await ff.writeFile(mp3Name, mp3Source);
    filesToCleanup.push(mp3Name);
  }

  if (cover) {
    await ff.writeFile(coverName, cover);
    filesToCleanup.push(coverName);
  }

  // Build ffmpeg arguments based on available inputs
  const args: string[] = ['-i', wavName];

  if (mp3Source) {
    args.push('-i', mp3Name);
  }

  // Track which input index the cover is at (for -map)
  let coverInputIndex: number | null = null;
  if (cover) {
    coverInputIndex = mp3Source ? 2 : 1;
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
    // Use cover from MP3 source if available
    args.push('-map', '1:v?');
  }

  if (options.title !== undefined) {
    args.push('-metadata', `title=${options.title}`);
  }
  if (options.artist !== undefined) {
    args.push('-metadata', `artist=${options.artist}`);
  }
  if (options.album !== undefined) {
    args.push('-metadata', `album=${options.album}`);
  }
  if (options.year !== undefined) {
    args.push('-metadata', `date=${options.year}`);
  }
  if (options.track !== undefined) {
    args.push('-metadata', `track=${options.track}`);
  }

  args.push('-y', outName);

  try {
    await execWithProgress(ff, args, onProgress);
    const data = await ff.readFile(outName);
    if (!(data instanceof Uint8Array)) {
      throw new Error('Unexpected ffmpeg output');
    }
    return {
      data,
      filename: outName,
      mime: 'audio/mpeg',
    };
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : 'Failed to convert WAV to MP3',
    );
  } finally {
    cleanupFiles(ff, filesToCleanup);
  }
}

export async function trimAudio(
  input: Uint8Array,
  inputFilename: string,
  options: TrimOptions,
  outputBaseName?: string,
  onProgress?: ProgressCallback,
): Promise<ProcessResult> {
  const ff = await ensureFFmpegLoaded();
  const logs = createLogCollector(ff);

  const inputExt = inputFilename.split('.').pop()?.toLowerCase() ?? 'mp3';
  const sourceFormat = INPUT_EXT_TO_OUTPUT_FORMAT[inputExt];
  const targetFormat =
    options.format === 'source' ? sourceFormat : options.format;
  if (!targetFormat) {
    throw new Error(
      `Keeping the original format is not supported for ".${inputExt}" files yet.`,
    );
  }
  const config = FORMAT_CONFIG[targetFormat];
  const inputName = `input.${inputExt}`;
  const baseName = outputBaseName ?? inputFilename.replace(/\.[^.]+$/, '');
  const outputExt = options.format === 'source' ? inputExt : config.ext;
  const outName = `${baseName}_trimmed.${outputExt}`;

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

  const args: string[] = [];

  const duration = options.endTime - options.startTime;
  if (duration <= 0) {
    throw new Error('Trim end time must be after start time.');
  }

  // Seek to start position (before input for faster seeking)
  args.push('-ss', String(options.startTime));
  args.push('-i', inputName);

  // Duration (end - start)
  args.push('-t', String(duration));

  // Build filter chain
  const filters: string[] = [];

  // Silence removal filter if enabled
  if (options.removeSilence) {
    // silenceremove filter:
    // - stop_periods=-1: remove all silence periods
    // - stop_threshold: amplitude threshold in dB
    // - stop_duration: minimum duration of silence to remove
    // - stop_silence: leave some silence (0 = remove completely)
    const threshold = 10 ** (options.silenceThreshold / 20); // Convert dB to amplitude
    filters.push(
      `silenceremove=stop_periods=-1:stop_duration=${options.silenceDuration}:stop_threshold=${threshold}`,
    );
  }

  if (filters.length > 0) {
    args.push('-af', filters.join(','));
  }

  const isPassthrough = options.format === 'source' && filters.length === 0;

  if (isPassthrough) {
    // Copy the original audio (and attachments like cover art) without re-encoding
    args.push('-map_metadata', '0');
    args.push('-map', '0:a:0');
    args.push('-map', '0:v?');
    args.push('-c', 'copy');
  } else {
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

    // Bitrate for lossy formats when explicitly re-encoding to a new format
    if (!config.lossless && options.format !== 'source') {
      args.push('-b:a', options.bitrate);
    }

    // OGG: add cover art via METADATA_BLOCK_PICTURE Vorbis comment
    if (targetFormat === 'ogg' && oggCoverArtBase64) {
      args.push('-metadata', `METADATA_BLOCK_PICTURE=${oggCoverArtBase64}`);
    }

    // AIFF: enable ID3v2 tags to store cover art
    if (targetFormat === 'aiff') {
      args.push('-write_id3v2', '1');
    }
  }

  args.push('-y', outName);

  logs.attach();
  try {
    await execWithProgress(ff, args, onProgress);
    const data = await ff.readFile(outName);
    if (!(data instanceof Uint8Array)) {
      throw new Error('Unexpected ffmpeg output');
    }
    if (data.length === 0) {
      const logTail = logs.tail().join(' | ');
      const extra = logTail ? ` Details: ${logTail}` : '';
      throw new Error(`FFmpeg produced an empty trimmed file.${extra}`);
    }
    return {
      data,
      filename: outName,
      mime: config.mime,
    };
  } catch (error) {
    const logTail = logs.tail().join(' | ');
    const extra = logTail ? ` Details: ${logTail}` : '';
    throw new Error(
      (error instanceof Error ? error.message : 'Failed to trim audio') + extra,
    );
  } finally {
    logs.detach();
    cleanupFiles(ff, [inputName, outName]);
  }
}

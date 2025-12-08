import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";

export type ProgressCallback = (progress: { percent: number }) => void;

export type NoiseType = "white" | "pink";

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

const CORE_VERSION = "0.12.10";
const CORE_BASE_URL = `https://cdn.jsdelivr.net/npm/@ffmpeg/core-mt@${CORE_VERSION}/dist/esm`;

let ffmpeg: FFmpeg | null = null;
let loadPromise: Promise<void> | null = null;

function translateFFmpegLoadError(error: unknown): Error {
  if (error instanceof Error) {
    return new Error(
      `FFmpeg failed to load. A content or privacy blocker may be blocking blob: scripts. Try disabling blockers for this site or use a different browser. Error: ${error.message}`
    );
  }
  return new Error(
    `FFmpeg failed to load. A content or privacy blocker may be blocking blob: scripts. Try disabling blockers for this site or use a different browser. Error: ${String(error)}`
  );
}

async function ensureFFmpegLoaded(): Promise<FFmpeg> {
  if (ffmpeg?.loaded) return ffmpeg;

  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        ffmpeg = new FFmpeg();
        const coreURL = await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.js`, "text/javascript");
        const wasmURL = await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.wasm`, "application/wasm");
        const workerURL = await toBlobURL(
          `${CORE_BASE_URL}/ffmpeg-core.worker.js`,
          "text/javascript"
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
  return ffmpeg!;
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
      ff.on("log", handler);
    },
    detach() {
      ff.off("log", handler);
    },
    tail(count = 10) {
      return logs.slice(-count);
    },
  };
}

async function execWithProgress(
  ff: FFmpeg,
  args: string[],
  onProgress?: ProgressCallback
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
    ff.on("progress", handler);
  }

  try {
    await ff.exec(args);
    // Signal completion
    onProgress?.({ percent: 100 });
  } finally {
    if (handler) {
      ff.off("progress", handler);
    }
  }
}

export async function addNoiseAndConcat(
  input: Uint8Array,
  options: NoiseOptions = {},
  onProgress?: ProgressCallback
): Promise<ProcessResult> {
  const ff = await ensureFFmpegLoaded();

  const inputName = "input.mp3";
  const outputName = "output.mp3";
  const noiseColor: NoiseType = options.noiseType ?? "pink";
  const duration = Math.max(1, options.durationSeconds ?? 180);
  const amplitude = options.noiseVolume ?? 0.05;
  const bitrate = options.bitrate ?? "192k";

  await ff.writeFile(inputName, input);

  const filterComplex =
    noiseColor === "pink"
      ? "[0:a]highpass=f=20,lowpass=f=4000[n];[n][1:a]concat=n=2:v=0:a=1[aout]"
      : "[0:a][1:a]concat=n=2:v=0:a=1[aout]";

  try {
    await execWithProgress(
      ff,
      [
        "-f",
        "lavfi",
        "-i",
        `anoisesrc=color=${noiseColor}:duration=${duration}:amplitude=${amplitude}`,
        "-i",
        inputName,
        "-filter_complex",
        filterComplex,
        "-map",
        "[aout]",
        "-c:a",
        "libmp3lame",
        "-b:a",
        bitrate,
        "-y",
        outputName,
      ],
      onProgress
    );

    const data = await ff.readFile(outputName);
    if (!(data instanceof Uint8Array)) {
      throw new Error("Unexpected ffmpeg output");
    }
    return {
      data,
      filename: outputName,
      mime: "audio/mpeg",
    };
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : "Failed to process audio with ffmpeg.wasm"
    );
  } finally {
    cleanupFiles(ff, [inputName, outputName]);
  }
}

export async function extractCover(
  input: Uint8Array,
  onProgress?: ProgressCallback
): Promise<ProcessResult> {
  const ff = await ensureFFmpegLoaded();

  const inputName = "input.mp3";
  const outputName = "cover.jpg";

  await ff.writeFile(inputName, input);

  try {
    await execWithProgress(
      ff,
      ["-i", inputName, "-an", "-vcodec", "copy", "-y", outputName],
      onProgress
    );
    const data = await ff.readFile(outputName);
    if (!(data instanceof Uint8Array)) {
      throw new Error("Unexpected ffmpeg output");
    }

    return {
      data,
      filename: outputName,
      mime: "image/jpeg",
    };
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "Failed to extract cover image");
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
  onProgress?: ProgressCallback
): Promise<ID3Metadata> {
  const ff = await ensureFFmpegLoaded();

  const inputName = "meta_input.mp3";
  const outputName = "metadata.txt";

  await ff.writeFile(inputName, input);

  try {
    await execWithProgress(
      ff,
      ["-i", inputName, "-f", "ffmetadata", "-y", outputName],
      onProgress
    );
    const data = await ff.readFile(outputName);
    const text =
      data instanceof Uint8Array ? new TextDecoder().decode(data) : (data as string);

    const metadata: ID3Metadata = { title: "", artist: "", album: "", year: "", track: "" };

    for (const line of text.split("\n")) {
      const eqIndex = line.indexOf("=");
      if (eqIndex === -1) continue;
      const key = line.slice(0, eqIndex).toLowerCase().trim();
      const value = line.slice(eqIndex + 1).trim();
      if (key === "title") metadata.title = value;
      else if (key === "artist") metadata.artist = value;
      else if (key === "album") metadata.album = value;
      else if (key === "date" || key === "year") metadata.year = value;
      else if (key === "track") metadata.track = value;
    }

    return metadata;
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "Failed to read metadata");
  } finally {
    cleanupFiles(ff, [inputName, outputName]);
  }
}

export async function retagMp3(
  input: Uint8Array,
  metadata: ID3Metadata,
  outputFilename?: string,
  onProgress?: ProgressCallback,
  cover?: Uint8Array
): Promise<ProcessResult> {
  const ff = await ensureFFmpegLoaded();

  const inputName = "input.mp3";
  const coverName = "cover.jpg";
  const outName = outputFilename ?? "output.mp3";
  const filesToCleanup = [inputName, outName];

  await ff.writeFile(inputName, input);

  if (cover) {
    await ff.writeFile(coverName, cover);
    filesToCleanup.push(coverName);
  }

  const args = ["-i", inputName];

  if (cover) {
    args.push("-i", coverName);
  }

  args.push(
    "-map", "0:a",
    "-c:a", "copy",
    "-id3v2_version", "3",
    "-map_metadata", "-1" // Clear existing metadata
  );

  if (cover) {
    args.push(
      "-map", "1:v",
      "-c:v", "copy",
      "-metadata:s:v", "title=Album cover",
      "-metadata:s:v", "comment=Cover (front)"
    );
  }

  if (metadata.title) {
    args.push("-metadata", `title=${metadata.title}`);
  }
  if (metadata.artist) {
    args.push("-metadata", `artist=${metadata.artist}`);
  }
  if (metadata.album) {
    args.push("-metadata", `album=${metadata.album}`);
  }
  if (metadata.year) {
    args.push("-metadata", `date=${metadata.year}`);
  }
  if (metadata.track) {
    args.push("-metadata", `track=${metadata.track}`);
  }

  args.push("-y", outName);

  try {
    await execWithProgress(ff, args, onProgress);
    const data = await ff.readFile(outName);
    if (!(data instanceof Uint8Array)) {
      throw new Error("Unexpected ffmpeg output");
    }
    return {
      data,
      filename: outName,
      mime: "audio/mpeg",
    };
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : "Failed to retag MP3"
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
export type OutputFormat = "mp3" | "ogg" | "aac" | "wav" | "flac" | "aiff";
export type SampleRate = 44100 | 48000 | 96000;
export type Channels = 1 | 2 | "auto";

export interface GenericConvertOptions {
  format: OutputFormat;
  bitrate: string; // e.g., "128k", "192k", "320k" (ignored for lossless)
  sampleRate: SampleRate;
  channels: Channels;
}

export interface TrimOptions {
  startTime: number; // seconds
  endTime: number; // seconds
  format: OutputFormat;
  bitrate: string;
  removeSilence: boolean;
  silenceThreshold: number; // dB (e.g., -50)
  silenceDuration: number; // seconds (minimum silence duration to remove)
}

const FORMAT_CONFIG: Record<OutputFormat, { codec: string; ext: string; mime: string; lossless: boolean }> = {
  mp3: { codec: "libmp3lame", ext: "mp3", mime: "audio/mpeg", lossless: false },
  ogg: { codec: "libvorbis", ext: "ogg", mime: "audio/ogg", lossless: false },
  aac: { codec: "aac", ext: "m4a", mime: "audio/mp4", lossless: false },
  wav: { codec: "pcm_s16le", ext: "wav", mime: "audio/wav", lossless: true },
  flac: { codec: "flac", ext: "flac", mime: "audio/flac", lossless: true },
  aiff: { codec: "pcm_s16be", ext: "aiff", mime: "audio/aiff", lossless: true },
};

// Compatibility guardrails: avoid encoder/decoder failures by only allowing
// sample rate and channel combinations that are broadly supported in browsers
// for each output format.
const FORMAT_CAPABILITIES: Record<OutputFormat, { sampleRates: SampleRate[]; channels: Channels[] }> = {
  mp3: { sampleRates: [44100, 48000], channels: [1, 2] },
  // Vorbis supports higher rates; 96k kept for hi-res, 44.1/48 for compatibility.
  ogg: { sampleRates: [44100, 48000, 96000], channels: [1, 2] },
  // AAC encoder in ffmpeg.wasm is most reliable at common rates/channels
  aac: { sampleRates: [44100, 48000], channels: [1, 2] },
  wav: { sampleRates: [44100, 48000, 96000], channels: [1, 2] },
  flac: { sampleRates: [44100, 48000, 96000], channels: [1, 2] },
  aiff: { sampleRates: [44100, 48000, 96000], channels: [1, 2] },
};

const VORBIS_Q_FOR_BITRATE: Record<string, number> = {
  "96k": 2.7,
  "128k": 4,
  "160k": 4.8,
  "192k": 5.5,
  "256k": 6.5,
  "320k": 7.5,
};

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
        " / "
      )}. Please pick one of those values.`
    );
  }
  // Allow "auto" to pass through without forcing channel layout
  if (options.channels !== "auto" && !caps.channels.includes(options.channels)) {
    throw new Error(
      `${options.format.toUpperCase()} supports channels ${caps.channels.join(
        " or "
      )}. Please pick a supported value.`
    );
  }
}

export async function convertAudio(
  input: Uint8Array,
  inputFilename: string,
  options: GenericConvertOptions,
  outputBaseName?: string,
  onProgress?: ProgressCallback
): Promise<ProcessResult> {
  assertGenericConvertCompatibility(options);
  const normalizedBitrate = parseBitrateKbps(options.bitrate);

  const ff = await ensureFFmpegLoaded();
  const logs = createLogCollector(ff);

  const config = FORMAT_CONFIG[options.format];
  const inputExt = inputFilename.split(".").pop()?.toLowerCase() ?? "wav";
  const inputName = `input.${inputExt}`;
  const baseName = outputBaseName ?? inputFilename.replace(/\.[^.]+$/, "");
  const outName = `${baseName}.${config.ext}`;

  await ff.writeFile(inputName, input);

  const args = [
    "-i",
    inputName,
    // Force only the primary audio stream (skip album art / video)
    "-map",
    "0:a:0",
    "-vn",
  ];

  args.push(
    "-c:a",
    config.codec,
    "-ar",
    String(options.sampleRate),
  );

  // Only set channel count when explicitly requested; "auto" preserves source layout.
  if (options.channels !== "auto") {
    args.push("-ac", String(options.channels));
  }

  // Vorbis: prefer quality scale for stability across mono/stereo and bitrates
  if (options.format === "ogg") {
    const quality = VORBIS_Q_FOR_BITRATE[normalizedBitrate] ?? 4;
    args.push("-qscale:a", String(quality));
  } else if (!config.lossless) {
    // Lossy formats: set explicit bitrate
    args.push("-b:a", normalizedBitrate);
  }

  args.push("-y", outName);

  logs.attach();
  try {
    await execWithProgress(ff, args, onProgress);
    const data = await ff.readFile(outName);
    if (!(data instanceof Uint8Array)) {
      throw new Error("Unexpected ffmpeg output");
    }
    if (data.length === 0) {
      const logTail = logs.tail().join(" | ");
      const extra = logTail ? ` Details: ${logTail}` : "";
      throw new Error(
        `FFmpeg produced an empty ${options.format.toUpperCase()} file. Try 44.1/48 kHz and a standard bitrate.${extra}`
      );
    }
    return {
      data,
      filename: outName,
      mime: config.mime,
    };
  } catch (error) {
    const logTail = logs.tail().join(" | ");
    const extra = logTail ? ` Details: ${logTail}` : "";
    throw new Error((error instanceof Error ? error.message : "Failed to convert audio") + extra);
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
  cover?: Uint8Array
): Promise<ProcessResult> {
  const ff = await ensureFFmpegLoaded();

  const wavName = "input.wav";
  const mp3Name = "source.mp3";
  const coverName = "cover.jpg";
  const outName = outputFilename ?? "output.mp3";
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
  const args: string[] = ["-i", wavName];

  if (mp3Source) {
    args.push("-i", mp3Name);
  }

  // Track which input index the cover is at (for -map)
  let coverInputIndex: number | null = null;
  if (cover) {
    coverInputIndex = mp3Source ? 2 : 1;
    args.push("-i", coverName);
  }

  args.push(
    "-map", "0:a",
    "-c:a", "libmp3lame",
    "-b:a", "320k",
    "-id3v2_version", "3"
  );

  // Copy metadata from MP3 source if provided
  if (mp3Source) {
    args.push("-map_metadata", "1");
  }

  if (cover) {
    // Use the provided cover image
    args.push(
      "-map", `${coverInputIndex}:v`,
      "-c:v", "copy",
      "-metadata:s:v", "title=Album cover",
      "-metadata:s:v", "comment=Cover (front)"
    );
  } else if (mp3Source) {
    // Use cover from MP3 source if available
    args.push("-map", "1:v?");
  }

  if (options.title !== undefined) {
    args.push("-metadata", `title=${options.title}`);
  }
  if (options.artist !== undefined) {
    args.push("-metadata", `artist=${options.artist}`);
  }
  if (options.album !== undefined) {
    args.push("-metadata", `album=${options.album}`);
  }
  if (options.year !== undefined) {
    args.push("-metadata", `date=${options.year}`);
  }
  if (options.track !== undefined) {
    args.push("-metadata", `track=${options.track}`);
  }

  args.push("-y", outName);

  try {
    await execWithProgress(ff, args, onProgress);
    const data = await ff.readFile(outName);
    if (!(data instanceof Uint8Array)) {
      throw new Error("Unexpected ffmpeg output");
    }
    return {
      data,
      filename: outName,
      mime: "audio/mpeg",
    };
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : "Failed to convert WAV to MP3"
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
  onProgress?: ProgressCallback
): Promise<ProcessResult> {
  const ff = await ensureFFmpegLoaded();
  const logs = createLogCollector(ff);

  const config = FORMAT_CONFIG[options.format];
  const inputExt = inputFilename.split(".").pop()?.toLowerCase() ?? "mp3";
  const inputName = `input.${inputExt}`;
  const baseName = outputBaseName ?? inputFilename.replace(/\.[^.]+$/, "");
  const outName = `${baseName}_trimmed.${config.ext}`;

  await ff.writeFile(inputName, input);

  const args: string[] = [];

  const duration = options.endTime - options.startTime;
  if (duration <= 0) {
    throw new Error("Trim end time must be after start time.");
  }

  // Seek to start position (before input for faster seeking)
  args.push("-ss", String(options.startTime));
  args.push("-i", inputName);

  // Duration (end - start)
  args.push("-t", String(duration));

  // Build filter chain
  const filters: string[] = [];

  // Silence removal filter if enabled
  if (options.removeSilence) {
    // silenceremove filter:
    // - stop_periods=-1: remove all silence periods
    // - stop_threshold: amplitude threshold in dB
    // - stop_duration: minimum duration of silence to remove
    // - stop_silence: leave some silence (0 = remove completely)
    const threshold = Math.pow(10, options.silenceThreshold / 20); // Convert dB to amplitude
    filters.push(
      `silenceremove=stop_periods=-1:stop_duration=${options.silenceDuration}:stop_threshold=${threshold}`
    );
  }

  if (filters.length > 0) {
    args.push("-af", filters.join(","));
  }

  // Output codec settings (audio only)
  args.push("-map", "0:a:0", "-vn");
  args.push("-c:a", config.codec);

  // Bitrate for lossy formats
  if (!config.lossless) {
    args.push("-b:a", options.bitrate);
  }

  args.push("-y", outName);

  logs.attach();
  try {
    await execWithProgress(ff, args, onProgress);
    const data = await ff.readFile(outName);
    if (!(data instanceof Uint8Array)) {
      throw new Error("Unexpected ffmpeg output");
    }
    if (data.length === 0) {
      const logTail = logs.tail().join(" | ");
      const extra = logTail ? ` Details: ${logTail}` : "";
      throw new Error(`FFmpeg produced an empty trimmed file.${extra}`);
    }
    return {
      data,
      filename: outName,
      mime: config.mime,
    };
  } catch (error) {
    const logTail = logs.tail().join(" | ");
    const extra = logTail ? ` Details: ${logTail}` : "";
    throw new Error((error instanceof Error ? error.message : "Failed to trim audio") + extra);
  } finally {
    logs.detach();
    cleanupFiles(ff, [inputName, outName]);
  }
}

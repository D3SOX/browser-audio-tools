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
    if (/Failed to fetch dynamically imported module/.test(error.message)) {
      return new Error(
        "FFmpeg failed to load. A content or privacy blocker may be blocking blob: scripts. Try disabling blockers for this site or use a different browser."
      );
    }
    return new Error(`Failed to load ffmpeg.wasm: ${error.message}`);
  }
  return new Error("Failed to load ffmpeg.wasm");
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
  onProgress?: ProgressCallback
): Promise<ProcessResult> {
  const ff = await ensureFFmpegLoaded();

  const inputName = "input.mp3";
  const outName = outputFilename ?? "output.mp3";

  await ff.writeFile(inputName, input);

  const args = [
    "-i",
    inputName,
    "-c",
    "copy",
    "-id3v2_version",
    "3",
    "-map_metadata",
    "-1", // Clear existing metadata
  ];

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
    cleanupFiles(ff, [inputName, outName]);
  }
}

export interface ConvertOptions {
  title?: string;
  artist?: string;
  album?: string;
  year?: string;
  track?: string;
}

// Generic converter types
export type OutputFormat = "mp3" | "ogg" | "aac" | "wav" | "flac" | "aiff";
export type SampleRate = 44100 | 48000 | 96000;
export type Channels = 1 | 2;

export interface GenericConvertOptions {
  format: OutputFormat;
  bitrate: string; // e.g., "128k", "192k", "320k" (ignored for lossless)
  sampleRate: SampleRate;
  channels: Channels;
}

const FORMAT_CONFIG: Record<OutputFormat, { codec: string; ext: string; mime: string; lossless: boolean }> = {
  mp3: { codec: "libmp3lame", ext: "mp3", mime: "audio/mpeg", lossless: false },
  ogg: { codec: "libvorbis", ext: "ogg", mime: "audio/ogg", lossless: false },
  aac: { codec: "aac", ext: "m4a", mime: "audio/mp4", lossless: false },
  wav: { codec: "pcm_s16le", ext: "wav", mime: "audio/wav", lossless: true },
  flac: { codec: "flac", ext: "flac", mime: "audio/flac", lossless: true },
  aiff: { codec: "pcm_s16be", ext: "aiff", mime: "audio/aiff", lossless: true },
};

export async function convertAudio(
  input: Uint8Array,
  inputFilename: string,
  options: GenericConvertOptions,
  outputBaseName?: string,
  onProgress?: ProgressCallback
): Promise<ProcessResult> {
  const ff = await ensureFFmpegLoaded();

  const config = FORMAT_CONFIG[options.format];
  const inputExt = inputFilename.split(".").pop()?.toLowerCase() ?? "wav";
  const inputName = `input.${inputExt}`;
  const baseName = outputBaseName ?? inputFilename.replace(/\.[^.]+$/, "");
  const outName = `${baseName}.${config.ext}`;

  await ff.writeFile(inputName, input);

  const args = [
    "-i",
    inputName,
    "-c:a",
    config.codec,
  ];

  // Only add bitrate for lossy formats
  if (!config.lossless) {
    args.push("-b:a", options.bitrate);
  }

  args.push(
    "-ar",
    String(options.sampleRate),
    "-ac",
    String(options.channels),
  );

  // AAC needs special container handling
  if (options.format === "aac") {
    args.push("-f", "ipod"); // M4A container
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
      mime: config.mime,
    };
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : "Failed to convert audio"
    );
  } finally {
    cleanupFiles(ff, [inputName, outName]);
  }
}

export async function convertWavToMp3WithMetadata(
  wavInput: Uint8Array,
  mp3Source: Uint8Array,
  options: ConvertOptions = {},
  outputFilename?: string,
  onProgress?: ProgressCallback
): Promise<ProcessResult> {
  const ff = await ensureFFmpegLoaded();

  const wavName = "input.wav";
  const mp3Name = "source.mp3";
  const outName = outputFilename ?? "output.mp3";

  await ff.writeFile(wavName, wavInput);
  await ff.writeFile(mp3Name, mp3Source);

  const args = [
    "-i",
    wavName,
    "-i",
    mp3Name,
    "-map",
    "0:a",
    "-map",
    "1:v?",
    "-c:a",
    "libmp3lame",
    "-b:a",
    "320k",
    "-id3v2_version",
    "3",
    "-map_metadata",
    "1",
  ];

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
      error instanceof Error ? error.message : "Failed to retag WAV into MP3"
    );
  } finally {
    cleanupFiles(ff, [wavName, mp3Name, outName]);
  }
}

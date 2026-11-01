import { zipSync } from 'fflate';
import {
  addNoiseAndConcat,
  type Channels,
  type ConvertOptions,
  convertAudio as convertAudioLib,
  convertWavToMp3WithMetadata as convertWavLib,
  extractCover as extractCoverLib,
  FORMAT_CAPABILITIES,
  formatSupportsCoverArt,
  type GenericConvertOptions,
  type ID3Metadata,
  type NoiseType,
  type OutputFormat,
  type ProcessResult,
  type ProgressCallback,
  readMetadata as readMetadataLib,
  retagMp3 as retagMp3Lib,
  type SampleRate,
  type TrimOptions,
  type TrimOutputFormat,
  trimAudio as trimAudioLib,
} from '../lib/audioProcessor';

export type {
  Channels,
  ConvertOptions,
  GenericConvertOptions,
  ID3Metadata,
  NoiseType,
  OutputFormat,
  ProgressCallback,
  SampleRate,
  TrimOptions,
  TrimOutputFormat,
};
export { FORMAT_CAPABILITIES, formatSupportsCoverArt };

export type BatchProgressCallback = (progress: {
  percent: number;
  currentFile: number;
  totalFiles: number;
}) => void;

export interface ProcessOptions {
  durationSeconds: number;
  noiseVolume: number;
  noiseType: NoiseType;
  bitrate: string;
  prependNoise?: boolean;
}

export interface ApiResult {
  blob: Blob;
  filename: string;
  contentType: string;
}

export interface BatchApiResult {
  zip: ApiResult;
  items: ApiResult[];
}

// The input buffer is handed off to the FFmpeg worker, so read a fresh copy
// for every call.
async function readFile(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

function baseName(file: File): string {
  return file.name.replace(/\.[^.]+$/, '');
}

function noiseFilename(file: File): string {
  return `${baseName(file)}_noise.mp3`;
}

function coverFilename(file: File, result: ProcessResult): string {
  const ext = result.filename.split('.').pop() ?? 'jpg';
  return `${baseName(file)}_cover.${ext}`;
}

function toApiResult(
  result: ProcessResult,
  filename = result.filename,
  contentType = result.mime,
): ApiResult {
  return {
    // FFmpeg output is backed by a regular ArrayBuffer (never shared).
    blob: new Blob([result.data as Uint8Array<ArrayBuffer>], {
      type: contentType,
    }),
    filename,
    contentType,
  };
}

export async function processAudio(
  file: File,
  options: ProcessOptions,
  onProgress?: ProgressCallback,
): Promise<ApiResult> {
  const result = await addNoiseAndConcat(
    await readFile(file),
    options,
    onProgress,
  );
  return toApiResult(result, noiseFilename(file));
}

export async function extractCover(
  file: File,
  onProgress?: ProgressCallback,
): Promise<ApiResult> {
  const result = await extractCoverLib(await readFile(file), onProgress);
  return toApiResult(result, coverFilename(file, result));
}

export async function readMetadataFromFile(file: File): Promise<ID3Metadata> {
  return readMetadataLib(await readFile(file), file.name);
}

export async function convertWavToMp3(
  wavFile: File,
  mp3SourceFile: File | null,
  options: ConvertOptions = {},
  outputFilename?: string,
  onProgress?: ProgressCallback,
  cover?: Uint8Array,
): Promise<ApiResult> {
  const result = await convertWavLib(
    await readFile(wavFile),
    mp3SourceFile ? await readFile(mp3SourceFile) : undefined,
    options,
    outputFilename,
    onProgress,
    cover,
  );
  return toApiResult(result);
}

export async function convertAudio(
  file: File,
  options: GenericConvertOptions,
  outputBaseName?: string,
  onProgress?: ProgressCallback,
): Promise<ApiResult> {
  const result = await convertAudioLib(
    await readFile(file),
    file.name,
    options,
    outputBaseName,
    onProgress,
  );
  return toApiResult(result);
}

export async function retagMp3(
  file: File,
  metadata: ID3Metadata,
  onProgress?: ProgressCallback,
  cover?: Uint8Array,
  outputFilename?: string,
): Promise<ApiResult> {
  const finalFilename =
    outputFilename ?? `${file.name.replace(/\.mp3$/i, '')}_retagged.mp3`;
  const result = await retagMp3Lib(
    await readFile(file),
    metadata,
    finalFilename,
    onProgress,
    cover,
  );
  return toApiResult(result);
}

export async function trimAudio(
  file: File,
  options: TrimOptions,
  onProgress?: ProgressCallback,
): Promise<ApiResult> {
  const result = await trimAudioLib(
    await readFile(file),
    file.name,
    options,
    undefined,
    onProgress,
  );
  // Formats the library doesn't know keep their original MIME type.
  const contentType =
    result.mime === 'application/octet-stream' && file.type
      ? file.type
      : result.mime;
  return toApiResult(result, result.filename, contentType);
}

// --- Batch processing functions ---

function createZipBlob(files: { name: string; data: Uint8Array }[]): Blob {
  const zipData: Record<string, Uint8Array> = {};
  for (const file of files) {
    zipData[file.name] = file.data;
  }
  // Audio and images are already compressed; skip deflate to keep zipping fast.
  const zipped = zipSync(zipData, { level: 0 });
  return new Blob([zipped as Uint8Array<ArrayBuffer>], {
    type: 'application/zip',
  });
}

function getUniqueFilename(name: string, usedNames: Set<string>): string {
  if (!usedNames.has(name)) {
    usedNames.add(name);
    return name;
  }
  const ext =
    name.lastIndexOf('.') > 0 ? name.slice(name.lastIndexOf('.')) : '';
  const base = name.slice(0, name.length - ext.length);
  let counter = 1;
  let newName = `${base}_${counter}${ext}`;
  while (usedNames.has(newName)) {
    counter++;
    newName = `${base}_${counter}${ext}`;
  }
  usedNames.add(newName);
  return newName;
}

/**
 * Process files one by one and bundle the results into a ZIP. `process`
 * returns null to skip a file.
 */
async function processBatch(
  files: File[],
  zipFilename: string,
  process: (
    file: File,
    onProgress: ProgressCallback,
  ) => Promise<{ result: ProcessResult; filename: string } | null>,
  onProgress?: BatchProgressCallback,
): Promise<BatchApiResult> {
  const items: { result: ProcessResult; name: string }[] = [];
  const usedNames = new Set<string>();

  for (const [i, file] of files.entries()) {
    const fileProgress: ProgressCallback = ({ percent }) => {
      onProgress?.({
        percent: Math.round(((i + percent / 100) / files.length) * 100),
        currentFile: i + 1,
        totalFiles: files.length,
      });
    };
    const processed = await process(file, fileProgress);
    if (processed) {
      items.push({
        result: processed.result,
        name: getUniqueFilename(processed.filename, usedNames),
      });
    }
  }

  onProgress?.({
    percent: 100,
    currentFile: files.length,
    totalFiles: files.length,
  });

  return {
    zip: {
      blob: createZipBlob(
        items.map(({ result, name }) => ({ name, data: result.data })),
      ),
      filename: zipFilename,
      contentType: 'application/zip',
    },
    items: items.map(({ result, name }) => toApiResult(result, name)),
  };
}

export function processAudioBatch(
  files: File[],
  options: ProcessOptions,
  onProgress?: BatchProgressCallback,
): Promise<BatchApiResult> {
  return processBatch(
    files,
    'audio_with_noise.zip',
    async (file, fileProgress) => ({
      result: await addNoiseAndConcat(
        await readFile(file),
        options,
        fileProgress,
      ),
      filename: noiseFilename(file),
    }),
    onProgress,
  );
}

export async function extractCoverBatch(
  files: File[],
  onProgress?: BatchProgressCallback,
): Promise<BatchApiResult> {
  const batch = await processBatch(
    files,
    'covers.zip',
    async (file, fileProgress) => {
      try {
        const result = await extractCoverLib(
          await readFile(file),
          fileProgress,
        );
        return { result, filename: coverFilename(file, result) };
      } catch {
        // Skip files without covers
        console.warn(`No cover found in ${file.name}`);
        return null;
      }
    },
    onProgress,
  );
  if (batch.items.length === 0) {
    throw new Error('No covers found in any of the selected files.');
  }
  return batch;
}

export function convertAudioBatch(
  files: File[],
  options: GenericConvertOptions,
  onProgress?: BatchProgressCallback,
): Promise<BatchApiResult> {
  return processBatch(
    files,
    `converted_${options.format}.zip`,
    async (file, fileProgress) => {
      const result = await convertAudioLib(
        await readFile(file),
        file.name,
        options,
        undefined,
        fileProgress,
      );
      return { result, filename: result.filename };
    },
    onProgress,
  );
}

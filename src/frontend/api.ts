import {
  addNoiseAndConcat,
  type Channels,
  type ConvertOptions,
  convertAudio as convertAudioLib,
  convertWavToMp3WithMetadata as convertWavLib,
  extractCover as extractCoverLib,
  formatSupportsCoverArt,
  type GenericConvertOptions,
  type ID3Metadata,
  type NoiseOptions,
  type OutputFormat,
  type ProgressCallback,
  readMetadata as readMetadataLib,
  retagMp3 as retagMp3Lib,
  type SampleRate,
  type TrimOptions,
  type TrimOutputFormat,
  trimAudio as trimAudioLib,
} from '../lib/audioProcessor';

export { formatSupportsCoverArt };

import { zipSync } from 'fflate';

export type NoiseType = 'white' | 'pink';
export type {
  ID3Metadata,
  ConvertOptions,
  GenericConvertOptions,
  OutputFormat,
  SampleRate,
  Channels,
  ProgressCallback,
  TrimOptions,
  TrimOutputFormat,
};

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

export async function processAudio(
  file: File,
  options: ProcessOptions,
  onProgress?: ProgressCallback,
): Promise<ApiResult> {
  const input = new Uint8Array(await file.arrayBuffer());

  const noiseOpts: NoiseOptions = {
    durationSeconds: options.durationSeconds,
    noiseVolume: options.noiseVolume,
    noiseType: options.noiseType,
    bitrate: options.bitrate,
  };

  const result = await addNoiseAndConcat(input, noiseOpts, onProgress);

  return {
    blob: new Blob([new Uint8Array(result.data)], { type: result.mime }),
    filename: result.filename,
    contentType: result.mime,
  };
}

export async function extractCover(
  file: File,
  onProgress?: ProgressCallback,
): Promise<ApiResult> {
  const input = new Uint8Array(await file.arrayBuffer());
  const result = await extractCoverLib(input, onProgress);

  return {
    blob: new Blob([new Uint8Array(result.data)], { type: result.mime }),
    filename: result.filename,
    contentType: result.mime,
  };
}

export async function readMetadataFromFile(file: File): Promise<ID3Metadata> {
  const input = new Uint8Array(await file.arrayBuffer());
  return readMetadataLib(input);
}

export async function convertWavToMp3(
  wavFile: File,
  mp3SourceFile: File | null,
  options: ConvertOptions = {},
  outputFilename?: string,
  onProgress?: ProgressCallback,
  cover?: Uint8Array,
): Promise<ApiResult> {
  const wavInput = new Uint8Array(await wavFile.arrayBuffer());
  const mp3Source = mp3SourceFile
    ? new Uint8Array(await mp3SourceFile.arrayBuffer())
    : undefined;

  const result = await convertWavLib(
    wavInput,
    mp3Source,
    options,
    outputFilename,
    onProgress,
    cover,
  );

  return {
    blob: new Blob([new Uint8Array(result.data)], { type: result.mime }),
    filename: result.filename,
    contentType: result.mime,
  };
}

export async function convertAudio(
  file: File,
  options: GenericConvertOptions,
  outputBaseName?: string,
  onProgress?: ProgressCallback,
): Promise<ApiResult> {
  const input = new Uint8Array(await file.arrayBuffer());
  const result = await convertAudioLib(
    input,
    file.name,
    options,
    outputBaseName,
    onProgress,
  );

  return {
    blob: new Blob([new Uint8Array(result.data)], { type: result.mime }),
    filename: result.filename,
    contentType: result.mime,
  };
}

export async function retagMp3(
  file: File,
  metadata: ID3Metadata,
  onProgress?: ProgressCallback,
  cover?: Uint8Array,
  outputFilename?: string,
): Promise<ApiResult> {
  const input = new Uint8Array(await file.arrayBuffer());
  const finalFilename =
    outputFilename ?? file.name.replace(/\.mp3$/i, '') + '_retagged.mp3';
  const result = await retagMp3Lib(
    input,
    metadata,
    finalFilename,
    onProgress,
    cover,
  );

  return {
    blob: new Blob([new Uint8Array(result.data)], { type: result.mime }),
    filename: result.filename,
    contentType: result.mime,
  };
}

export async function trimAudio(
  file: File,
  options: TrimOptions,
  onProgress?: ProgressCallback,
): Promise<ApiResult> {
  const input = new Uint8Array(await file.arrayBuffer());
  const result = await trimAudioLib(
    input,
    file.name,
    options,
    undefined,
    onProgress,
  );

  return {
    blob: new Blob([new Uint8Array(result.data)], { type: result.mime }),
    filename: result.filename,
    contentType: result.mime,
  };
}

// --- Batch processing functions ---

function createZipBlob(files: { name: string; data: Uint8Array }[]): Blob {
  const zipData: Record<string, Uint8Array> = {};
  for (const file of files) {
    zipData[file.name] = file.data;
  }
  const zipped = zipSync(zipData);
  const bufferCopy = new Uint8Array(zipped); // ensures ArrayBuffer (not SharedArrayBuffer)
  return new Blob([bufferCopy], { type: 'application/zip' });
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

export async function processAudioBatch(
  files: File[],
  options: ProcessOptions,
  onProgress?: BatchProgressCallback,
): Promise<BatchApiResult> {
  const results: { name: string; data: Uint8Array }[] = [];
  const usedNames = new Set<string>();

  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    const input = new Uint8Array(await file.arrayBuffer());

    const noiseOpts: NoiseOptions = {
      durationSeconds: options.durationSeconds,
      noiseVolume: options.noiseVolume,
      noiseType: options.noiseType,
      bitrate: options.bitrate,
    };

    const fileProgress: ProgressCallback = ({ percent }) => {
      const overallPercent = Math.round(
        ((i + percent / 100) / files.length) * 100,
      );
      onProgress?.({
        percent: overallPercent,
        currentFile: i + 1,
        totalFiles: files.length,
      });
    };

    const result = await addNoiseAndConcat(input, noiseOpts, fileProgress);
    const outputName = file.name.replace(/\.[^.]+$/, '') + '_noise.mp3';
    results.push({
      name: getUniqueFilename(outputName, usedNames),
      data: new Uint8Array(result.data),
    });
  }

  onProgress?.({
    percent: 100,
    currentFile: files.length,
    totalFiles: files.length,
  });

  const zip: ApiResult = {
    blob: createZipBlob(results),
    filename: 'audio_with_noise.zip',
    contentType: 'application/zip',
  };

  const items: ApiResult[] = results.map((item) => ({
    blob: new Blob([new Uint8Array(item.data)], { type: 'audio/mpeg' }),
    filename: item.name,
    contentType: 'audio/mpeg',
  }));

  return { zip, items };
}

export async function extractCoverBatch(
  files: File[],
  onProgress?: BatchProgressCallback,
): Promise<BatchApiResult> {
  const results: { name: string; data: Uint8Array }[] = [];
  const usedNames = new Set<string>();

  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    const input = new Uint8Array(await file.arrayBuffer());

    const fileProgress: ProgressCallback = ({ percent }) => {
      const overallPercent = Math.round(
        ((i + percent / 100) / files.length) * 100,
      );
      onProgress?.({
        percent: overallPercent,
        currentFile: i + 1,
        totalFiles: files.length,
      });
    };

    try {
      const result = await extractCoverLib(input, fileProgress);
      const outputName = file.name.replace(/\.[^.]+$/, '') + '_cover.jpg';
      results.push({
        name: getUniqueFilename(outputName, usedNames),
        data: new Uint8Array(result.data),
      });
    } catch {
      // Skip files without covers
      console.warn(`No cover found in ${file.name}`);
    }
  }

  onProgress?.({
    percent: 100,
    currentFile: files.length,
    totalFiles: files.length,
  });

  if (results.length === 0) {
    throw new Error('No covers found in any of the selected files.');
  }

  const zip: ApiResult = {
    blob: createZipBlob(results),
    filename: 'covers.zip',
    contentType: 'application/zip',
  };

  const items: ApiResult[] = results.map((item) => ({
    blob: new Blob([new Uint8Array(item.data)], { type: 'image/jpeg' }),
    filename: item.name,
    contentType: 'image/jpeg',
  }));

  return { zip, items };
}

export async function convertAudioBatch(
  files: File[],
  options: GenericConvertOptions,
  onProgress?: BatchProgressCallback,
): Promise<BatchApiResult> {
  const results: { name: string; data: Uint8Array; mime: string }[] = [];
  const usedNames = new Set<string>();

  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    const input = new Uint8Array(await file.arrayBuffer());

    const fileProgress: ProgressCallback = ({ percent }) => {
      const overallPercent = Math.round(
        ((i + percent / 100) / files.length) * 100,
      );
      onProgress?.({
        percent: overallPercent,
        currentFile: i + 1,
        totalFiles: files.length,
      });
    };

    const result = await convertAudioLib(
      input,
      file.name,
      options,
      undefined,
      fileProgress,
    );
    results.push({
      name: getUniqueFilename(result.filename, usedNames),
      data: new Uint8Array(result.data),
      mime: result.mime,
    });
  }

  onProgress?.({
    percent: 100,
    currentFile: files.length,
    totalFiles: files.length,
  });

  const zip: ApiResult = {
    blob: createZipBlob(results.map(({ name, data }) => ({ name, data }))),
    filename: `converted_${options.format}.zip`,
    contentType: 'application/zip',
  };

  const items: ApiResult[] = results.map((item) => ({
    blob: new Blob([new Uint8Array(item.data)], { type: item.mime }),
    filename: item.name,
    contentType: item.mime,
  }));

  return { zip, items };
}

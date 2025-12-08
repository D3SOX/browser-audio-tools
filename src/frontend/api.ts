import {
  addNoiseAndConcat,
  extractCover as extractCoverLib,
  readMetadata as readMetadataLib,
  convertWavToMp3WithMetadata as convertWavLib,
  convertAudio as convertAudioLib,
  retagMp3 as retagMp3Lib,
  type NoiseOptions,
  type ID3Metadata,
  type ConvertOptions,
  type GenericConvertOptions,
  type OutputFormat,
  type SampleRate,
  type Channels,
  type ProgressCallback,
} from "../lib/audioProcessor";

export type NoiseType = "white" | "pink";
export type { ID3Metadata, ConvertOptions, GenericConvertOptions, OutputFormat, SampleRate, Channels, ProgressCallback };

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

export async function processAudio(
  file: File,
  options: ProcessOptions,
  onProgress?: ProgressCallback
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
  onProgress?: ProgressCallback
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
  mp3SourceFile: File,
  options: ConvertOptions = {},
  outputFilename?: string,
  onProgress?: ProgressCallback
): Promise<ApiResult> {
  const wavInput = new Uint8Array(await wavFile.arrayBuffer());
  const mp3Source = new Uint8Array(await mp3SourceFile.arrayBuffer());

  const result = await convertWavLib(wavInput, mp3Source, options, outputFilename, onProgress);

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
  onProgress?: ProgressCallback
): Promise<ApiResult> {
  const input = new Uint8Array(await file.arrayBuffer());
  const result = await convertAudioLib(input, file.name, options, outputBaseName, onProgress);

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
  cover?: Uint8Array
): Promise<ApiResult> {
  const input = new Uint8Array(await file.arrayBuffer());
  const outputFilename = file.name.replace(/\.mp3$/i, "") + "_retagged.mp3";
  const result = await retagMp3Lib(input, metadata, outputFilename, onProgress, cover);

  return {
    blob: new Blob([new Uint8Array(result.data)], { type: result.mime }),
    filename: result.filename,
    contentType: result.mime,
  };
}

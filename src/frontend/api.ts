import {
  addNoiseAndConcat,
  extractCover as extractCoverLib,
  readMetadata as readMetadataLib,
  convertWavToMp3WithMetadata as convertWavLib,
  type NoiseOptions,
  type ID3Metadata,
  type ConvertOptions,
} from "../lib/audioProcessor";

export type NoiseType = "white" | "pink";
export type { ID3Metadata, ConvertOptions };

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

export async function processAudio(file: File, options: ProcessOptions): Promise<ApiResult> {
  const input = new Uint8Array(await file.arrayBuffer());

  const noiseOpts: NoiseOptions = {
    durationSeconds: options.durationSeconds,
    noiseVolume: options.noiseVolume,
    noiseType: options.noiseType,
    bitrate: options.bitrate,
  };

  const result = await addNoiseAndConcat(input, noiseOpts);

  return {
    blob: new Blob([result.data], { type: result.mime }),
    filename: result.filename,
    contentType: result.mime,
  };
}

export async function extractCover(file: File): Promise<ApiResult> {
  const input = new Uint8Array(await file.arrayBuffer());
  const result = await extractCoverLib(input);

  return {
    blob: new Blob([result.data], { type: result.mime }),
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
  outputFilename?: string
): Promise<ApiResult> {
  const wavInput = new Uint8Array(await wavFile.arrayBuffer());
  const mp3Source = new Uint8Array(await mp3SourceFile.arrayBuffer());

  const result = await convertWavLib(wavInput, mp3Source, options, outputFilename);

  return {
    blob: new Blob([result.data], { type: result.mime }),
    filename: result.filename,
    contentType: result.mime,
  };
}

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import type { ProcessOptions, ID3Metadata, GenericConvertOptions, OutputFormat, ProgressCallback } from "./api";
import { extractCover, processAudio, readMetadataFromFile, convertWavToMp3, convertAudio, retagMp3 } from "./api";
import "./styles.css";
import { useTheme } from "./hooks/useTheme";
import { Hero } from "./components/Hero";
import { OperationPicker } from "./components/OperationPicker";
import { AudioFilePicker } from "./components/AudioFilePicker";
import { ConvertFilesSection } from "./components/ConvertFilesSection";
import { GenericConvertSection } from "./components/GenericConvertSection";
import { RetagSection } from "./components/RetagSection";
import { NoiseOptions } from "./components/NoiseOptions";
import { ActionsSection } from "./components/ActionsSection";
import { Footer } from "./components/Footer";
import type { Operation } from "./types";

const defaultMetadata: ID3Metadata = {
  title: "",
  artist: "",
  album: "",
  year: "",
  track: "",
};

const defaultOptions: ProcessOptions = {
  durationSeconds: 180,
  noiseVolume: 0.05,
  noiseType: "pink",
  bitrate: "192k",
};

const defaultGenericConvertOptions: GenericConvertOptions = {
  format: "mp3",
  bitrate: "320k",
  sampleRate: 48000,
  channels: 2,
};

const LOSSLESS_FORMATS: OutputFormat[] = ["wav", "flac", "aiff"];

type OperationResult = {
  status: string | null;
  error: string | null;
  downloadUrl: string | null;
  downloadName: string | null;
  previewUrl: string | null;
  progress: number | null;
  processing: boolean;
};

const createEmptyResult = (): OperationResult => ({
  status: null,
  error: null,
  downloadUrl: null,
  downloadName: null,
  previewUrl: null,
  progress: null,
  processing: false,
});

const createEmptyResultsMap = (): Record<Operation, OperationResult> => ({
  noise: createEmptyResult(),
  cover: createEmptyResult(),
  convert: createEmptyResult(),
  "generic-convert": createEmptyResult(),
  retag: createEmptyResult(),
});

export default function App() {
  const { theme, setTheme } = useTheme();
  const [file, setFile] = useState<File | null>(null);
  const [operation, setOperation] = useState<Operation>("noise");
  const [options, setOptions] = useState<ProcessOptions>(defaultOptions);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [resultsByOperation, setResultsByOperation] = useState<Record<Operation, OperationResult>>(createEmptyResultsMap);
  const currentOperationRef = useRef<Operation>("noise");

  // Convert operation state
  const [wavFile, setWavFile] = useState<File | null>(null);
  const [mp3SourceFile, setMp3SourceFile] = useState<File | null>(null);
  const [metadata, setMetadata] = useState<ID3Metadata>(defaultMetadata);
  const [loadingMetadata, setLoadingMetadata] = useState(false);
  const [dragOverWav, setDragOverWav] = useState(false);
  const [dragOverMp3, setDragOverMp3] = useState(false);

  // Generic converter state
  const [genericConvertFile, setGenericConvertFile] = useState<File | null>(null);
  const [genericConvertOptions, setGenericConvertOptions] = useState<GenericConvertOptions>(defaultGenericConvertOptions);
  const [dragOverGeneric, setDragOverGeneric] = useState(false);

  // Retag MP3 state
  const [retagFile, setRetagFile] = useState<File | null>(null);
  const [retagMetadata, setRetagMetadata] = useState<ID3Metadata>(defaultMetadata);
  const [loadingRetagMetadata, setLoadingRetagMetadata] = useState(false);
  const [dragOverRetag, setDragOverRetag] = useState(false);
  const [retagCover, setRetagCover] = useState<Uint8Array | null>(null);
  const [retagCoverPreviewUrl, setRetagCoverPreviewUrl] = useState<string | null>(null);

  // Progress state
  const [progress, setProgress] = useState<number | null>(null);

  const isLosslessFormat = LOSSLESS_FORMATS.includes(genericConvertOptions.format);

  useEffect(() => {
    currentOperationRef.current = operation;
  }, [operation]);

  const replaceOperationResult = useCallback(
    (op: Operation, nextResult: OperationResult) => {
      setResultsByOperation((prev) => {
        const prevResult = prev[op];
        if (prevResult?.downloadUrl && prevResult.downloadUrl !== nextResult.downloadUrl) {
          URL.revokeObjectURL(prevResult.downloadUrl);
        }
        if (
          prevResult?.previewUrl &&
          prevResult.previewUrl !== nextResult.previewUrl &&
          prevResult.previewUrl !== prevResult.downloadUrl
        ) {
          URL.revokeObjectURL(prevResult.previewUrl);
        }
        return { ...prev, [op]: nextResult };
      });

      if (currentOperationRef.current === op) {
        setStatus(nextResult.status);
        setError(nextResult.error);
        setDownloadUrl(nextResult.downloadUrl);
        setDownloadName(nextResult.downloadName);
        setPreviewUrl(nextResult.previewUrl);
        setProgress(nextResult.progress);
        setProcessing(nextResult.processing);
      }
    },
    []
  );

  const clearResults = useCallback(() => {
    replaceOperationResult(operation, createEmptyResult());
    setProgress(null);
  }, [operation, replaceOperationResult]);

  const handleOperationChange = useCallback(
    (nextOperation: Operation) => {
      setOperation(nextOperation);
      const savedResult = resultsByOperation[nextOperation] ?? createEmptyResult();
      setStatus(savedResult.status);
      setError(savedResult.error);
      setDownloadUrl(savedResult.downloadUrl);
      setDownloadName(savedResult.downloadName);
      setPreviewUrl(savedResult.previewUrl);
      setProgress(savedResult.progress);
      setProcessing(savedResult.processing);
    },
    [resultsByOperation]
  );

  const handleWavFileSelect = useCallback(
    (nextFile: File | null) => {
      setWavFile(nextFile);
      clearResults();
    },
    [clearResults]
  );

  const handleMp3SourceSelect = useCallback(
    async (nextFile: File | null) => {
      setMp3SourceFile(nextFile);
      clearResults();
      if (nextFile) {
        setLoadingMetadata(true);
        try {
          const meta = await readMetadataFromFile(nextFile);
          setMetadata(meta);
        } catch (err) {
          console.error("Failed to read metadata:", err);
          setMetadata(defaultMetadata);
        } finally {
          setLoadingMetadata(false);
        }
      } else {
        setMetadata(defaultMetadata);
      }
    },
    [clearResults]
  );

  const handleWavDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setDragOverWav(false);
      const droppedFile = e.dataTransfer.files?.[0];
      if (droppedFile && (droppedFile.type === "audio/wav" || droppedFile.name.endsWith(".wav"))) {
        handleWavFileSelect(droppedFile);
      }
    },
    [handleWavFileSelect]
  );

  const handleMp3Drop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setDragOverMp3(false);
      const droppedFile = e.dataTransfer.files?.[0];
      if (droppedFile && (droppedFile.type === "audio/mpeg" || droppedFile.name.endsWith(".mp3"))) {
        handleMp3SourceSelect(droppedFile);
      }
    },
    [handleMp3SourceSelect]
  );

  const updateMetadata = <K extends keyof ID3Metadata>(key: K, value: ID3Metadata[K]) => {
    setMetadata((prev) => ({ ...prev, [key]: value }));
  };

  const handleGenericConvertFileSelect = useCallback(
    (nextFile: File | null) => {
      setGenericConvertFile(nextFile);
      clearResults();
    },
    [clearResults]
  );

  const handleGenericConvertDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setDragOverGeneric(false);
      const droppedFile = e.dataTransfer.files?.[0];
      if (droppedFile && droppedFile.type.startsWith("audio/")) {
        handleGenericConvertFileSelect(droppedFile);
      }
    },
    [handleGenericConvertFileSelect]
  );

  const updateGenericConvertOption = <K extends keyof GenericConvertOptions>(key: K, value: GenericConvertOptions[K]) => {
    setGenericConvertOptions((prev) => ({ ...prev, [key]: value }));
  };

  const handleRetagFileSelect = useCallback(
    async (nextFile: File | null) => {
      setRetagFile(nextFile);
      clearResults();
      // Clean up previous cover preview URL
      if (retagCoverPreviewUrl) {
        URL.revokeObjectURL(retagCoverPreviewUrl);
      }
      setRetagCover(null);
      setRetagCoverPreviewUrl(null);

      if (nextFile) {
        setLoadingRetagMetadata(true);
        try {
          const meta = await readMetadataFromFile(nextFile);
          setRetagMetadata(meta);
        } catch (err) {
          console.error("Failed to read metadata:", err);
          setRetagMetadata(defaultMetadata);
        }
        // Try to extract existing cover
        try {
          const coverResult = await extractCover(nextFile);
          const coverData = new Uint8Array(await coverResult.blob.arrayBuffer());
          setRetagCover(coverData);
          setRetagCoverPreviewUrl(URL.createObjectURL(coverResult.blob));
        } catch {
          // No cover or extraction failed - that's fine
        }
        setLoadingRetagMetadata(false);
      } else {
        setRetagMetadata(defaultMetadata);
      }
    },
    [clearResults, retagCoverPreviewUrl]
  );

  const handleRetagDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setDragOverRetag(false);
      const droppedFile = e.dataTransfer.files?.[0];
      if (droppedFile && (droppedFile.type === "audio/mpeg" || droppedFile.name.endsWith(".mp3"))) {
        handleRetagFileSelect(droppedFile);
      }
    },
    [handleRetagFileSelect]
  );

  const updateRetagMetadata = <K extends keyof ID3Metadata>(key: K, value: ID3Metadata[K]) => {
    setRetagMetadata((prev) => ({ ...prev, [key]: value }));
  };

  const handleRetagCoverChange = useCallback(
    async (file: File | null) => {
      if (retagCoverPreviewUrl) {
        URL.revokeObjectURL(retagCoverPreviewUrl);
      }
      if (file) {
        const data = new Uint8Array(await file.arrayBuffer());
        setRetagCover(data);
        setRetagCoverPreviewUrl(URL.createObjectURL(file));
      } else {
        setRetagCover(null);
        setRetagCoverPreviewUrl(null);
      }
    },
    [retagCoverPreviewUrl]
  );

  const handleFileSelect = useCallback(
    (nextFile: File | null) => {
      setFile(nextFile);
      clearResults();
    },
    [clearResults]
  );

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    handleFileSelect(event.target.files?.[0] ?? null);
  };

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const droppedFile = e.dataTransfer.files?.[0];
      if (droppedFile && droppedFile.type.startsWith("audio/")) {
        handleFileSelect(droppedFile);
      }
    },
    [handleFileSelect]
  );

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const updateOption = <K extends keyof ProcessOptions>(key: K, value: ProcessOptions[K]) => {
    setOptions((prev) => ({ ...prev, [key]: value }));
  };

  const handleReset = useCallback(() => {
    setFile(null);
    setWavFile(null);
    setMp3SourceFile(null);
    setMetadata(defaultMetadata);
    setOptions(defaultOptions);
    setGenericConvertFile(null);
    setGenericConvertOptions(defaultGenericConvertOptions);
    setRetagFile(null);
    setRetagMetadata(defaultMetadata);
    if (retagCoverPreviewUrl) {
      URL.revokeObjectURL(retagCoverPreviewUrl);
    }
    setRetagCover(null);
    setRetagCoverPreviewUrl(null);
    setResultsByOperation((prev) => {
      Object.values(prev).forEach((result) => {
        if (result.downloadUrl) URL.revokeObjectURL(result.downloadUrl);
        if (result.previewUrl && result.previewUrl !== result.downloadUrl) URL.revokeObjectURL(result.previewUrl);
      });
      return createEmptyResultsMap();
    });
    setStatus(null);
    setError(null);
    setDownloadUrl(null);
    setDownloadName(null);
    setPreviewUrl(null);
    setProgress(null);
    setProcessing(false);
  }, [retagCoverPreviewUrl]);

  const submit = async () => {
    const activeOperation = operation;
    if (activeOperation === "convert") {
      if (!wavFile || !mp3SourceFile) {
        setError("Please choose both a WAV file and an MP3 source file.");
        return;
      }
    } else if (activeOperation === "generic-convert") {
      if (!genericConvertFile) {
        setError("Please choose an audio file to convert.");
        return;
      }
    } else if (activeOperation === "retag") {
      if (!retagFile) {
        setError("Please choose an MP3 file to retag.");
        return;
      }
    } else if (!file) {
      setError("Please choose an audio file.");
      return;
    }

    setProcessing(true);
    setError(null);
    setStatus("Processing...");
    setProgress(0);
    replaceOperationResult(activeOperation, {
      ...createEmptyResult(),
      status: "Processing...",
      progress: 0,
      processing: true,
    });

    const onProgress: ProgressCallback = ({ percent }) => {
      setProgress(percent);
      setResultsByOperation((prev) => ({
        ...prev,
        [activeOperation]: { ...prev[activeOperation], progress: percent, processing: true },
      }));
    };

    try {
      if (activeOperation === "noise") {
        const result = await processAudio(file!, options, onProgress);
        const url = URL.createObjectURL(result.blob);
        replaceOperationResult(activeOperation, {
          status: "Noise added and concatenated. Ready to download.",
          error: null,
          downloadUrl: url,
          downloadName: result.filename,
          previewUrl: url,
          progress: null,
          processing: false,
        });
      } else if (activeOperation === "cover") {
        const result = await extractCover(file!, onProgress);
        const url = URL.createObjectURL(result.blob);
        replaceOperationResult(activeOperation, {
          status: "Cover extracted. Ready to download.",
          error: null,
          downloadUrl: url,
          downloadName: result.filename,
          previewUrl: url,
          progress: null,
          processing: false,
        });
      } else if (activeOperation === "convert") {
        const outputName = mp3SourceFile!.name.replace(/\.mp3$/i, "") + ".mp3";
        const result = await convertWavToMp3(wavFile!, mp3SourceFile!, metadata, outputName, onProgress);
        const url = URL.createObjectURL(result.blob);
        replaceOperationResult(activeOperation, {
          status: "WAV retagged into 320kbps MP3 with metadata. Ready to download.",
          error: null,
          downloadUrl: url,
          downloadName: outputName,
          previewUrl: url,
          progress: null,
          processing: false,
        });
      } else if (activeOperation === "generic-convert") {
        const result = await convertAudio(genericConvertFile!, genericConvertOptions, undefined, onProgress);
        const url = URL.createObjectURL(result.blob);
        const formatLabel = genericConvertOptions.format.toUpperCase();
        const isLosslessFormat = LOSSLESS_FORMATS.includes(genericConvertOptions.format);
        const bitrateInfo = isLosslessFormat ? "lossless" : genericConvertOptions.bitrate;
        replaceOperationResult(activeOperation, {
          status: `Converted to ${formatLabel} (${bitrateInfo}). Ready to download.`,
          error: null,
          downloadUrl: url,
          downloadName: result.filename,
          previewUrl: url,
          progress: null,
          processing: false,
        });
      } else if (activeOperation === "retag") {
        const result = await retagMp3(retagFile!, retagMetadata, onProgress, retagCover ?? undefined);
        const url = URL.createObjectURL(result.blob);
        replaceOperationResult(activeOperation, {
          status: "MP3 retagged with new metadata. Ready to download.",
          error: null,
          downloadUrl: url,
          downloadName: result.filename,
          previewUrl: url,
          progress: null,
          processing: false,
        });
      }
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : "Something went wrong.";
      replaceOperationResult(activeOperation, {
        ...createEmptyResult(),
        error: message,
      });
    }
  };

  return (
    <div className="app-wrapper">
      <div className="app-container">
        <Hero theme={theme} setTheme={setTheme} />

        <main className="card">
          <OperationPicker operation={operation} onChange={handleOperationChange} />

          {operation !== "convert" && operation !== "generic-convert" && operation !== "retag" && (
            <AudioFilePicker file={file} dragOver={dragOver} onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onChange={handleFileChange} />
          )}

          {operation === "convert" && (
            <ConvertFilesSection
              wavFile={wavFile}
              mp3SourceFile={mp3SourceFile}
              dragOverWav={dragOverWav}
              dragOverMp3={dragOverMp3}
              loadingMetadata={loadingMetadata}
              metadata={metadata}
              onWavDrop={handleWavDrop}
              onMp3Drop={handleMp3Drop}
              onWavDragOver={(e) => {
                e.preventDefault();
                setDragOverWav(true);
              }}
              onWavDragLeave={(e) => {
                e.preventDefault();
                setDragOverWav(false);
              }}
              onMp3DragOver={(e) => {
                e.preventDefault();
                setDragOverMp3(true);
              }}
              onMp3DragLeave={(e) => {
                e.preventDefault();
                setDragOverMp3(false);
              }}
              onWavChange={handleWavFileSelect}
              onMp3Change={handleMp3SourceSelect}
              onMetadataChange={updateMetadata}
            />
          )}

          {operation === "generic-convert" && (
            <GenericConvertSection
              file={genericConvertFile}
              dragOver={dragOverGeneric}
              options={genericConvertOptions}
              isLosslessFormat={isLosslessFormat}
              onDrop={handleGenericConvertDrop}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverGeneric(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setDragOverGeneric(false);
              }}
              onFileChange={handleGenericConvertFileSelect}
              onOptionChange={updateGenericConvertOption}
            />
          )}

          {operation === "retag" && (
            <RetagSection
              file={retagFile}
              dragOver={dragOverRetag}
              loadingMetadata={loadingRetagMetadata}
              metadata={retagMetadata}
              coverPreviewUrl={retagCoverPreviewUrl}
              onDrop={handleRetagDrop}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverRetag(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setDragOverRetag(false);
              }}
              onFileChange={handleRetagFileSelect}
              onMetadataChange={updateRetagMetadata}
              onCoverChange={handleRetagCoverChange}
            />
          )}

          {operation === "noise" && <NoiseOptions options={options} onChange={updateOption} />}

          {operation === "cover" && (
            <section className="section">
              <h2 className="section-title">
                <span className="step-number">3</span>
                Cover extraction
              </h2>
              <p className="hint">We will extract the embedded cover as a JPEG if present.</p>
            </section>
          )}

          <ActionsSection
            processing={processing}
            loadingMetadata={loadingMetadata}
            loadingRetagMetadata={loadingRetagMetadata}
            progress={progress}
            status={status}
            error={error}
            downloadUrl={downloadUrl}
            downloadName={downloadName}
            previewUrl={previewUrl}
            operation={operation}
            genericConvertOptions={genericConvertOptions}
            onSubmit={submit}
            onReset={handleReset}
          />

          <Footer />
        </main>
      </div>
    </div>
  );
}

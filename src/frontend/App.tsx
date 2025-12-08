import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { Analytics } from "@vercel/analytics/react";
import { useAnalyticsConsent } from "./hooks/useAnalyticsConsent";
import { AnalyticsConsentModal } from "./components/AnalyticsConsentModal";
import type {
  ProcessOptions,
  ID3Metadata,
  GenericConvertOptions,
  OutputFormat,
  SampleRate,
  ProgressCallback,
  BatchProgressCallback,
  ApiResult,
} from "./api";
import { extractCover, processAudio, readMetadataFromFile, convertWavToMp3, convertAudio, retagMp3, processAudioBatch, extractCoverBatch, convertAudioBatch, trimAudio } from "./api";
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
import { TrimSection, type TrimOptions } from "./components/TrimSection";
import { VisualizerSection, type VisualizerHandle } from "./components/VisualizerSection";
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

const SAMPLE_RATES_BY_FORMAT: Record<OutputFormat, SampleRate[]> = {
  mp3: [44100, 48000],
  ogg: [44100, 48000],
  wav: [44100, 48000, 96000],
  flac: [44100, 48000, 96000],
  aiff: [44100, 48000, 96000],
};

const defaultTrimOptions: TrimOptions = {
  startTime: 0,
  endTime: 0,
  format: "mp3",
  bitrate: "320k",
  removeSilence: false,
  silenceThreshold: -50,
  silenceDuration: 0.5,
};

const LOSSLESS_FORMATS: OutputFormat[] = ["wav", "flac", "aiff"];

type OperationResult = {
  status: string | null;
  error: string | null;
  downloadUrl: string | null;
  downloadName: string | null;
  previewUrl: string | null;
  batchPreviews?: { name: string; url: string; type: "audio" | "image" }[] | null;
  progress: number | null;
  processing: boolean;
};

const createEmptyResult = (): OperationResult => ({
  status: null,
  error: null,
  downloadUrl: null,
  downloadName: null,
  previewUrl: null,
  batchPreviews: undefined,
  progress: null,
  processing: false,
});

const createEmptyResultsMap = (): Record<Operation, OperationResult> => ({
  noise: createEmptyResult(),
  cover: createEmptyResult(),
  convert: createEmptyResult(),
  "generic-convert": createEmptyResult(),
  retag: createEmptyResult(),
  trim: createEmptyResult(),
  visualize: createEmptyResult(),
});

export default function App() {
  const { theme, setTheme } = useTheme();
  const { consent, setConsent } = useAnalyticsConsent();
  const [files, setFiles] = useState<File[]>([]);
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
  const visualizerRef = useRef<VisualizerHandle>(null);
  const [batchPreviews, setBatchPreviews] = useState<{ name: string; url: string; type: "audio" | "image" }[] | null>(null);

  // Convert operation state
  const [wavFile, setWavFile] = useState<File | null>(null);
  const [mp3SourceFile, setMp3SourceFile] = useState<File | null>(null);
  const [metadata, setMetadata] = useState<ID3Metadata>(defaultMetadata);
  const [loadingMetadata, setLoadingMetadata] = useState(false);
  const [dragOverWav, setDragOverWav] = useState(false);
  const [dragOverMp3, setDragOverMp3] = useState(false);
  const [convertCover, setConvertCover] = useState<Uint8Array | null>(null);
  const [convertCoverPreviewUrl, setConvertCoverPreviewUrl] = useState<string | null>(null);

  // Generic converter state
  const [genericConvertFiles, setGenericConvertFiles] = useState<File[]>([]);
  const [genericConvertOptions, setGenericConvertOptions] = useState<GenericConvertOptions>(defaultGenericConvertOptions);
  const [dragOverGeneric, setDragOverGeneric] = useState(false);

  // Retag MP3 state
  const [retagFile, setRetagFile] = useState<File | null>(null);
  const [retagMetadata, setRetagMetadata] = useState<ID3Metadata>(defaultMetadata);
  const [loadingRetagMetadata, setLoadingRetagMetadata] = useState(false);
  const [dragOverRetag, setDragOverRetag] = useState(false);
  const [retagCover, setRetagCover] = useState<Uint8Array | null>(null);
  const [retagCoverPreviewUrl, setRetagCoverPreviewUrl] = useState<string | null>(null);

  // Retag donor file state
  const [retagDonorFile, setRetagDonorFile] = useState<File | null>(null);
  const [retagDonorMetadata, setRetagDonorMetadata] = useState<ID3Metadata | null>(null);
  const [retagDonorCover, setRetagDonorCover] = useState<Uint8Array | null>(null);
  const [retagDonorCoverPreviewUrl, setRetagDonorCoverPreviewUrl] = useState<string | null>(null);
  const [loadingDonorMetadata, setLoadingDonorMetadata] = useState(false);
  const [dragOverDonor, setDragOverDonor] = useState(false);

  // Progress state
  const [progress, setProgress] = useState<number | null>(null);

  // Trim operation state
  const [trimFile, setTrimFile] = useState<File | null>(null);
  const [trimOptions, setTrimOptions] = useState<TrimOptions>(defaultTrimOptions);
  const [dragOverTrim, setDragOverTrim] = useState(false);

  // Visualizer operation state
  const [visualizerFile, setVisualizerFile] = useState<File | null>(null);
  const [dragOverVisualizer, setDragOverVisualizer] = useState(false);

  const isLosslessFormat = LOSSLESS_FORMATS.includes(genericConvertOptions.format);
  const isTrimLosslessFormat = LOSSLESS_FORMATS.includes(trimOptions.format);

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
        if (prevResult?.batchPreviews) {
          prevResult.batchPreviews.forEach((item) => URL.revokeObjectURL(item.url));
        }
        return { ...prev, [op]: nextResult };
      });

      if (currentOperationRef.current === op) {
        setStatus(nextResult.status);
        setError(nextResult.error);
        setDownloadUrl(nextResult.downloadUrl);
        setDownloadName(nextResult.downloadName);
        setPreviewUrl(nextResult.previewUrl);
        setBatchPreviews(nextResult.batchPreviews ?? null);
        setProgress(nextResult.progress);
        setProcessing(nextResult.processing);
      }
    },
    []
  );

  const clearResults = useCallback(() => {
    replaceOperationResult(operation, createEmptyResult());
    setProgress(null);
    setBatchPreviews(null);
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
      setBatchPreviews(savedResult.batchPreviews ?? null);
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
      // Clean up previous cover preview URL
      if (convertCoverPreviewUrl) {
        URL.revokeObjectURL(convertCoverPreviewUrl);
      }
      setConvertCover(null);
      setConvertCoverPreviewUrl(null);

      if (nextFile) {
        setLoadingMetadata(true);
        try {
          const meta = await readMetadataFromFile(nextFile);
          setMetadata(meta);
        } catch (err) {
          console.error("Failed to read metadata:", err);
          setMetadata(defaultMetadata);
        }
        // Try to extract existing cover
        try {
          const coverResult = await extractCover(nextFile);
          const coverData = new Uint8Array(await coverResult.blob.arrayBuffer());
          setConvertCover(coverData);
          setConvertCoverPreviewUrl(URL.createObjectURL(coverResult.blob));
        } catch {
          // No cover or extraction failed - that's fine
        }
        setLoadingMetadata(false);
      } else {
        setMetadata(defaultMetadata);
      }
    },
    [clearResults, convertCoverPreviewUrl]
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

  const handleConvertCoverChange = useCallback(
    async (file: File | null) => {
      if (convertCoverPreviewUrl) {
        URL.revokeObjectURL(convertCoverPreviewUrl);
      }
      if (file) {
        const data = new Uint8Array(await file.arrayBuffer());
        setConvertCover(data);
        setConvertCoverPreviewUrl(URL.createObjectURL(file));
      } else {
        setConvertCover(null);
        setConvertCoverPreviewUrl(null);
      }
    },
    [convertCoverPreviewUrl]
  );

  const handleGenericConvertFilesSelect = useCallback(
    (nextFiles: File[]) => {
      setGenericConvertFiles(nextFiles);
      clearResults();
    },
    [clearResults]
  );

  const handleGenericConvertDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setDragOverGeneric(false);
      const droppedFiles = Array.from(e.dataTransfer.files ?? []).filter((f) => f.type.startsWith("audio/"));
      if (droppedFiles.length > 0) {
        handleGenericConvertFilesSelect(droppedFiles);
      }
    },
    [handleGenericConvertFilesSelect]
  );

  const updateGenericConvertOption = <K extends keyof GenericConvertOptions>(key: K, value: GenericConvertOptions[K]) => {
    setGenericConvertOptions((prev) => {
      const next = { ...prev, [key]: value };
      // Enforce safe sample rates per format (avoid invalid encodes/playback)
      const allowedRates = SAMPLE_RATES_BY_FORMAT[next.format];
      const defaultRate = allowedRates[0];
      if (defaultRate && !allowedRates.includes(next.sampleRate)) {
        next.sampleRate = defaultRate;
      }
      return next;
    });
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

  const handleDonorFileSelect = useCallback(
    async (nextFile: File | null) => {
      setRetagDonorFile(nextFile);
      // Clean up previous donor cover preview URL
      if (retagDonorCoverPreviewUrl) {
        URL.revokeObjectURL(retagDonorCoverPreviewUrl);
      }
      setRetagDonorCover(null);
      setRetagDonorCoverPreviewUrl(null);
      setRetagDonorMetadata(null);

      if (nextFile) {
        setLoadingDonorMetadata(true);
        try {
          const meta = await readMetadataFromFile(nextFile);
          setRetagDonorMetadata(meta);
        } catch (err) {
          console.error("Failed to read donor metadata:", err);
          setRetagDonorMetadata(null);
        }
        // Try to extract donor cover
        try {
          const coverResult = await extractCover(nextFile);
          const coverData = new Uint8Array(await coverResult.blob.arrayBuffer());
          setRetagDonorCover(coverData);
          setRetagDonorCoverPreviewUrl(URL.createObjectURL(coverResult.blob));
        } catch {
          // No cover or extraction failed - that's fine
        }
        setLoadingDonorMetadata(false);
      }
    },
    [retagDonorCoverPreviewUrl]
  );

  const handleDonorDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setDragOverDonor(false);
      const droppedFile = e.dataTransfer.files?.[0];
      if (droppedFile && (droppedFile.type === "audio/mpeg" || droppedFile.name.endsWith(".mp3"))) {
        handleDonorFileSelect(droppedFile);
      }
    },
    [handleDonorFileSelect]
  );

  const handleImportDonorFields = useCallback(
    (fieldsToImport: Set<string>) => {
      if (!retagDonorMetadata) return;

      setRetagMetadata((prev) => {
        const next = { ...prev };
        if (fieldsToImport.has("title") && retagDonorMetadata.title) {
          next.title = retagDonorMetadata.title;
        }
        if (fieldsToImport.has("artist") && retagDonorMetadata.artist) {
          next.artist = retagDonorMetadata.artist;
        }
        if (fieldsToImport.has("album") && retagDonorMetadata.album) {
          next.album = retagDonorMetadata.album;
        }
        if (fieldsToImport.has("year") && retagDonorMetadata.year) {
          next.year = retagDonorMetadata.year;
        }
        if (fieldsToImport.has("track") && retagDonorMetadata.track) {
          next.track = retagDonorMetadata.track;
        }
        return next;
      });

      // Import cover if selected
      if (fieldsToImport.has("cover") && retagDonorCover) {
        if (retagCoverPreviewUrl) {
          URL.revokeObjectURL(retagCoverPreviewUrl);
        }
        setRetagCover(retagDonorCover);
        // Create a new URL from the donor cover data
        const blob = new Blob([retagDonorCover], { type: "image/jpeg" });
        setRetagCoverPreviewUrl(URL.createObjectURL(blob));
      }
    },
    [retagDonorMetadata, retagDonorCover, retagCoverPreviewUrl]
  );

  const handleTrimFileSelect = useCallback(
    (nextFile: File | null) => {
      setTrimFile(nextFile);
      setTrimOptions(defaultTrimOptions);
      clearResults();
    },
    [clearResults]
  );

  const handleTrimDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setDragOverTrim(false);
      const droppedFile = e.dataTransfer.files?.[0];
      if (droppedFile && droppedFile.type.startsWith("audio/")) {
        handleTrimFileSelect(droppedFile);
      }
    },
    [handleTrimFileSelect]
  );

  const handleVisualizerFileSelect = useCallback(
    (nextFile: File | null) => {
      setVisualizerFile(nextFile);
      clearResults();
    },
    [clearResults]
  );

  const handleVisualizerDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setDragOverVisualizer(false);
      const droppedFile = e.dataTransfer.files?.[0];
      if (droppedFile && droppedFile.type.startsWith("audio/")) {
        handleVisualizerFileSelect(droppedFile);
      }
    },
    [handleVisualizerFileSelect]
  );

  const handleFilesSelect = useCallback(
    (nextFiles: File[]) => {
      setFiles(nextFiles);
      clearResults();
    },
    [clearResults]
  );

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    handleFilesSelect(selectedFiles);
  };

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const droppedFiles = Array.from(e.dataTransfer.files ?? []).filter((f) => f.type.startsWith("audio/"));
      if (droppedFiles.length > 0) {
        handleFilesSelect(droppedFiles);
      }
    },
    [handleFilesSelect]
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
    if (batchPreviews) {
      batchPreviews.forEach((item) => URL.revokeObjectURL(item.url));
    }
    setFiles([]);
    setWavFile(null);
    setMp3SourceFile(null);
    setMetadata(defaultMetadata);
    setOptions(defaultOptions);
    setGenericConvertFiles([]);
    setGenericConvertOptions(defaultGenericConvertOptions);
    setRetagFile(null);
    setRetagMetadata(defaultMetadata);
    if (retagDonorCoverPreviewUrl) {
      URL.revokeObjectURL(retagDonorCoverPreviewUrl);
    }
    setRetagDonorFile(null);
    setRetagDonorMetadata(null);
    setRetagDonorCover(null);
    setRetagDonorCoverPreviewUrl(null);
    setTrimFile(null);
    setTrimOptions(defaultTrimOptions);
    setVisualizerFile(null);
    if (convertCoverPreviewUrl) {
      URL.revokeObjectURL(convertCoverPreviewUrl);
    }
    setConvertCover(null);
    setConvertCoverPreviewUrl(null);
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
    setBatchPreviews(null);
    setProgress(null);
    setProcessing(false);
  }, [batchPreviews, convertCoverPreviewUrl, retagCoverPreviewUrl, retagDonorCoverPreviewUrl]);

  const submit = async () => {
    const activeOperation = operation;
    if (activeOperation === "convert") {
      if (!wavFile || !mp3SourceFile) {
        setError("Please choose both a WAV file and an MP3 source file.");
        return;
      }
    } else if (activeOperation === "generic-convert") {
      if (genericConvertFiles.length === 0) {
        setError("Please choose an audio file to convert.");
        return;
      }
    } else if (activeOperation === "retag") {
      if (!retagFile) {
        setError("Please choose an MP3 file to retag.");
        return;
      }
    } else if (activeOperation === "trim") {
      if (!trimFile) {
        setError("Please choose an audio file to trim.");
        return;
      }
      if (trimOptions.startTime >= trimOptions.endTime) {
        setError("Start time must be before end time.");
        return;
      }
    } else if (activeOperation === "visualize") {
      if (!visualizerFile) {
        setError("Please choose an audio file to visualize.");
        return;
      }
    } else if (files.length === 0) {
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

    const onBatchProgress: BatchProgressCallback = ({ percent, currentFile, totalFiles }) => {
      setProgress(percent);
      setStatus(`Processing file ${currentFile} of ${totalFiles}...`);
      setResultsByOperation((prev) => ({
        ...prev,
        [activeOperation]: { ...prev[activeOperation], progress: percent, status: `Processing file ${currentFile} of ${totalFiles}...`, processing: true },
      }));
    };

    try {
      if (activeOperation === "noise") {
        if (files.length === 1) {
          const result = await processAudio(files[0]!, options, onProgress);
          const url = URL.createObjectURL(result.blob);
          replaceOperationResult(activeOperation, {
            status: "Noise added and concatenated. Ready to download.",
            error: null,
            downloadUrl: url,
            downloadName: result.filename,
            previewUrl: url,
            batchPreviews: null,
            progress: null,
            processing: false,
          });
        } else {
          const result = await processAudioBatch(files, options, onBatchProgress);
          const previewItems = result.items.map((item) => ({
            name: item.filename,
            url: URL.createObjectURL(item.blob),
            type: "audio" as const,
          }));
          const url = URL.createObjectURL(result.zip.blob);
          replaceOperationResult(activeOperation, {
            status: `Processed ${files.length} files. Ready to download ZIP.`,
            error: null,
            downloadUrl: url,
            downloadName: result.zip.filename,
            previewUrl: null,
            batchPreviews: previewItems,
            progress: null,
            processing: false,
          });
        }
      } else if (activeOperation === "cover") {
        if (files.length === 1) {
          const result = await extractCover(files[0]!, onProgress);
          const url = URL.createObjectURL(result.blob);
          replaceOperationResult(activeOperation, {
            status: "Cover extracted. Ready to download.",
            error: null,
            downloadUrl: url,
            downloadName: result.filename,
            previewUrl: url,
            batchPreviews: null,
            progress: null,
            processing: false,
          });
        } else {
          const result = await extractCoverBatch(files, onBatchProgress);
          const previewItems = result.items.map((item) => ({
            name: item.filename,
            url: URL.createObjectURL(item.blob),
            type: "image" as const,
          }));
          const url = URL.createObjectURL(result.zip.blob);
          replaceOperationResult(activeOperation, {
            status: `Extracted covers from ${files.length} files. Ready to download ZIP.`,
            error: null,
            downloadUrl: url,
            downloadName: result.zip.filename,
            previewUrl: null,
            batchPreviews: previewItems,
            progress: null,
            processing: false,
          });
        }
      } else if (activeOperation === "convert") {
        const outputName = mp3SourceFile!.name.replace(/\.mp3$/i, "") + ".mp3";
        const result = await convertWavToMp3(wavFile!, mp3SourceFile!, metadata, outputName, onProgress, convertCover ?? undefined);
        const url = URL.createObjectURL(result.blob);
        replaceOperationResult(activeOperation, {
          status: "WAV retagged into 320kbps MP3 with metadata. Ready to download.",
          error: null,
          downloadUrl: url,
          downloadName: outputName,
          previewUrl: url,
          batchPreviews: null,
          progress: null,
          processing: false,
        });
      } else if (activeOperation === "generic-convert") {
        const formatLabel = genericConvertOptions.format.toUpperCase();
        const isLossless = LOSSLESS_FORMATS.includes(genericConvertOptions.format);
        const bitrateInfo = isLossless ? "lossless" : genericConvertOptions.bitrate;

        if (genericConvertFiles.length === 1) {
          const result = await convertAudio(genericConvertFiles[0]!, genericConvertOptions, undefined, onProgress);
          const url = URL.createObjectURL(result.blob);
          replaceOperationResult(activeOperation, {
            status: `Converted to ${formatLabel} (${bitrateInfo}). Ready to download.`,
            error: null,
            downloadUrl: url,
            downloadName: result.filename,
            previewUrl: url,
            batchPreviews: null,
            progress: null,
            processing: false,
          });
        } else {
          const result = await convertAudioBatch(genericConvertFiles, genericConvertOptions, onBatchProgress);
          const previewItems = result.items.map((item) => ({
            name: item.filename,
            url: URL.createObjectURL(item.blob),
            type: "audio" as const,
          }));
          const url = URL.createObjectURL(result.zip.blob);
          replaceOperationResult(activeOperation, {
            status: `Converted ${genericConvertFiles.length} files to ${formatLabel} (${bitrateInfo}). Ready to download ZIP.`,
            error: null,
            downloadUrl: url,
            downloadName: result.zip.filename,
            previewUrl: null,
            batchPreviews: previewItems,
            progress: null,
            processing: false,
          });
        }
      } else if (activeOperation === "retag") {
        const result = await retagMp3(retagFile!, retagMetadata, onProgress, retagCover ?? undefined);
        const url = URL.createObjectURL(result.blob);
        replaceOperationResult(activeOperation, {
          status: "MP3 retagged with new metadata. Ready to download.",
          error: null,
          downloadUrl: url,
          downloadName: result.filename,
          previewUrl: url,
          batchPreviews: null,
          progress: null,
          processing: false,
        });
      } else if (activeOperation === "trim") {
        const result = await trimAudio(trimFile!, trimOptions, onProgress);
        const url = URL.createObjectURL(result.blob);
        const formatLabel = trimOptions.format.toUpperCase();
        const duration = trimOptions.endTime - trimOptions.startTime;
        const silenceInfo = trimOptions.removeSilence ? " with silence removed" : "";
        replaceOperationResult(activeOperation, {
          status: `Trimmed to ${duration.toFixed(2)}s${silenceInfo} (${formatLabel}). Ready to download.`,
          error: null,
          downloadUrl: url,
          downloadName: result.filename,
          previewUrl: url,
          batchPreviews: null,
          progress: null,
          processing: false,
        });
      } else if (activeOperation === "visualize") {
        if (!visualizerRef.current) {
          throw new Error("Visualizer not ready");
        }
        setProgress(50);
        const result = await visualizerRef.current.exportToPng();
        const url = URL.createObjectURL(result.blob);
        replaceOperationResult(activeOperation, {
          status: "Waveform PNG generated. Ready to download.",
          error: null,
          downloadUrl: url,
          downloadName: result.filename,
          previewUrl: url,
          batchPreviews: null,
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
      {consent === true && (
        <>
          <SpeedInsights />
          <Analytics />
        </>
      )}
      {consent === null && (
        <AnalyticsConsentModal
          onAccept={() => setConsent(true)}
          onDecline={() => setConsent(false)}
        />
      )}
      <div className="app-container">
        <Hero theme={theme} setTheme={setTheme} />

        <main className="card">
          <OperationPicker operation={operation} onChange={handleOperationChange} />

          {operation !== "convert" && operation !== "generic-convert" && operation !== "retag" && operation !== "trim" && operation !== "visualize" && (
            <AudioFilePicker files={files} dragOver={dragOver} onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onChange={handleFileChange} />
          )}

          {operation === "convert" && (
            <ConvertFilesSection
              wavFile={wavFile}
              mp3SourceFile={mp3SourceFile}
              dragOverWav={dragOverWav}
              dragOverMp3={dragOverMp3}
              loadingMetadata={loadingMetadata}
              metadata={metadata}
              coverPreviewUrl={convertCoverPreviewUrl}
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
              onCoverChange={handleConvertCoverChange}
            />
          )}

          {operation === "generic-convert" && (
            <GenericConvertSection
              files={genericConvertFiles}
              dragOver={dragOverGeneric}
              options={genericConvertOptions}
              isLosslessFormat={isLosslessFormat}
              sampleRateOptions={SAMPLE_RATES_BY_FORMAT[genericConvertOptions.format]}
              onDrop={handleGenericConvertDrop}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverGeneric(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setDragOverGeneric(false);
              }}
              onFilesChange={handleGenericConvertFilesSelect}
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
              donorFile={retagDonorFile}
              donorMetadata={retagDonorMetadata}
              donorCoverPreviewUrl={retagDonorCoverPreviewUrl}
              loadingDonorMetadata={loadingDonorMetadata}
              dragOverDonor={dragOverDonor}
              onDonorDrop={handleDonorDrop}
              onDonorDragOver={(e) => {
                e.preventDefault();
                setDragOverDonor(true);
              }}
              onDonorDragLeave={(e) => {
                e.preventDefault();
                setDragOverDonor(false);
              }}
              onDonorFileChange={handleDonorFileSelect}
              onImportFields={handleImportDonorFields}
            />
          )}

          {operation === "trim" && (
            <TrimSection
              file={trimFile}
              dragOver={dragOverTrim}
              options={trimOptions}
              isLosslessFormat={isTrimLosslessFormat}
              onDrop={handleTrimDrop}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverTrim(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setDragOverTrim(false);
              }}
              onFileChange={handleTrimFileSelect}
              onOptionsChange={setTrimOptions}
            />
          )}

          {operation === "visualize" && (
            <VisualizerSection
              ref={visualizerRef}
              file={visualizerFile}
              dragOver={dragOverVisualizer}
              onDrop={handleVisualizerDrop}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverVisualizer(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setDragOverVisualizer(false);
              }}
              onFileChange={handleVisualizerFileSelect}
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
            batchPreviews={batchPreviews}
            operation={operation}
            genericConvertOptions={genericConvertOptions}
            onSubmit={submit}
            onReset={handleReset}
          />

          <Footer
            analyticsEnabled={consent === true}
            onToggleAnalytics={() => setConsent(consent !== true)}
          />
        </main>
      </div>
    </div>
  );
}

import type { ChangeEvent, ComponentType, DragEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  BatchProgressCallback,
  GenericConvertOptions,
  ID3Metadata,
  OutputFormat,
  ProcessOptions,
  ProgressCallback,
  SampleRate,
} from './api';
import {
  convertAudio,
  convertAudioBatch,
  convertWavToMp3,
  extractCover,
  extractCoverBatch,
  processAudio,
  processAudioBatch,
  readMetadataFromFile,
  retagMp3,
  trimAudio,
} from './api';
import { AnalyticsConsentModal } from './components/AnalyticsConsentModal';
import { useAnalyticsConsent } from './hooks/useAnalyticsConsent';
import { useOutputFilename } from './hooks/useOutputFilename';
import './styles.css';
import {
  type AdblockDetectionResult,
  detectAdblock,
} from './utils/detectAdblock';

type TrackFn = (event: string, properties?: Record<string, unknown>) => void;

import { ActionsSection } from './components/ActionsSection';
import { AudioFilePicker } from './components/AudioFilePicker';
import { ConvertSection } from './components/ConvertSection';
import { Footer } from './components/Footer';
import { NoiseOptions } from './components/NoiseOptions';
import { OperationPicker } from './components/OperationPicker';
import { OutputFilenameSection } from './components/OutputFilenameSection';
import { RetagSection } from './components/RetagSection';
import { RetagWavSection } from './components/RetagWavSection';
import { type TrimOptions, TrimSection } from './components/TrimSection';
import {
  type VisualizerHandle,
  VisualizerSection,
} from './components/VisualizerSection';
import type { Operation } from './types';

const OPERATIONS: Operation[] = [
  'convert',
  'trim',
  'retag',
  'retag-wav',
  'noise',
  'visualize',
  'cover',
];

const getOperationFromHash = (): Operation | null => {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash.slice(1);
  return OPERATIONS.includes(hash as Operation) ? (hash as Operation) : null;
};

const defaultMetadata: ID3Metadata = {
  title: '',
  artist: '',
  album: '',
  year: '',
  track: '',
  genre: '',
};

const defaultOptions: ProcessOptions = {
  durationSeconds: 180,
  noiseVolume: 0.05,
  noiseType: 'pink',
  bitrate: '192k',
  prependNoise: false,
};

const defaultGenericConvertOptions: GenericConvertOptions = {
  format: 'mp3',
  bitrate: null,
  sampleRate: null,
  channels: 'auto',
};

const SAMPLE_RATES_BY_FORMAT: Record<OutputFormat, SampleRate[]> = {
  mp3: [44100, 48000],
  ogg: [44100, 48000, 96000],
  aac: [44100, 48000, 96000],
  wav: [44100, 48000, 96000],
  flac: [44100, 48000, 96000],
  aiff: [44100, 48000, 96000],
};

const defaultTrimOptions: TrimOptions = {
  startTime: 0,
  endTime: 0,
  format: 'source',
  bitrate: '320k',
  removeSilence: false,
  silenceThreshold: -50,
  silenceDuration: 0.5,
};

const LOSSLESS_FORMATS: OutputFormat[] = ['wav', 'flac', 'aiff'];

type OperationResult = {
  status: string | null;
  error: string | null;
  downloadUrl: string | null;
  downloadName: string | null;
  previewUrl: string | null;
  batchPreviews?:
    | { name: string; url: string; type: 'audio' | 'image' }[]
    | null;
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
  'retag-wav': createEmptyResult(),
  convert: createEmptyResult(),
  retag: createEmptyResult(),
  trim: createEmptyResult(),
  visualize: createEmptyResult(),
});

export default function App() {
  const isBrowser = typeof window !== 'undefined';
  const { consent, setConsent } = useAnalyticsConsent();
  const [noiseFiles, setNoiseFiles] = useState<File[]>([]);
  const [coverFiles, setCoverFiles] = useState<File[]>([]);
  const [operation, setOperation] = useState<Operation>('convert');
  const [options, setOptions] = useState<ProcessOptions>(defaultOptions);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [resultsByOperation, setResultsByOperation] = useState<
    Record<Operation, OperationResult>
  >(createEmptyResultsMap);
  const currentOperationRef = useRef<Operation>('convert');
  const visualizerRef = useRef<VisualizerHandle>(null);
  const [batchPreviews, setBatchPreviews] = useState<
    { name: string; url: string; type: 'audio' | 'image' }[] | null
  >(null);

  // Convert operation state
  const [wavFile, setWavFile] = useState<File | null>(null);
  const [mp3SourceFile, setMp3SourceFile] = useState<File | null>(null);
  const [metadata, setMetadata] = useState<ID3Metadata>(defaultMetadata);
  const [dragOverWav, setDragOverWav] = useState(false);
  const [dragOverMp3, setDragOverMp3] = useState(false);
  const [convertCover, setConvertCover] = useState<Uint8Array | null>(null);
  const [convertCoverPreviewUrl, setConvertCoverPreviewUrl] = useState<
    string | null
  >(null);

  // Separate metadata sources for Retag WAV
  const [wavMetadata, setWavMetadata] = useState<ID3Metadata | null>(null);
  const [mp3SourceMetadata, setMp3SourceMetadata] =
    useState<ID3Metadata | null>(null);
  const [mp3SourceCover, setMp3SourceCover] = useState<Uint8Array | null>(null);
  const [mp3SourceCoverPreviewUrl, setMp3SourceCoverPreviewUrl] = useState<
    string | null
  >(null);
  const [loadingWavMetadata, setLoadingWavMetadata] = useState(false);
  const [loadingMp3SourceMetadata, setLoadingMp3SourceMetadata] =
    useState(false);

  // Computed loading state for Retag WAV (either WAV or MP3 source is loading)
  const loadingMetadata = loadingWavMetadata || loadingMp3SourceMetadata;

  // Request tracking refs to prevent race conditions
  const wavFileRequestIdRef = useRef<number>(0);
  const mp3SourceFileRequestIdRef = useRef<number>(0);

  // Generic converter state
  const [genericConvertFiles, setGenericConvertFiles] = useState<File[]>([]);
  const [genericConvertOptions, setGenericConvertOptions] =
    useState<GenericConvertOptions>(defaultGenericConvertOptions);
  const [dragOverGeneric, setDragOverGeneric] = useState(false);

  // Retag MP3 state
  const [retagFile, setRetagFile] = useState<File | null>(null);
  const [retagMetadata, setRetagMetadata] =
    useState<ID3Metadata>(defaultMetadata);
  const [loadingRetagMetadata, setLoadingRetagMetadata] = useState(false);
  const [dragOverRetag, setDragOverRetag] = useState(false);
  const [retagCover, setRetagCover] = useState<Uint8Array | null>(null);
  const [retagCoverPreviewUrl, setRetagCoverPreviewUrl] = useState<
    string | null
  >(null);

  // Retag donor file state
  const [retagDonorFile, setRetagDonorFile] = useState<File | null>(null);
  const [retagDonorMetadata, setRetagDonorMetadata] =
    useState<ID3Metadata | null>(null);
  const [retagDonorCover, setRetagDonorCover] = useState<Uint8Array | null>(
    null,
  );
  const [retagDonorCoverPreviewUrl, setRetagDonorCoverPreviewUrl] = useState<
    string | null
  >(null);
  const [loadingDonorMetadata, setLoadingDonorMetadata] = useState(false);
  const [dragOverDonor, setDragOverDonor] = useState(false);

  // Progress state
  const [progress, setProgress] = useState<number | null>(null);

  // Adblock detection state
  const [adblockStatus, setAdblockStatus] =
    useState<AdblockDetectionResult>('unknown');

  // Lazy-loaded analytics pieces to avoid adblock-induced module failures.
  const [AnalyticsComponent, setAnalyticsComponent] =
    useState<ComponentType | null>(null);
  const [SpeedInsightsComponent, setSpeedInsightsComponent] =
    useState<ComponentType | null>(null);
  const trackRef = useRef<TrackFn | null>(null);

  // Trim operation state
  const [trimFile, setTrimFile] = useState<File | null>(null);
  const [trimOptions, setTrimOptions] =
    useState<TrimOptions>(defaultTrimOptions);
  const [dragOverTrim, setDragOverTrim] = useState(false);

  // Visualizer operation state
  const [visualizerFile, setVisualizerFile] = useState<File | null>(null);
  const [dragOverVisualizer, setDragOverVisualizer] = useState(false);

  // Output filename hook (shared by retag-wav and retag)
  const {
    outputFilename,
    setOutputFilename,
    useAutoFilename,
    setUseAutoFilename,
    reset: resetOutputFilename,
  } = useOutputFilename({
    operation,
    metadata,
    retagMetadata,
    mp3SourceFile,
    retagFile,
    wavFile,
  });

  const isLosslessFormat = LOSSLESS_FORMATS.includes(
    genericConvertOptions.format,
  );
  const isTrimLosslessFormat =
    trimOptions.format !== 'source' &&
    LOSSLESS_FORMATS.includes(trimOptions.format);

  const trackPageview = useCallback(() => {
    if (!isBrowser || consent !== true) return;
    const track = trackRef.current;
    if (!track) return;
    track('pageview', {
      page: `${window.location.pathname}${window.location.hash}`,
    });
  }, [consent, isBrowser]);

  useEffect(() => {
    trackPageview();
  }, [trackPageview]);

  useEffect(() => {
    currentOperationRef.current = operation;
  }, [operation]);

  // Track client hydration to avoid rendering client-only UI (e.g., modals) during SSR.
  useEffect(() => {
    setHydrated(true);
  }, []);

  // Heuristically detect adblock / similar blockers.
  useEffect(() => {
    if (!isBrowser) return;
    let cancelled = false;

    // Debug: start detection
    console.info('[analytics] Starting uBlock detection...');

    detectAdblock()
      .then((status) => {
        if (!cancelled) setAdblockStatus(status);
        if (!cancelled) {
          // Expose for quick inspection in devtools.
          (
            window as typeof window & {
              __ADBLOCK_STATUS__?: AdblockDetectionResult;
            }
          ).__ADBLOCK_STATUS__ = status;
          console.info('[analytics] Adblock detection result:', status);
        }
      })
      .catch(() => {
        if (!cancelled) setAdblockStatus('blocked');
        if (!cancelled) {
          (
            window as typeof window & {
              __ADBLOCK_STATUS__?: AdblockDetectionResult;
            }
          ).__ADBLOCK_STATUS__ = 'blocked';
          console.warn(
            '[analytics] Adblock detection failed, treating as blocked',
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isBrowser]);

  // Reset analytics artifacts when consent is revoked/absent.
  useEffect(() => {
    if (consent !== true) {
      setAnalyticsComponent(null);
      setSpeedInsightsComponent(null);
      trackRef.current = null;
    }
  }, [consent]);

  // Load analytics bundles only after consent to avoid adblock-induced failures.
  useEffect(() => {
    if (!isBrowser || consent !== true) return;
    let cancelled = false;

    (async () => {
      try {
        const [analyticsReact, speedReact, analyticsCore] = await Promise.all([
          import('@vercel/analytics/react'),
          import('@vercel/speed-insights/react'),
          import('@vercel/analytics'),
        ]);
        if (cancelled) return;
        setAnalyticsComponent(() => analyticsReact.Analytics);
        setSpeedInsightsComponent(() => speedReact.SpeedInsights);
        trackRef.current = analyticsCore.track;
        trackRef.current?.('pageview', {
          page: `${window.location.pathname}${window.location.hash}`,
        });
        // eslint-disable-next-line no-console
        console.info('[analytics] Analytics bundles loaded');
      } catch (err) {
        if (cancelled) return;
        setAnalyticsComponent(null);
        setSpeedInsightsComponent(null);
        trackRef.current = null;
        // eslint-disable-next-line no-console
        console.warn('[analytics] Failed to load analytics bundles', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [consent, isBrowser]);

  // Set initial hash on mount if not already valid
  useEffect(() => {
    if (!isBrowser) return;
    const hashOp = getOperationFromHash();
    if (hashOp) {
      setOperation(hashOp);
    } else {
      window.history.replaceState(null, '', '#convert');
    }
  }, [isBrowser]);

  const replaceOperationResult = useCallback(
    (op: Operation, nextResult: OperationResult) => {
      setResultsByOperation((prev) => {
        const prevResult = prev[op];
        if (
          prevResult?.downloadUrl &&
          prevResult.downloadUrl !== nextResult.downloadUrl
        ) {
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
          prevResult.batchPreviews.forEach((item) => {
            URL.revokeObjectURL(item.url);
          });
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
    [],
  );

  const clearResults = useCallback(() => {
    replaceOperationResult(operation, createEmptyResult());
    setProgress(null);
    setBatchPreviews(null);
  }, [operation, replaceOperationResult]);

  const handleOperationChange = useCallback(
    (nextOperation: Operation) => {
      setOperation(nextOperation);
      if (isBrowser && window.location.hash.slice(1) !== nextOperation) {
        window.history.replaceState(null, '', `#${nextOperation}`);
      }
      const savedResult =
        resultsByOperation[nextOperation] ?? createEmptyResult();
      setStatus(savedResult.status);
      setError(savedResult.error);
      setDownloadUrl(savedResult.downloadUrl);
      setDownloadName(savedResult.downloadName);
      setPreviewUrl(savedResult.previewUrl);
      setBatchPreviews(savedResult.batchPreviews ?? null);
      setProgress(savedResult.progress);
      setProcessing(savedResult.processing);
      trackPageview();
    },
    [resultsByOperation, isBrowser, trackPageview],
  );

  useEffect(() => {
    if (!isBrowser) return;
    const onHashChange = () => {
      const hashOp = getOperationFromHash();
      if (hashOp && hashOp !== operation) {
        handleOperationChange(hashOp);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [operation, handleOperationChange, isBrowser]);

  const handleWavFileSelect = useCallback(
    async (nextFile: File | null) => {
      setWavFile(nextFile);
      clearResults();

      if (nextFile) {
        // Increment request ID and capture it
        const requestId = ++wavFileRequestIdRef.current;
        setLoadingWavMetadata(true);
        setWavMetadata(null);

        try {
          const meta = await readMetadataFromFile(nextFile);
          // Only update if this is still the latest request
          if (requestId === wavFileRequestIdRef.current) {
            setWavMetadata(meta);
          }
        } catch (err) {
          console.error('Failed to read WAV metadata:', err);
          // Only update if this is still the latest request
          if (requestId === wavFileRequestIdRef.current) {
            setWavMetadata(null);
          }
        } finally {
          if (requestId === wavFileRequestIdRef.current) {
            setLoadingWavMetadata(false);
          }
        }
      } else {
        setWavMetadata(null);
        setLoadingWavMetadata(false);
      }
    },
    [clearResults],
  );

  const handleMp3SourceSelect = useCallback(
    async (nextFile: File | null) => {
      setMp3SourceFile(nextFile);
      clearResults();
      // Clean up previous MP3 source cover preview URL
      if (mp3SourceCoverPreviewUrl) {
        URL.revokeObjectURL(mp3SourceCoverPreviewUrl);
      }
      setMp3SourceCover(null);
      setMp3SourceCoverPreviewUrl(null);

      if (nextFile) {
        // Increment request ID and capture it
        const requestId = ++mp3SourceFileRequestIdRef.current;
        setLoadingMp3SourceMetadata(true);
        setMp3SourceMetadata(null);

        try {
          const meta = await readMetadataFromFile(nextFile);
          // Only update if this is still the latest request
          if (requestId === mp3SourceFileRequestIdRef.current) {
            setMp3SourceMetadata(meta);
          }
        } catch (err) {
          console.error('Failed to read MP3 source metadata:', err);
          // Only update if this is still the latest request
          if (requestId === mp3SourceFileRequestIdRef.current) {
            setMp3SourceMetadata(null);
          }
        }
        // Try to extract existing cover
        try {
          const coverResult = await extractCover(nextFile);
          const coverData = new Uint8Array(
            await coverResult.blob.arrayBuffer(),
          );
          // Only update if this is still the latest request
          if (requestId === mp3SourceFileRequestIdRef.current) {
            setMp3SourceCover(coverData);
            setMp3SourceCoverPreviewUrl(URL.createObjectURL(coverResult.blob));
          }
        } catch {
          // No cover or extraction failed - that's fine
        } finally {
          if (requestId === mp3SourceFileRequestIdRef.current) {
            setLoadingMp3SourceMetadata(false);
          }
        }
      } else {
        setMp3SourceMetadata(null);
        setLoadingMp3SourceMetadata(false);
      }
    },
    [clearResults, mp3SourceCoverPreviewUrl],
  );

  const handleWavDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setDragOverWav(false);
      const droppedFile = e.dataTransfer.files?.[0];
      if (
        droppedFile &&
        (droppedFile.type === 'audio/wav' || droppedFile.name.endsWith('.wav'))
      ) {
        handleWavFileSelect(droppedFile);
      }
    },
    [handleWavFileSelect],
  );

  const handleMp3Drop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setDragOverMp3(false);
      const droppedFile = e.dataTransfer.files?.[0];
      if (
        droppedFile &&
        (droppedFile.type === 'audio/mpeg' || droppedFile.name.endsWith('.mp3'))
      ) {
        handleMp3SourceSelect(droppedFile);
      }
    },
    [handleMp3SourceSelect],
  );

  const updateMetadata = <K extends keyof ID3Metadata>(
    key: K,
    value: ID3Metadata[K],
  ) => {
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
    [convertCoverPreviewUrl],
  );

  const handleGenericConvertFilesSelect = useCallback(
    (nextFiles: File[]) => {
      setGenericConvertFiles(nextFiles);
      clearResults();
    },
    [clearResults],
  );

  const handleGenericConvertDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setDragOverGeneric(false);
      const droppedFiles = Array.from(e.dataTransfer.files ?? []).filter((f) =>
        f.type.startsWith('audio/'),
      );
      if (droppedFiles.length > 0) {
        handleGenericConvertFilesSelect(droppedFiles);
      }
    },
    [handleGenericConvertFilesSelect],
  );

  const updateGenericConvertOption = <K extends keyof GenericConvertOptions>(
    key: K,
    value: GenericConvertOptions[K],
  ) => {
    setGenericConvertOptions((prev) => {
      const next = { ...prev, [key]: value };
      // Enforce safe sample rates per format (avoid invalid encodes/playback)
      // Only validate if sampleRate is explicitly set (not null)
      if (next.sampleRate !== null) {
        const allowedRates = SAMPLE_RATES_BY_FORMAT[next.format];
        const defaultRate = allowedRates[0];
        if (defaultRate && !allowedRates.includes(next.sampleRate)) {
          next.sampleRate = defaultRate;
        }
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
          console.error('Failed to read metadata:', err);
          setRetagMetadata(defaultMetadata);
        }
        // Try to extract existing cover
        try {
          const coverResult = await extractCover(nextFile);
          const coverData = new Uint8Array(
            await coverResult.blob.arrayBuffer(),
          );
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
    [clearResults, retagCoverPreviewUrl],
  );

  const handleRetagDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setDragOverRetag(false);
      const droppedFile = e.dataTransfer.files?.[0];
      if (
        droppedFile &&
        (droppedFile.type === 'audio/mpeg' || droppedFile.name.endsWith('.mp3'))
      ) {
        handleRetagFileSelect(droppedFile);
      }
    },
    [handleRetagFileSelect],
  );

  const updateRetagMetadata = <K extends keyof ID3Metadata>(
    key: K,
    value: ID3Metadata[K],
  ) => {
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
    [retagCoverPreviewUrl],
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
          console.error('Failed to read donor metadata:', err);
          setRetagDonorMetadata(null);
        }
        // Try to extract donor cover
        try {
          const coverResult = await extractCover(nextFile);
          const coverData = new Uint8Array(
            await coverResult.blob.arrayBuffer(),
          );
          setRetagDonorCover(coverData);
          setRetagDonorCoverPreviewUrl(URL.createObjectURL(coverResult.blob));
        } catch {
          // No cover or extraction failed - that's fine
        }
        setLoadingDonorMetadata(false);
      }
    },
    [retagDonorCoverPreviewUrl],
  );

  const handleDonorDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setDragOverDonor(false);
      const droppedFile = e.dataTransfer.files?.[0];
      if (
        droppedFile &&
        (droppedFile.type === 'audio/mpeg' || droppedFile.name.endsWith('.mp3'))
      ) {
        handleDonorFileSelect(droppedFile);
      }
    },
    [handleDonorFileSelect],
  );

  const handleImportDonorFields = useCallback(
    (fieldsToImport: Set<string>) => {
      if (!retagDonorMetadata) return;

      setRetagMetadata((prev) => {
        const next = { ...prev };
        if (fieldsToImport.has('title') && retagDonorMetadata.title) {
          next.title = retagDonorMetadata.title;
        }
        if (fieldsToImport.has('artist') && retagDonorMetadata.artist) {
          next.artist = retagDonorMetadata.artist;
        }
        if (fieldsToImport.has('album') && retagDonorMetadata.album) {
          next.album = retagDonorMetadata.album;
        }
        if (fieldsToImport.has('year') && retagDonorMetadata.year) {
          next.year = retagDonorMetadata.year;
        }
        if (fieldsToImport.has('track') && retagDonorMetadata.track) {
          next.track = retagDonorMetadata.track;
        }
        if (fieldsToImport.has('genre') && retagDonorMetadata.genre) {
          next.genre = retagDonorMetadata.genre;
        }
        return next;
      });

      // Import cover if selected
      if (fieldsToImport.has('cover') && retagDonorCover) {
        if (retagCoverPreviewUrl) {
          URL.revokeObjectURL(retagCoverPreviewUrl);
        }
        setRetagCover(retagDonorCover);
        // Create a new URL from the donor cover data
        const blob = new Blob([new Uint8Array(retagDonorCover)], {
          type: 'image/jpeg',
        });
        setRetagCoverPreviewUrl(URL.createObjectURL(blob));
      }
    },
    [retagDonorMetadata, retagDonorCover, retagCoverPreviewUrl],
  );

  const handleImportWavFields = useCallback(
    (fieldsToImport: Set<string>) => {
      if (!wavMetadata) return;

      setMetadata((prev) => {
        const next = { ...prev };
        if (fieldsToImport.has('title') && wavMetadata.title) {
          next.title = wavMetadata.title;
        }
        if (fieldsToImport.has('artist') && wavMetadata.artist) {
          next.artist = wavMetadata.artist;
        }
        if (fieldsToImport.has('album') && wavMetadata.album) {
          next.album = wavMetadata.album;
        }
        if (fieldsToImport.has('year') && wavMetadata.year) {
          next.year = wavMetadata.year;
        }
        if (fieldsToImport.has('track') && wavMetadata.track) {
          next.track = wavMetadata.track;
        }
        if (fieldsToImport.has('genre') && wavMetadata.genre) {
          next.genre = wavMetadata.genre;
        }
        // Note: WAV files don't support cover art, so we skip 'cover'
        return next;
      });
    },
    [wavMetadata],
  );

  const handleImportMp3SourceFields = useCallback(
    (fieldsToImport: Set<string>) => {
      if (!mp3SourceMetadata) return;

      setMetadata((prev) => {
        const next = { ...prev };
        if (fieldsToImport.has('title') && mp3SourceMetadata.title) {
          next.title = mp3SourceMetadata.title;
        }
        if (fieldsToImport.has('artist') && mp3SourceMetadata.artist) {
          next.artist = mp3SourceMetadata.artist;
        }
        if (fieldsToImport.has('album') && mp3SourceMetadata.album) {
          next.album = mp3SourceMetadata.album;
        }
        if (fieldsToImport.has('year') && mp3SourceMetadata.year) {
          next.year = mp3SourceMetadata.year;
        }
        if (fieldsToImport.has('track') && mp3SourceMetadata.track) {
          next.track = mp3SourceMetadata.track;
        }
        if (fieldsToImport.has('genre') && mp3SourceMetadata.genre) {
          next.genre = mp3SourceMetadata.genre;
        }
        return next;
      });

      // Import cover if selected
      if (fieldsToImport.has('cover') && mp3SourceCover) {
        if (convertCoverPreviewUrl) {
          URL.revokeObjectURL(convertCoverPreviewUrl);
        }
        setConvertCover(mp3SourceCover);
        // Create a new URL from the MP3 source cover data
        const blob = new Blob([new Uint8Array(mp3SourceCover)], {
          type: 'image/jpeg',
        });
        setConvertCoverPreviewUrl(URL.createObjectURL(blob));
      }
    },
    [mp3SourceMetadata, mp3SourceCover, convertCoverPreviewUrl],
  );

  const handleTrimFileSelect = useCallback(
    (nextFile: File | null) => {
      setTrimFile(nextFile);
      setTrimOptions(defaultTrimOptions);
      clearResults();
    },
    [clearResults],
  );

  const handleTrimDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setDragOverTrim(false);
      const droppedFile = e.dataTransfer.files?.[0];
      if (droppedFile?.type.startsWith('audio/')) {
        handleTrimFileSelect(droppedFile);
      }
    },
    [handleTrimFileSelect],
  );

  const handleVisualizerFileSelect = useCallback(
    (nextFile: File | null) => {
      setVisualizerFile(nextFile);
      clearResults();
    },
    [clearResults],
  );

  const handleVisualizerDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setDragOverVisualizer(false);
      const droppedFile = e.dataTransfer.files?.[0];
      if (droppedFile?.type.startsWith('audio/')) {
        handleVisualizerFileSelect(droppedFile);
      }
    },
    [handleVisualizerFileSelect],
  );

  const handleNoiseFilesSelect = useCallback(
    (nextFiles: File[]) => {
      setNoiseFiles(nextFiles);
      clearResults();
    },
    [clearResults],
  );

  const handleCoverFilesSelect = useCallback(
    (nextFiles: File[]) => {
      setCoverFiles(nextFiles);
      clearResults();
    },
    [clearResults],
  );

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    if (operation === 'noise') {
      handleNoiseFilesSelect(selectedFiles);
    } else if (operation === 'cover') {
      handleCoverFilesSelect(selectedFiles);
    }
  };

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const droppedFiles = Array.from(e.dataTransfer.files ?? []).filter((f) =>
        f.type.startsWith('audio/'),
      );
      if (droppedFiles.length > 0) {
        if (operation === 'noise') {
          handleNoiseFilesSelect(droppedFiles);
        } else if (operation === 'cover') {
          handleCoverFilesSelect(droppedFiles);
        }
      }
    },
    [handleNoiseFilesSelect, handleCoverFilesSelect, operation],
  );

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const updateOption = <K extends keyof ProcessOptions>(
    key: K,
    value: ProcessOptions[K],
  ) => {
    setOptions((prev) => ({ ...prev, [key]: value }));
  };

  const handleReset = useCallback(() => {
    if (batchPreviews) {
      batchPreviews.forEach((item) => {
        URL.revokeObjectURL(item.url);
      });
    }
    setNoiseFiles([]);
    setCoverFiles([]);
    setWavFile(null);
    setMp3SourceFile(null);
    setMetadata(defaultMetadata);
    setWavMetadata(null);
    setMp3SourceMetadata(null);
    setLoadingWavMetadata(false);
    setLoadingMp3SourceMetadata(false);
    if (mp3SourceCoverPreviewUrl) {
      URL.revokeObjectURL(mp3SourceCoverPreviewUrl);
    }
    setMp3SourceCover(null);
    setMp3SourceCoverPreviewUrl(null);
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
        if (result.previewUrl && result.previewUrl !== result.downloadUrl)
          URL.revokeObjectURL(result.previewUrl);
      });
      return createEmptyResultsMap();
    });
    resetOutputFilename();
    setStatus(null);
    setError(null);
    setDownloadUrl(null);
    setDownloadName(null);
    setPreviewUrl(null);
    setBatchPreviews(null);
    setProgress(null);
    setProcessing(false);
  }, [
    batchPreviews,
    convertCoverPreviewUrl,
    retagCoverPreviewUrl,
    retagDonorCoverPreviewUrl,
    mp3SourceCoverPreviewUrl,
    resetOutputFilename,
  ]);

  const submit = async () => {
    const activeOperation = operation;
    if (activeOperation === 'retag-wav') {
      if (!wavFile) {
        setError('Please choose a WAV file.');
        return;
      }
    } else if (activeOperation === 'convert') {
      if (genericConvertFiles.length === 0) {
        setError('Please choose an audio file to convert.');
        return;
      }
    } else if (activeOperation === 'retag') {
      if (!retagFile) {
        setError('Please choose an MP3 file to retag.');
        return;
      }
    } else if (activeOperation === 'trim') {
      if (!trimFile) {
        setError('Please choose an audio file to trim.');
        return;
      }
      if (trimOptions.startTime >= trimOptions.endTime) {
        setError('Start time must be before end time.');
        return;
      }
    } else if (activeOperation === 'visualize') {
      if (!visualizerFile) {
        setError('Please choose an audio file to visualize.');
        return;
      }
    } else if (activeOperation === 'noise') {
      if (noiseFiles.length === 0) {
        setError('Please choose an audio file.');
        return;
      }
    } else if (activeOperation === 'cover') {
      if (coverFiles.length === 0) {
        setError('Please choose an audio file.');
        return;
      }
    }

    setProcessing(true);
    setError(null);
    setStatus('Processing...');
    setProgress(0);
    replaceOperationResult(activeOperation, {
      ...createEmptyResult(),
      status: 'Processing...',
      progress: 0,
      processing: true,
    });

    const onProgress: ProgressCallback = ({ percent }) => {
      setProgress(percent);
      setResultsByOperation((prev) => ({
        ...prev,
        [activeOperation]: {
          ...prev[activeOperation],
          progress: percent,
          processing: true,
        },
      }));
    };

    const onBatchProgress: BatchProgressCallback = ({
      percent,
      currentFile,
      totalFiles,
    }) => {
      setProgress(percent);
      setStatus(`Processing file ${currentFile} of ${totalFiles}...`);
      setResultsByOperation((prev) => ({
        ...prev,
        [activeOperation]: {
          ...prev[activeOperation],
          progress: percent,
          status: `Processing file ${currentFile} of ${totalFiles}...`,
          processing: true,
        },
      }));
    };

    try {
      if (activeOperation === 'noise') {
        if (noiseFiles.length === 1) {
          const [singleFile] = noiseFiles;
          if (!singleFile) {
            throw new Error('No file selected for noise processing.');
          }
          const result = await processAudio(singleFile, options, onProgress);
          const url = URL.createObjectURL(result.blob);
          replaceOperationResult(activeOperation, {
            status: 'Noise added and concatenated. Ready to download.',
            error: null,
            downloadUrl: url,
            downloadName: result.filename,
            previewUrl: url,
            batchPreviews: null,
            progress: null,
            processing: false,
          });
        } else {
          const result = await processAudioBatch(
            noiseFiles,
            options,
            onBatchProgress,
          );
          const previewItems = result.items.map((item) => ({
            name: item.filename,
            url: URL.createObjectURL(item.blob),
            type: 'audio' as const,
          }));
          const url = URL.createObjectURL(result.zip.blob);
          replaceOperationResult(activeOperation, {
            status: `Processed ${noiseFiles.length} files. Ready to download ZIP.`,
            error: null,
            downloadUrl: url,
            downloadName: result.zip.filename,
            previewUrl: null,
            batchPreviews: previewItems,
            progress: null,
            processing: false,
          });
        }
      } else if (activeOperation === 'cover') {
        if (coverFiles.length === 1) {
          const [singleFile] = coverFiles;
          if (!singleFile) {
            throw new Error('No file selected for cover extraction.');
          }
          const result = await extractCover(singleFile, onProgress);
          const url = URL.createObjectURL(result.blob);
          replaceOperationResult(activeOperation, {
            status: 'Cover extracted. Ready to download.',
            error: null,
            downloadUrl: url,
            downloadName: result.filename,
            previewUrl: url,
            batchPreviews: null,
            progress: null,
            processing: false,
          });
        } else {
          const result = await extractCoverBatch(coverFiles, onBatchProgress);
          const previewItems = result.items.map((item) => ({
            name: item.filename,
            url: URL.createObjectURL(item.blob),
            type: 'image' as const,
          }));
          const url = URL.createObjectURL(result.zip.blob);
          replaceOperationResult(activeOperation, {
            status: `Extracted covers from ${coverFiles.length} files. Ready to download ZIP.`,
            error: null,
            downloadUrl: url,
            downloadName: result.zip.filename,
            previewUrl: null,
            batchPreviews: previewItems,
            progress: null,
            processing: false,
          });
        }
      } else if (activeOperation === 'retag-wav') {
        if (!wavFile) {
          throw new Error('No WAV file provided for retagging.');
        }
        // Use custom filename if provided, otherwise fall back to default base name
        const defaultBase = mp3SourceFile
          ? mp3SourceFile.name.replace(/\.mp3$/i, '')
          : wavFile.name.replace(/\.wav$/i, '');
        const baseFilename = outputFilename.trim() || defaultBase;
        // Always append .mp3 extension (outputFilename stores base name only)
        const finalName = `${baseFilename}.mp3`;
        const result = await convertWavToMp3(
          wavFile,
          mp3SourceFile,
          metadata,
          finalName,
          onProgress,
          convertCover ?? undefined,
        );
        const url = URL.createObjectURL(result.blob);
        replaceOperationResult(activeOperation, {
          status:
            'WAV retagged into 320kbps MP3 with metadata. Ready to download.',
          error: null,
          downloadUrl: url,
          downloadName: finalName,
          previewUrl: url,
          batchPreviews: null,
          progress: null,
          processing: false,
        });
      } else if (activeOperation === 'convert') {
        const formatLabel = genericConvertOptions.format.toUpperCase();
        const isLossless = LOSSLESS_FORMATS.includes(
          genericConvertOptions.format,
        );
        const bitrateInfo = isLossless
          ? 'lossless'
          : genericConvertOptions.bitrate ?? 'original';

        if (genericConvertFiles.length === 1) {
          const [singleFile] = genericConvertFiles;
          if (!singleFile) {
            throw new Error('No file selected for conversion.');
          }
          const result = await convertAudio(
            singleFile,
            genericConvertOptions,
            undefined,
            onProgress,
          );
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
          const result = await convertAudioBatch(
            genericConvertFiles,
            genericConvertOptions,
            onBatchProgress,
          );
          const previewItems = result.items.map((item) => ({
            name: item.filename,
            url: URL.createObjectURL(item.blob),
            type: 'audio' as const,
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
      } else if (activeOperation === 'retag') {
        if (!retagFile) {
          throw new Error('No MP3 selected for retagging.');
        }
        // Use custom filename if provided, otherwise fall back to default base name
        const defaultBase = `${retagFile.name.replace(/\.mp3$/i, '')}_retagged`;
        const baseFilename = outputFilename.trim() || defaultBase;
        // Always append .mp3 extension (outputFilename stores base name only)
        const finalName = `${baseFilename}.mp3`;
        const result = await retagMp3(
          retagFile,
          retagMetadata,
          onProgress,
          retagCover ?? undefined,
          finalName,
        );
        const url = URL.createObjectURL(result.blob);
        replaceOperationResult(activeOperation, {
          status: 'MP3 retagged with new metadata. Ready to download.',
          error: null,
          downloadUrl: url,
          downloadName: finalName,
          previewUrl: url,
          batchPreviews: null,
          progress: null,
          processing: false,
        });
      } else if (activeOperation === 'trim') {
        if (!trimFile) {
          throw new Error('No file selected for trimming.');
        }
        const result = await trimAudio(trimFile, trimOptions, onProgress);
        const url = URL.createObjectURL(result.blob);
        const resultExt = result.filename.split('.').pop();
        const formatLabel = resultExt
          ? resultExt.toUpperCase()
          : trimOptions.format.toUpperCase();
        const duration = trimOptions.endTime - trimOptions.startTime;
        const silenceInfo = trimOptions.removeSilence
          ? ' with silence removed'
          : '';
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
      } else if (activeOperation === 'visualize') {
        if (!visualizerRef.current) {
          throw new Error('Visualizer not ready');
        }
        setProgress(50);
        const result = await visualizerRef.current.exportToPng();
        const url = URL.createObjectURL(result.blob);
        replaceOperationResult(activeOperation, {
          status: 'Waveform PNG generated. Ready to download.',
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
      const message =
        err instanceof Error ? err.message : 'Something went wrong.';
      replaceOperationResult(activeOperation, {
        ...createEmptyResult(),
        error: message,
      });
    }
  };

  return (
    <>
      {hydrated &&
        consent === true &&
        AnalyticsComponent &&
        SpeedInsightsComponent && (
          <>
            <SpeedInsightsComponent />
            <AnalyticsComponent />
          </>
        )}
      {hydrated && consent === null && (
        <AnalyticsConsentModal
          adblockStatus={adblockStatus}
          onAccept={() => setConsent(true)}
          onDecline={() => setConsent(false)}
        />
      )}

      <main className="card">
        <OperationPicker
          operation={operation}
          onChange={handleOperationChange}
        />

        <div
          hidden={
            operation === 'retag-wav' ||
            operation === 'convert' ||
            operation === 'retag' ||
            operation === 'trim' ||
            operation === 'visualize'
          }
          aria-hidden={
            operation === 'retag-wav' ||
            operation === 'convert' ||
            operation === 'retag' ||
            operation === 'trim' ||
            operation === 'visualize'
          }
          data-operation-section="audio-file-picker"
        >
          <AudioFilePicker
            files={
              operation === 'noise'
                ? noiseFiles
                : coverFiles
            }
            dragOver={dragOver}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onChange={handleFileChange}
          />
        </div>

        <div
          hidden={operation !== 'retag-wav'}
          aria-hidden={operation !== 'retag-wav'}
          data-operation-section="retag-wav"
        >
          <RetagWavSection
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
            wavMetadata={wavMetadata}
            mp3SourceMetadata={mp3SourceMetadata}
            mp3SourceCoverPreviewUrl={mp3SourceCoverPreviewUrl}
            loadingWavMetadata={loadingWavMetadata}
            loadingMp3SourceMetadata={loadingMp3SourceMetadata}
            onImportWavFields={handleImportWavFields}
            onImportMp3SourceFields={handleImportMp3SourceFields}
          />
        </div>

        <div
          hidden={operation !== 'convert'}
          aria-hidden={operation !== 'convert'}
          data-operation-section="convert"
        >
          <ConvertSection
            files={genericConvertFiles}
            dragOver={dragOverGeneric}
            options={genericConvertOptions}
            isLosslessFormat={isLosslessFormat}
            sampleRateOptions={
              SAMPLE_RATES_BY_FORMAT[genericConvertOptions.format]
            }
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
        </div>

        <div
          hidden={operation !== 'retag'}
          aria-hidden={operation !== 'retag'}
          data-operation-section="retag"
        >
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
        </div>

        <div
          hidden={operation !== 'trim'}
          aria-hidden={operation !== 'trim'}
          data-operation-section="trim"
        >
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
        </div>

        <div
          hidden={operation !== 'visualize'}
          aria-hidden={operation !== 'visualize'}
          data-operation-section="visualize"
        >
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
        </div>

        <div
          hidden={operation !== 'noise'}
          aria-hidden={operation !== 'noise'}
          data-operation-section="noise"
        >
          <NoiseOptions options={options} onChange={updateOption} />
        </div>

        <div
          hidden={operation !== 'cover'}
          aria-hidden={operation !== 'cover'}
          data-operation-section="cover"
        >
          <section className="section">
            <h2 className="section-title">
              <span className="step-number">3</span>
              Cover extraction
            </h2>
            <p className="hint">
              We will extract the embedded cover as a JPEG if present.
            </p>
          </section>
        </div>

        <div
          hidden={operation !== 'retag-wav' && operation !== 'retag'}
          aria-hidden={operation !== 'retag-wav' && operation !== 'retag'}
          data-operation-section="output-filename"
        >
          <OutputFilenameSection
            outputFilename={outputFilename}
            onFilenameChange={setOutputFilename}
            useAutoFilename={useAutoFilename}
            onAutoFilenameChange={setUseAutoFilename}
            placeholder={
              operation === 'retag-wav' ? 'output.mp3' : 'output_retagged.mp3'
            }
          />
        </div>

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
          adblockStatus={adblockStatus}
          onToggleAnalytics={() => setConsent(consent !== true)}
        />
      </main>
    </>
  );
}

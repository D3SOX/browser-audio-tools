import { useCallback, useEffect, useMemo, useState } from "react";
import type { NoiseType, ProcessOptions, ID3Metadata, GenericConvertOptions, OutputFormat, SampleRate, Channels, ProgressCallback } from "./api";
import { extractCover, processAudio, readMetadataFromFile, convertWavToMp3, convertAudio } from "./api";
import "./styles.css";

type Operation = "noise" | "cover" | "convert" | "generic-convert";
type Theme = "light" | "dark" | "system";

const defaultMetadata: ID3Metadata = {
  title: "",
  artist: "",
  album: "",
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

function formatSize(bytes: number) {
  if (!bytes) return "";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const size = bytes / 1024 ** index;
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[index]}`;
}

function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem("theme") as Theme | null;
    return stored ?? "system";
  });

  const resolvedTheme = useMemo(() => {
    if (theme === "system") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return theme;
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", resolvedTheme);
  }, [resolvedTheme]);

  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      document.documentElement.setAttribute("data-theme", mq.matches ? "dark" : "light");
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    localStorage.setItem("theme", next);
  }, []);

  return { theme, resolvedTheme, setTheme };
}

function ThemeToggle({ theme, setTheme }: { theme: Theme; setTheme: (t: Theme) => void }) {
  const options: { value: Theme; icon: string; label: string }[] = [
    { value: "system", icon: "🖥️", label: "Auto" },
    { value: "light", icon: "☀️", label: "Light" },
    { value: "dark", icon: "🌙", label: "Dark" },
  ];

  const activeIndex = options.findIndex((opt) => opt.value === theme);

  return (
    <div className="theme-switch" aria-label="Theme selector">
      <div className="theme-switch-track">
        <span
          className="theme-switch-indicator"
          style={{ transform: `translateX(${Math.max(activeIndex, 0) * 100}%)` }}
          aria-hidden="true"
        />
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`theme-switch-btn ${theme === opt.value ? "active" : ""}`}
            onClick={() => setTheme(opt.value)}
            title={`${opt.label} theme`}
          >
            <span aria-hidden="true">{opt.icon}</span>
            <span className="theme-switch-label">{opt.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

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

  // Progress state
  const [progress, setProgress] = useState<number | null>(null);

  const isLosslessFormat = LOSSLESS_FORMATS.includes(genericConvertOptions.format);

  const clearResults = useCallback(() => {
    setDownloadUrl((url) => {
      if (url) URL.revokeObjectURL(url);
      return null;
    });
    setPreviewUrl((url) => {
      if (url) URL.revokeObjectURL(url);
      return null;
    });
    setDownloadName(null);
    setStatus(null);
    setError(null);
    setProgress(null);
  }, []);

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
    (e: React.DragEvent) => {
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
    (e: React.DragEvent) => {
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
    (e: React.DragEvent) => {
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

  const handleFileSelect = useCallback(
    (nextFile: File | null) => {
      setFile(nextFile);
      clearResults();
    },
    [clearResults]
  );

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    handleFileSelect(event.target.files?.[0] ?? null);
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const droppedFile = e.dataTransfer.files?.[0];
      if (droppedFile && droppedFile.type.startsWith("audio/")) {
        handleFileSelect(droppedFile);
      }
    },
    [handleFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const updateOption = <K extends keyof ProcessOptions>(key: K, value: ProcessOptions[K]) => {
    setOptions((prev) => ({ ...prev, [key]: value }));
  };

  const submit = async () => {
    if (operation === "convert") {
      if (!wavFile || !mp3SourceFile) {
        setError("Please choose both a WAV file and an MP3 source file.");
        return;
      }
    } else if (operation === "generic-convert") {
      if (!genericConvertFile) {
        setError("Please choose an audio file to convert.");
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

    const onProgress: ProgressCallback = ({ percent }) => setProgress(percent);

    try {
      if (operation === "noise") {
        const result = await processAudio(file!, options, onProgress);
        const url = URL.createObjectURL(result.blob);
        setDownloadUrl(url);
        setDownloadName(result.filename);
        setPreviewUrl(url);
        setStatus("Noise added and concatenated. Ready to download.");
      } else if (operation === "cover") {
        const result = await extractCover(file!, onProgress);
        const url = URL.createObjectURL(result.blob);
        setDownloadUrl(url);
        setDownloadName(result.filename);
        setPreviewUrl(url);
        setStatus("Cover extracted. Ready to download.");
      } else if (operation === "convert") {
        const outputName = mp3SourceFile!.name.replace(/\.mp3$/i, "") + ".mp3";
        const result = await convertWavToMp3(wavFile!, mp3SourceFile!, metadata, outputName, onProgress);
        const url = URL.createObjectURL(result.blob);
        setDownloadUrl(url);
        setDownloadName(outputName);
        setPreviewUrl(url);
        setStatus("WAV retagged into 320kbps MP3 with metadata. Ready to download.");
      } else if (operation === "generic-convert") {
        const result = await convertAudio(genericConvertFile!, genericConvertOptions, undefined, onProgress);
        const url = URL.createObjectURL(result.blob);
        setDownloadUrl(url);
        setDownloadName(result.filename);
        setPreviewUrl(url);
        const formatLabel = genericConvertOptions.format.toUpperCase();
        const isLosslessFormat = LOSSLESS_FORMATS.includes(genericConvertOptions.format);
        const bitrateInfo = isLosslessFormat ? "lossless" : genericConvertOptions.bitrate;
        setStatus(`Converted to ${formatLabel} (${bitrateInfo}). Ready to download.`);
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStatus(null);
    } finally {
      setProcessing(false);
      setProgress(null);
    }
  };

  return (
    <div className="app-wrapper">
      <div className="app-container">
        {/* Hero Header */}
        <header className="hero">
          <div className="hero-content">
            <h1 className="hero-title">Browser Audio Tools</h1>
            <p className="hero-subtitle">
              Various tools for client-side audio processing
            </p>
            <div className="hero-actions">
              <a
                className="github-link"
                href="https://github.com/D3SOX/browser-audio-tools"
                target="_blank"
                rel="noreferrer"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.18-3.37-1.18-.45-1.14-1.1-1.44-1.1-1.44-.9-.62.07-.61.07-.61 1 .07 1.53 1.02 1.53 1.02.89 1.52 2.34 1.08 2.9.83.09-.65.35-1.08.63-1.33-2.22-.25-4.56-1.11-4.56-4.95 0-1.09.39-1.98 1.02-2.67-.1-.25-.44-1.26.1-2.64 0 0 .84-.27 2.75 1.02a9.6 9.6 0 0 1 5 0c1.9-1.29 2.74-1.02 2.74-1.02.55 1.38.21 2.39.1 2.64.64.69 1.02 1.58 1.02 2.67 0 3.85-2.34 4.69-4.58 4.94.36.31.68.92.68 1.85v2.74c0 .26.18.57.69.48A10 10 0 0 0 12 2Z"
                  />
                </svg>
                <span>View on GitHub</span>
              </a>
            </div>
          </div>
          <ThemeToggle theme={theme} setTheme={setTheme} />
        </header>

        {/* Main Card */}
        <main className="card">
          {/* Operation Picker */}
          <section className="section">
            <h2 className="section-title">
              <span className="step-number">1</span>
              Pick an operation
            </h2>
            <div className="radio-group">
              <label className={`radio-card ${operation === "noise" ? "selected" : ""}`}>
                <input
                  type="radio"
                  name="operation"
                  value="noise"
                  checked={operation === "noise"}
                  onChange={() => setOperation("noise")}
                />
                <div className="radio-card-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M2 10s3-3 5-3 5 5 5 5 3-3 5-3 5 3 5 3" />
                    <path d="M2 14s3 3 5 3 5-5 5-5 3 3 5 3 5-3 5-3" />
                  </svg>
                </div>
                <span className="radio-card-label">Noise + Track</span>
              </label>
              <label className={`radio-card ${operation === "cover" ? "selected" : ""}`}>
                <input
                  type="radio"
                  name="operation"
                  value="cover"
                  checked={operation === "cover"}
                  onChange={() => setOperation("cover")}
                />
                <div className="radio-card-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="M21 15l-5-5L5 21" />
                  </svg>
                </div>
                <span className="radio-card-label">Extract Cover</span>
              </label>
              <label className={`radio-card ${operation === "convert" ? "selected" : ""}`}>
                <input
                  type="radio"
                  name="operation"
                  value="convert"
                  checked={operation === "convert"}
                  onChange={() => setOperation("convert")}
                />
                <div className="radio-card-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14,2 14,8 20,8" />
                    <path d="M9 15l2 2 4-4" />
                  </svg>
                </div>
                <span className="radio-card-label">Retag WAV into MP3</span>
              </label>
              <label className={`radio-card ${operation === "generic-convert" ? "selected" : ""}`}>
                <input
                  type="radio"
                  name="operation"
                  value="generic-convert"
                  checked={operation === "generic-convert"}
                  onChange={() => setOperation("generic-convert")}
                />
                <div className="radio-card-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                  </svg>
                </div>
                <span className="radio-card-label">Convert Audio</span>
              </label>
            </div>
          </section>

          {/* File Picker - only for noise/cover operations */}
          {operation !== "convert" && operation !== "generic-convert" && (
            <section className="section">
              <h2 className="section-title">
                <span className="step-number">2</span>
                Choose an audio file
              </h2>
              <div
                className={`file-dropzone ${dragOver ? "drag-over" : ""} ${file ? "has-file" : ""}`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
              >
                <input
                  type="file"
                  accept="audio/*"
                  onChange={handleFileChange}
                  className="file-input-hidden"
                  id="file-input"
                />
                <label htmlFor="file-input" className="file-dropzone-label">
                  <div className="file-icon">
                    {file ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 12l2 2 4-4" />
                        <circle cx="12" cy="12" r="10" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17,8 12,3 7,8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                    )}
                  </div>
                  <div className="file-text">
                    {file ? (
                      <>
                        <span className="file-name">{file.name}</span>
                        <span className="file-size">{formatSize(file.size)}</span>
                      </>
                    ) : (
                      <>
                        <span className="file-cta">Click to browse or drag & drop</span>
                        <span className="file-hint">MP3, M4A, WAV preferred</span>
                      </>
                    )}
                  </div>
                </label>
              </div>
            </section>
          )}

          {/* Convert Files Section */}
          {operation === "convert" && (
            <>
              <section className="section">
                <h2 className="section-title">
                  <span className="step-number">2</span>
                  Choose files
                </h2>
                <p className="hint">Outputs a 320kbps MP3; tags and art copy from the MP3 source.</p>
                <div className="convert-files-grid">
                  {/* WAV File Picker */}
                  <div
                    className={`file-dropzone file-dropzone-small ${dragOverWav ? "drag-over" : ""} ${wavFile ? "has-file" : ""}`}
                    onDrop={handleWavDrop}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOverWav(true);
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      setDragOverWav(false);
                    }}
                  >
                    <input
                      type="file"
                      accept=".wav,audio/wav"
                      onChange={(e) => handleWavFileSelect(e.target.files?.[0] ?? null)}
                      className="file-input-hidden"
                      id="wav-input"
                    />
                    <label htmlFor="wav-input" className="file-dropzone-label">
                      <div className="file-icon">
                        {wavFile ? (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M9 12l2 2 4-4" />
                            <circle cx="12" cy="12" r="10" />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M9 18V5l12-2v13" />
                            <circle cx="6" cy="18" r="3" />
                            <circle cx="18" cy="16" r="3" />
                          </svg>
                        )}
                      </div>
                      <div className="file-text">
                        {wavFile ? (
                          <>
                            <span className="file-name">{wavFile.name}</span>
                            <span className="file-size">{formatSize(wavFile.size)}</span>
                          </>
                        ) : (
                          <>
                            <span className="file-cta">WAV file (source audio)</span>
                            <span className="file-hint">The audio to convert</span>
                          </>
                        )}
                      </div>
                    </label>
                  </div>

                  {/* MP3 Source Picker */}
                  <div
                    className={`file-dropzone file-dropzone-small ${dragOverMp3 ? "drag-over" : ""} ${mp3SourceFile ? "has-file" : ""}`}
                    onDrop={handleMp3Drop}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOverMp3(true);
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      setDragOverMp3(false);
                    }}
                  >
                    <input
                      type="file"
                      accept=".mp3,audio/mpeg"
                      onChange={(e) => handleMp3SourceSelect(e.target.files?.[0] ?? null)}
                      className="file-input-hidden"
                      id="mp3-source-input"
                    />
                    <label htmlFor="mp3-source-input" className="file-dropzone-label">
                      <div className="file-icon">
                        {mp3SourceFile ? (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M9 12l2 2 4-4" />
                            <circle cx="12" cy="12" r="10" />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14,2 14,8 20,8" />
                            <line x1="16" y1="13" x2="8" y2="13" />
                            <line x1="16" y1="17" x2="8" y2="17" />
                          </svg>
                        )}
                      </div>
                      <div className="file-text">
                        {mp3SourceFile ? (
                          <>
                            <span className="file-name">{mp3SourceFile.name}</span>
                            <span className="file-size">{formatSize(mp3SourceFile.size)}</span>
                          </>
                        ) : (
                          <>
                            <span className="file-cta">MP3 file (metadata source)</span>
                            <span className="file-hint">Copy tags & artwork from</span>
                          </>
                        )}
                      </div>
                    </label>
                  </div>
                </div>
              </section>

              <section className="section">
                <h2 className="section-title">
                  <span className="step-number">3</span>
                  Edit metadata
                  {loadingMetadata && <span className="loading-text"> (loading...)</span>}
                </h2>
                <div className="options-grid">
                  <div className="input-group">
                    <label htmlFor="metaTitle">Title</label>
                    <input
                      id="metaTitle"
                      type="text"
                      value={metadata.title}
                      onChange={(e) => updateMetadata("title", e.target.value)}
                      placeholder="Track title"
                    />
                  </div>
                  <div className="input-group">
                    <label htmlFor="metaArtist">Artist</label>
                    <input
                      id="metaArtist"
                      type="text"
                      value={metadata.artist}
                      onChange={(e) => updateMetadata("artist", e.target.value)}
                      placeholder="Artist name"
                    />
                  </div>
                  <div className="input-group input-group-full">
                    <label htmlFor="metaAlbum">Album</label>
                    <input
                      id="metaAlbum"
                      type="text"
                      value={metadata.album}
                      onChange={(e) => updateMetadata("album", e.target.value)}
                      placeholder="Album name"
                    />
                  </div>
                </div>
                <p className="hint">Metadata is prefilled from the MP3 source. Edit before converting.</p>
              </section>
            </>
          )}

          {/* Generic Converter Section */}
          {operation === "generic-convert" && (
            <>
              <section className="section">
                <h2 className="section-title">
                  <span className="step-number">2</span>
                  Choose an audio file
                </h2>
                <div
                  className={`file-dropzone ${dragOverGeneric ? "drag-over" : ""} ${genericConvertFile ? "has-file" : ""}`}
                  onDrop={handleGenericConvertDrop}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverGeneric(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    setDragOverGeneric(false);
                  }}
                >
                  <input
                    type="file"
                    accept="audio/*,.wav,.flac,.aiff,.aif,.mp3,.ogg,.m4a"
                    onChange={(e) => handleGenericConvertFileSelect(e.target.files?.[0] ?? null)}
                    className="file-input-hidden"
                    id="generic-convert-input"
                  />
                  <label htmlFor="generic-convert-input" className="file-dropzone-label">
                    <div className="file-icon">
                      {genericConvertFile ? (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M9 12l2 2 4-4" />
                          <circle cx="12" cy="12" r="10" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="17,8 12,3 7,8" />
                          <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                      )}
                    </div>
                    <div className="file-text">
                      {genericConvertFile ? (
                        <>
                          <span className="file-name">{genericConvertFile.name}</span>
                          <span className="file-size">{formatSize(genericConvertFile.size)}</span>
                        </>
                      ) : (
                        <>
                          <span className="file-cta">Click to browse or drag & drop</span>
                          <span className="file-hint">Supports WAV, FLAC, AIFF, MP3, OGG, and more.</span>
                        </>
                      )}
                    </div>
                  </label>
                </div>
              </section>

              <section className="section">
                <h2 className="section-title">
                  <span className="step-number">3</span>
                  Conversion options
                </h2>
                <div className="options-grid">
                  <div className="input-group">
                    <label htmlFor="outputFormat">Output format</label>
                    <select
                      id="outputFormat"
                      value={genericConvertOptions.format}
                      onChange={(e) => updateGenericConvertOption("format", e.target.value as OutputFormat)}
                    >
                      <optgroup label="Lossy">
                        <option value="mp3">MP3</option>
                        <option value="ogg">OGG Vorbis</option>
                        <option value="aac">AAC (M4A)</option>
                      </optgroup>
                      <optgroup label="Lossless">
                        <option value="wav">WAV</option>
                        <option value="flac">FLAC</option>
                        <option value="aiff">AIFF</option>
                      </optgroup>
                    </select>
                  </div>
                  <div className={`input-group ${isLosslessFormat ? "input-group-disabled" : ""}`}>
                    <label htmlFor="convertBitrate" className="label-with-tooltip">
                      <span>Bitrate</span>
                      <span
                          className={`tooltip-icon ${isLosslessFormat ? "tooltip-icon-active" : ""}`}
                          data-tooltip="Bitrate is not applicable for lossless formats."
                          aria-label="Bitrate is not applicable for lossless formats."
                          role="tooltip"
                          aria-hidden={!isLosslessFormat}
                      >
                        i
                      </span>
                    </label>
                    <select
                        id="convertBitrate"
                        value={genericConvertOptions.bitrate}
                        onChange={(e) => updateGenericConvertOption("bitrate", e.target.value)}
                        disabled={isLosslessFormat}
                    >
                      <option value="96k">96 kbps</option>
                      <option value="128k">128 kbps</option>
                      <option value="192k">192 kbps</option>
                      <option value="256k">256 kbps</option>
                      <option value="320k">320 kbps</option>
                    </select>
                  </div>
                  <div className="input-group">
                    <label htmlFor="sampleRate">Sample rate</label>
                    <select
                      id="sampleRate"
                      value={genericConvertOptions.sampleRate}
                      onChange={(e) => updateGenericConvertOption("sampleRate", Number(e.target.value) as SampleRate)}
                    >
                      <option value={44100}>44.1 kHz</option>
                      <option value={48000}>48 kHz</option>
                      <option value={96000}>96 kHz</option>
                    </select>
                  </div>
                  <div className="input-group">
                    <label htmlFor="channels">Channels</label>
                    <select
                      id="channels"
                      value={genericConvertOptions.channels}
                      onChange={(e) => updateGenericConvertOption("channels", Number(e.target.value) as Channels)}
                    >
                      <option value={1}>Mono</option>
                      <option value={2}>Stereo</option>
                    </select>
                  </div>
                </div>
              </section>
            </>
          )}

          {/* Options */}
          {operation === "noise" && (
            <section className="section">
              <h2 className="section-title">
                <span className="step-number">3</span>
                Noise options
              </h2>
              <div className="options-grid">
                <div className="input-group">
                  <label htmlFor="durationSeconds">Noise duration (seconds)</label>
                  <input
                    id="durationSeconds"
                    type="number"
                    min={1}
                    value={options.durationSeconds}
                    onChange={(e) => updateOption("durationSeconds", Number(e.target.value) || 0)}
                  />
                </div>
                <div className="input-group">
                  <label htmlFor="noiseVolume">Noise volume (0 - 1.0)</label>
                  <input
                    id="noiseVolume"
                    type="number"
                    min={0}
                    max={1}
                    step={0.01}
                    value={options.noiseVolume}
                    onChange={(e) => updateOption("noiseVolume", Number(e.target.value) || 0)}
                  />
                </div>
                <div className="input-group">
                  <label htmlFor="noiseType">Noise type</label>
                  <select
                    id="noiseType"
                    value={options.noiseType}
                    onChange={(e) => updateOption("noiseType", e.target.value as NoiseType)}
                  >
                    <option value="pink">Pink (filtered)</option>
                    <option value="white">White</option>
                  </select>
                </div>
                <div className="input-group">
                  <label htmlFor="bitrate">Output bitrate</label>
                  <input
                    id="bitrate"
                    type="text"
                    value={options.bitrate}
                    onChange={(e) => updateOption("bitrate", e.target.value)}
                  />
                </div>
              </div>
            </section>
          )}

          {operation === "cover" && (
            <section className="section">
              <h2 className="section-title">
                <span className="step-number">3</span>
                Cover extraction
              </h2>
              <p className="hint">We will extract the embedded cover as a JPEG if present.</p>
            </section>
          )}

          {/* Actions */}
          <section className="section">
            <h2 className="section-title">
              <span className="step-number">4</span>
              Run
            </h2>
            <div className="actions">
              <button className="btn btn-primary" onClick={submit} disabled={processing || loadingMetadata}>
                {processing ? (
                  <>
                    <span className="spinner" />
                    Working...
                  </>
                ) : operation === "noise" ? (
                  "Add noise + concat"
                ) : operation === "cover" ? (
                  "Extract cover"
                ) : operation === "convert" ? (
                  "Convert to MP3"
                ) : (
                  `Convert to ${genericConvertOptions.format.toUpperCase()}`
                )}
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setFile(null);
                  setWavFile(null);
                  setMp3SourceFile(null);
                  setMetadata(defaultMetadata);
                  setOptions(defaultOptions);
                  setGenericConvertFile(null);
                  setGenericConvertOptions(defaultGenericConvertOptions);
                  clearResults();
                }}
                disabled={processing}
              >
                Reset
              </button>
              {processing && progress !== null && (
                <div className="progress-inline">
                  <div
                    className="progress-bar"
                    role="progressbar"
                    aria-valuenow={progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div className="progress-fill" style={{ width: `${progress}%` }} />
                  </div>
                  <span className="progress-text">{progress}%</span>
                </div>
              )}
            </div>

            {status && <div className="status-message success">{status}</div>}
            {error && <div className="status-message error">{error}</div>}

            {downloadUrl && downloadName && (
              <div className="result-card">
                <div className="result-header">
                  <span className="result-label">Result ready</span>
                  <a href={downloadUrl} download={downloadName} className="download-link">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7,10 12,15 17,10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    {downloadName}
                  </a>
                </div>
                <div className="result-preview">
                  {operation === "cover" ? (
                    <img src={previewUrl ?? undefined} alt="Cover preview" />
                  ) : (
                    <audio controls src={previewUrl ?? undefined} />
                  )}
                </div>
              </div>
            )}
          </section>

          {/* Footer hint */}
          <footer className="card-footer">
            <p className="footer-hint">
              Runs entirely in your browser via ffmpeg.wasm. Files never leave your device.
            </p>
            <p className="footer-hint">
              Need broader file conversions? Try{" "}
              <a href="https://vert.sh/" target="_blank" rel="noreferrer">
                VERT
              </a>{" "}
              (open source) — this site focuses on niche audio workflows.
            </p>
          </footer>
        </main>
      </div>
    </div>
  );
}

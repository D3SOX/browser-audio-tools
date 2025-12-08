import type { ChangeEvent, DragEvent } from "react";
import type { Channels, GenericConvertOptions, OutputFormat, SampleRate } from "../api";
import { formatSize } from "../utils/formatSize";

type GenericConvertSectionProps = {
  files: File[];
  dragOver: boolean;
  options: GenericConvertOptions;
  isLosslessFormat: boolean;
  sampleRateOptions: SampleRate[];
  onDrop: (e: DragEvent) => void;
  onDragOver: (e: DragEvent) => void;
  onDragLeave: (e: DragEvent) => void;
  onFilesChange: (files: File[]) => void;
  onOptionChange: <K extends keyof GenericConvertOptions>(key: K, value: GenericConvertOptions[K]) => void;
};

export function GenericConvertSection({
  files,
  dragOver,
  options,
  isLosslessFormat,
  sampleRateOptions,
  onDrop,
  onDragOver,
  onDragLeave,
  onFilesChange,
  onOptionChange,
}: GenericConvertSectionProps) {
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files ?? []);
    onFilesChange(selectedFiles);
  };

  const hasFiles = files.length > 0;
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  return (
    <>
      <section className="section">
        <h2 className="section-title">
          <span className="step-number">2</span>
          Choose audio files
        </h2>
        <div className={`file-dropzone ${dragOver ? "drag-over" : ""} ${hasFiles ? "has-file" : ""}`} onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}>
          <input
            type="file"
            accept="audio/*,.wav,.flac,.aiff,.aif,.mp3,.ogg,.m4a"
            multiple
            onChange={handleFileChange}
            className="file-input-hidden"
            id="convert-input"
          />
          <label htmlFor="convert-input" className="file-dropzone-label">
            <div className="file-icon">
              {hasFiles ? (
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
            {hasFiles ? (
              <>
                <span className="file-name">
                  {files.length === 1 ? files[0]!.name : `${files.length} files selected`}
                </span>
                <span className="file-size">{formatSize(totalSize)}</span>
              </>
            ) : (
                <>
                  <span className="file-cta">Click to browse or drag & drop</span>
                  <span className="file-hint">Supports WAV, FLAC, AIFF, MP3, OGG, and more. Select multiple files for batch processing.</span>
                </>
              )}
            </div>
          </label>
        </div>
        {files.length > 1 && (
          <ul className="file-list">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="file-list-item">
                <span className="file-list-name">{f.name}</span>
                <span className="file-list-size">{formatSize(f.size)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section">
        <h2 className="section-title">
          <span className="step-number">3</span>
          Conversion options
        </h2>
        <div className="options-grid">
          <div className="input-group">
            <label htmlFor="outputFormat">Output format</label>
            <select id="outputFormat" value={options.format} onChange={(e) => onOptionChange("format", e.target.value as OutputFormat)}>
              <optgroup label="Lossy">
                <option value="mp3">MP3</option>
                <option value="ogg">OGG Vorbis</option>
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
              value={options.bitrate}
              onChange={(e) => onOptionChange("bitrate", e.target.value)}
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
              value={options.sampleRate}
              onChange={(e) => onOptionChange("sampleRate", Number(e.target.value) as SampleRate)}
            >
              {sampleRateOptions.map((rate) => (
                <option key={rate} value={rate}>
                  {rate / 1000} kHz
                </option>
              ))}
            </select>
          </div>
          <div className="input-group">
            <label htmlFor="channels">Channels</label>
            <select id="channels" value={options.channels} onChange={(e) => onOptionChange("channels", Number(e.target.value) as Channels)}>
              <option value={1}>Mono</option>
              <option value={2}>Stereo</option>
            </select>
          </div>
        </div>
      </section>
    </>
  );
}

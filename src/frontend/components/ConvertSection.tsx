import type { ChangeEvent, DragEvent, KeyboardEvent } from 'react';
import { useId, useRef } from 'react';
import type {
  Channels,
  GenericConvertOptions,
  OutputFormat,
  SampleRate,
} from '../api';
import { formatSupportsCoverArt } from '../api';
import { BITRATE_OPTIONS } from '../types';
import { formatSize } from '../utils/formatSize';

type ConvertSectionProps = {
  files: File[];
  dragOver: boolean;
  options: GenericConvertOptions;
  isLosslessFormat: boolean;
  sampleRateOptions: SampleRate[];
  onDrop: (e: DragEvent) => void;
  onDragOver: (e: DragEvent) => void;
  onDragLeave: (e: DragEvent) => void;
  onFilesChange: (files: File[]) => void;
  onOptionChange: <K extends keyof GenericConvertOptions>(
    key: K,
    value: GenericConvertOptions[K],
  ) => void;
};

export function ConvertSection({
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
}: ConvertSectionProps) {
  const inputId = useId();
  const outputFormatId = useId();
  const bitrateId = useId();
  const sampleRateId = useId();
  const channelsId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files ?? []);
    onFilesChange(selectedFiles);
  };
  const openFileDialog = () => fileInputRef.current?.click();
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openFileDialog();
    }
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
        <button
          className={`file-dropzone ${dragOver ? 'drag-over' : ''} ${hasFiles ? 'has-file' : ''}`}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          type="button"
          aria-label="Audio file dropzone"
          onClick={openFileDialog}
          onKeyDown={handleKeyDown}
        >
          <input
            type="file"
            accept="audio/*,.wav,.flac,.aiff,.aif,.mp3,.ogg,.m4a"
            multiple
            onChange={handleFileChange}
            className="file-input-hidden"
            id={inputId}
            ref={fileInputRef}
          />
          <div className="file-dropzone-label">
            <div className="file-icon">
              {hasFiles ? (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <title>Files selected</title>
                  <path d="M9 12l2 2 4-4" />
                  <circle cx="12" cy="12" r="10" />
                </svg>
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <title>Select files</title>
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
                    {files.length === 1
                      ? files[0]?.name
                      : `${files.length} files selected`}
                  </span>
                  <span className="file-size">{formatSize(totalSize)}</span>
                </>
              ) : (
                <>
                  <span className="file-cta">
                    Click to browse or drag & drop
                  </span>
                  <span className="file-hint">
                    Supports WAV, FLAC, AIFF, MP3, OGG, AAC (m4a), and more.
                    Select multiple files for batch processing.
                  </span>
                </>
              )}
            </div>
          </div>
        </button>
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
            <label htmlFor={outputFormatId}>Output format</label>
            <select
              id={outputFormatId}
              value={options.format}
              onChange={(e) =>
                onOptionChange('format', e.target.value as OutputFormat)
              }
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
          <div
            className={`input-group ${isLosslessFormat ? 'input-group-disabled' : ''}`}
          >
            <label htmlFor={bitrateId} className="label-with-tooltip">
              <span>Bitrate</span>
              <span
                className={`tooltip-icon ${isLosslessFormat ? 'tooltip-icon-active' : ''}`}
                data-tooltip="Bitrate is not applicable for lossless formats."
                aria-label="Bitrate is not applicable for lossless formats."
                role="tooltip"
                aria-hidden={!isLosslessFormat}
              >
                i
              </span>
            </label>
            <select
              id={bitrateId}
              value={options.bitrate ?? ''}
              onChange={(e) =>
                onOptionChange(
                  'bitrate',
                  e.target.value === '' ? null : e.target.value,
                )
              }
              disabled={isLosslessFormat}
            >
              <option value="">Preserve original</option>
              {BITRATE_OPTIONS.map((bitrate) => (
                <option key={bitrate} value={bitrate}>
                  {bitrate.replace('k', '')} kbps
                </option>
              ))}
            </select>
          </div>
          <div className="input-group">
            <label htmlFor={sampleRateId}>Sample rate</label>
            <select
              id={sampleRateId}
              value={options.sampleRate ?? ''}
              onChange={(e) =>
                onOptionChange(
                  'sampleRate',
                  e.target.value === ''
                    ? null
                    : (Number(e.target.value) as SampleRate),
                )
              }
            >
              <option value="">Preserve original</option>
              {sampleRateOptions.map((rate) => (
                <option key={rate} value={rate}>
                  {rate / 1000} kHz
                </option>
              ))}
            </select>
          </div>
          <div className="input-group">
            <label htmlFor={channelsId}>Channels</label>
            <select
              id={channelsId}
              value={options.channels}
              onChange={(e) => {
                const value = e.target.value;
                const next: Channels =
                  value === 'auto' ? 'auto' : (Number(value) as Channels);
                onOptionChange('channels', next);
              }}
            >
              <option value="auto">Auto (match source)</option>
              <option value={2}>Stereo</option>
              <option value={1}>Mono</option>
            </select>
          </div>
        </div>
        {!formatSupportsCoverArt(options.format) && (
          <p className="format-warning">⚠️ WAV does not support cover art.</p>
        )}
      </section>
    </>
  );
}

import type { ChangeEvent, DragEvent, KeyboardEvent } from 'react';
import { useId, useRef } from 'react';
import { formatSize } from '../utils/formatSize';

type AudioFilePickerProps = {
  files: File[];
  dragOver: boolean;
  onDrop: (e: DragEvent) => void;
  onDragOver: (e: DragEvent) => void;
  onDragLeave: (e: DragEvent) => void;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
};

export function AudioFilePicker({
  files,
  dragOver,
  onDrop,
  onDragOver,
  onDragLeave,
  onChange,
}: AudioFilePickerProps) {
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasFiles = files.length > 0;
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  const openFileDialog = () => fileInputRef.current?.click();
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openFileDialog();
    }
  };

  return (
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
        onKeyDown={handleKeyDown}
        onClick={openFileDialog}
      >
        <input
          type="file"
          accept="audio/*"
          multiple
          onChange={onChange}
          className="file-input-hidden"
          id={fileInputId}
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
                <span className="file-cta">Click to browse or drag & drop</span>
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
  );
}

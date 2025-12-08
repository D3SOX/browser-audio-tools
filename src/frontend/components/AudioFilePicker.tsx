import type { ChangeEvent, DragEvent } from "react";
import { formatSize } from "../utils/formatSize";

type AudioFilePickerProps = {
  files: File[];
  dragOver: boolean;
  onDrop: (e: DragEvent) => void;
  onDragOver: (e: DragEvent) => void;
  onDragLeave: (e: DragEvent) => void;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
};

export function AudioFilePicker({ files, dragOver, onDrop, onDragOver, onDragLeave, onChange }: AudioFilePickerProps) {
  const hasFiles = files.length > 0;
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  return (
    <section className="section">
      <h2 className="section-title">
        <span className="step-number">2</span>
        Choose audio files
      </h2>
      <div className={`file-dropzone ${dragOver ? "drag-over" : ""} ${hasFiles ? "has-file" : ""}`} onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}>
        <input type="file" accept="audio/*" multiple onChange={onChange} className="file-input-hidden" id="file-input" />
        <label htmlFor="file-input" className="file-dropzone-label">
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
                <span className="file-hint">MP3, M4A, WAV preferred. Select multiple files for batch processing.</span>
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
  );
}

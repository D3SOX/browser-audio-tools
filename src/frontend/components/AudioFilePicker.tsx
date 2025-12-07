import type { ChangeEvent, DragEvent } from "react";
import { formatSize } from "../utils/formatSize";

type AudioFilePickerProps = {
  file: File | null;
  dragOver: boolean;
  onDrop: (e: DragEvent) => void;
  onDragOver: (e: DragEvent) => void;
  onDragLeave: (e: DragEvent) => void;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
};

export function AudioFilePicker({ file, dragOver, onDrop, onDragOver, onDragLeave, onChange }: AudioFilePickerProps) {
  return (
    <section className="section">
      <h2 className="section-title">
        <span className="step-number">2</span>
        Choose an audio file
      </h2>
      <div className={`file-dropzone ${dragOver ? "drag-over" : ""} ${file ? "has-file" : ""}`} onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}>
        <input type="file" accept="audio/*" onChange={onChange} className="file-input-hidden" id="file-input" />
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
  );
}

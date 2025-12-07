import type { ChangeEvent, DragEvent } from "react";
import type { ID3Metadata } from "../api";
import { formatSize } from "../utils/formatSize";

type RetagSectionProps = {
  file: File | null;
  dragOver: boolean;
  loadingMetadata: boolean;
  metadata: ID3Metadata;
  onDrop: (e: DragEvent) => void;
  onDragOver: (e: DragEvent) => void;
  onDragLeave: (e: DragEvent) => void;
  onFileChange: (file: File | null) => void;
  onMetadataChange: <K extends keyof ID3Metadata>(key: K, value: ID3Metadata[K]) => void;
};

export function RetagSection({
  file,
  dragOver,
  loadingMetadata,
  metadata,
  onDrop,
  onDragLeave,
  onDragOver,
  onFileChange,
  onMetadataChange,
}: RetagSectionProps) {
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => onFileChange(e.target.files?.[0] ?? null);

  return (
    <>
      <section className="section">
        <h2 className="section-title">
          <span className="step-number">2</span>
          Choose an MP3 file
        </h2>
        <div className={`file-dropzone ${dragOver ? "drag-over" : ""} ${file ? "has-file" : ""}`} onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}>
          <input type="file" accept=".mp3,audio/mpeg" onChange={handleFileChange} className="file-input-hidden" id="retag-input" />
          <label htmlFor="retag-input" className="file-dropzone-label">
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
                  <span className="file-hint">MP3 files only</span>
                </>
              )}
            </div>
          </label>
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
            <label htmlFor="retagTitle">Title</label>
            <input id="retagTitle" type="text" value={metadata.title} onChange={(e) => onMetadataChange("title", e.target.value)} placeholder="Track title" />
          </div>
          <div className="input-group">
            <label htmlFor="retagArtist">Artist</label>
            <input id="retagArtist" type="text" value={metadata.artist} onChange={(e) => onMetadataChange("artist", e.target.value)} placeholder="Artist name" />
          </div>
          <div className="input-group">
            <label htmlFor="retagAlbum">
              Album <span className="optional-label">(optional)</span>
            </label>
            <input id="retagAlbum" type="text" value={metadata.album} onChange={(e) => onMetadataChange("album", e.target.value)} placeholder="Album name" />
          </div>
          <div className="input-group">
            <label htmlFor="retagYear">
              Year <span className="optional-label">(optional)</span>
            </label>
            <input id="retagYear" type="text" value={metadata.year ?? ""} onChange={(e) => onMetadataChange("year", e.target.value)} placeholder="e.g. 2024" />
          </div>
          <div className="input-group">
            <label htmlFor="retagTrack">
              Track # <span className="optional-label">(optional)</span>
            </label>
            <input id="retagTrack" type="text" value={metadata.track ?? ""} onChange={(e) => onMetadataChange("track", e.target.value)} placeholder="e.g. 1" />
          </div>
        </div>
        <p className="hint">Existing metadata is prefilled from the file. Edit fields and retag.</p>
      </section>
    </>
  );
}

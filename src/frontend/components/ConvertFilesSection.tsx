import type { ChangeEvent, DragEvent } from "react";
import type { ID3Metadata } from "../api";
import { formatSize } from "../utils/formatSize";
import { CoverArtPicker } from "./CoverArtPicker";

type ConvertFilesSectionProps = {
  wavFile: File | null;
  mp3SourceFile: File | null;
  dragOverWav: boolean;
  dragOverMp3: boolean;
  loadingMetadata: boolean;
  metadata: ID3Metadata;
  coverPreviewUrl: string | null;
  onWavDrop: (e: DragEvent) => void;
  onMp3Drop: (e: DragEvent) => void;
  onWavDragOver: (e: DragEvent) => void;
  onWavDragLeave: (e: DragEvent) => void;
  onMp3DragOver: (e: DragEvent) => void;
  onMp3DragLeave: (e: DragEvent) => void;
  onWavChange: (file: File | null) => void;
  onMp3Change: (file: File | null) => void;
  onMetadataChange: <K extends keyof ID3Metadata>(key: K, value: ID3Metadata[K]) => void;
  onCoverChange: (file: File | null) => void;
};

export function ConvertFilesSection({
  wavFile,
  mp3SourceFile,
  dragOverWav,
  dragOverMp3,
  loadingMetadata,
  metadata,
  coverPreviewUrl,
  onWavDrop,
  onMp3Drop,
  onWavDragLeave,
  onWavDragOver,
  onMp3DragLeave,
  onMp3DragOver,
  onWavChange,
  onMp3Change,
  onMetadataChange,
  onCoverChange,
}: ConvertFilesSectionProps) {
  const handleWavChange = (e: ChangeEvent<HTMLInputElement>) => onWavChange(e.target.files?.[0] ?? null);
  const handleMp3Change = (e: ChangeEvent<HTMLInputElement>) => onMp3Change(e.target.files?.[0] ?? null);

  return (
    <>
      <section className="section">
        <h2 className="section-title">
          <span className="step-number">2</span>
          Choose files
        </h2>
        <p className="hint">Outputs a 320kbps MP3. Optionally import tags and art from an MP3.</p>
        <div className="convert-files-grid">
          <div
            className={`file-dropzone file-dropzone-small ${dragOverWav ? "drag-over" : ""} ${wavFile ? "has-file" : ""}`}
            onDrop={onWavDrop}
            onDragOver={onWavDragOver}
            onDragLeave={onWavDragLeave}
          >
            <input type="file" accept=".wav,audio/wav" onChange={handleWavChange} className="file-input-hidden" id="wav-input" />
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

          <div
            className={`file-dropzone file-dropzone-small ${dragOverMp3 ? "drag-over" : ""} ${mp3SourceFile ? "has-file" : ""}`}
            onDrop={onMp3Drop}
            onDragOver={onMp3DragOver}
            onDragLeave={onMp3DragLeave}
          >
            <input type="file" accept=".mp3,audio/mpeg" onChange={handleMp3Change} className="file-input-hidden" id="mp3-source-input" />
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
                    <span className="file-cta">MP3 file (optional)</span>
                    <span className="file-hint">Import tags & artwork from</span>
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
        <div className="retag-metadata-layout">
          <CoverArtPicker previewUrl={coverPreviewUrl} inputId="convert-cover-input" onChange={onCoverChange} />
          <div className="options-grid retag-fields-grid">
            <div className="input-group">
              <label htmlFor="metaTitle">Title</label>
              <input id="metaTitle" type="text" value={metadata.title} onChange={(e) => onMetadataChange("title", e.target.value)} placeholder="Track title" />
            </div>
            <div className="input-group">
              <label htmlFor="metaArtist">Artist</label>
              <input id="metaArtist" type="text" value={metadata.artist} onChange={(e) => onMetadataChange("artist", e.target.value)} placeholder="Artist name" />
            </div>
            <div className="input-group">
              <label htmlFor="metaAlbum">
                Album <span className="optional-label">(optional)</span>
              </label>
              <input id="metaAlbum" type="text" value={metadata.album} onChange={(e) => onMetadataChange("album", e.target.value)} placeholder="Album name" />
            </div>
            <div className="input-group">
              <label htmlFor="metaYear">
                Year <span className="optional-label">(optional)</span>
              </label>
              <input id="metaYear" type="text" value={metadata.year ?? ""} onChange={(e) => onMetadataChange("year", e.target.value)} placeholder="e.g. 2024" />
            </div>
            <div className="input-group">
              <label htmlFor="metaTrack">
                Track # <span className="optional-label">(optional)</span>
              </label>
              <input id="metaTrack" type="text" value={metadata.track ?? ""} onChange={(e) => onMetadataChange("track", e.target.value)} placeholder="e.g. 1" />
            </div>
          </div>
        </div>
        <p className="hint">Metadata is prefilled from the MP3 source if provided. Edit before converting.</p>
      </section>
    </>
  );
}

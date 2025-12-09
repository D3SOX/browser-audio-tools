import {
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
  useId,
  useRef,
  useState,
} from 'react';
import type { ID3Metadata } from '../api';
import { formatSize } from '../utils/formatSize';
import { CoverArtPicker } from './CoverArtPicker';

const CheckIcon = () => (
  <svg
    viewBox="0 0 12 12"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <title>Checkmark</title>
    <polyline points="2.5,6 5,8.5 9.5,3.5" />
  </svg>
);

type RetagSectionProps = {
  file: File | null;
  dragOver: boolean;
  loadingMetadata: boolean;
  metadata: ID3Metadata;
  coverPreviewUrl: string | null;
  onDrop: (e: DragEvent) => void;
  onDragOver: (e: DragEvent) => void;
  onDragLeave: (e: DragEvent) => void;
  onFileChange: (file: File | null) => void;
  onMetadataChange: <K extends keyof ID3Metadata>(
    key: K,
    value: ID3Metadata[K],
  ) => void;
  onCoverChange: (file: File | null) => void;
  // Donor file props
  donorFile: File | null;
  donorMetadata: ID3Metadata | null;
  donorCoverPreviewUrl: string | null;
  loadingDonorMetadata: boolean;
  dragOverDonor: boolean;
  onDonorDrop: (e: DragEvent) => void;
  onDonorDragOver: (e: DragEvent) => void;
  onDonorDragLeave: (e: DragEvent) => void;
  onDonorFileChange: (file: File | null) => void;
  onImportFields: (fields: Set<string>) => void;
};

type MetadataField = 'title' | 'artist' | 'album' | 'year' | 'track' | 'cover';

const FIELD_LABELS: Record<MetadataField, string> = {
  title: 'Title',
  artist: 'Artist',
  album: 'Album',
  year: 'Year',
  track: 'Track #',
  cover: 'Cover Art',
};

export function RetagSection({
  file,
  dragOver,
  loadingMetadata,
  metadata,
  coverPreviewUrl,
  onDrop,
  onDragLeave,
  onDragOver,
  onFileChange,
  onMetadataChange,
  onCoverChange,
  donorFile,
  donorMetadata,
  donorCoverPreviewUrl,
  loadingDonorMetadata,
  dragOverDonor,
  onDonorDrop,
  onDonorDragOver,
  onDonorDragLeave,
  onDonorFileChange,
  onImportFields,
}: RetagSectionProps) {
  const retagInputId = useId();
  const donorInputId = useId();
  const coverInputId = useId();
  const retagTitleId = useId();
  const retagArtistId = useId();
  const retagAlbumId = useId();
  const retagYearId = useId();
  const retagTrackId = useId();
  const retagInputRef = useRef<HTMLInputElement>(null);
  const donorInputRef = useRef<HTMLInputElement>(null);
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) =>
    onFileChange(e.target.files?.[0] ?? null);
  const handleDonorFileChange = (e: ChangeEvent<HTMLInputElement>) =>
    onDonorFileChange(e.target.files?.[0] ?? null);
  const openRetagDialog = () => retagInputRef.current?.click();
  const openDonorDialog = () => donorInputRef.current?.click();
  const handleKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    action: () => void,
  ) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      action();
    }
  };

  // Track which fields the user wants to import from donor
  const [selectedFields, setSelectedFields] = useState<Set<MetadataField>>(
    new Set(['title', 'artist', 'album', 'year', 'track', 'cover']),
  );

  const toggleField = (field: MetadataField) => {
    setSelectedFields((prev) => {
      const next = new Set(prev);
      if (next.has(field)) {
        next.delete(field);
      } else {
        next.add(field);
      }
      return next;
    });
  };

  const handleImport = () => {
    onImportFields(selectedFields);
  };

  // Helper to get donor field value for display
  const getDonorFieldValue = (field: MetadataField): string | null => {
    if (field === 'cover') return donorCoverPreviewUrl ? 'Available' : null;
    return donorMetadata?.[field] || null;
  };

  const availableFields: MetadataField[] = [
    'title',
    'artist',
    'album',
    'year',
    'track',
    'cover',
  ];
  const hasAnyDonorData =
    donorMetadata &&
    (donorMetadata.title ||
      donorMetadata.artist ||
      donorMetadata.album ||
      donorMetadata.year ||
      donorMetadata.track ||
      donorCoverPreviewUrl);

  return (
    <>
      <section className="section">
        <h2 className="section-title">
          <span className="step-number">2</span>
          Choose audio files
        </h2>
        <p className="hint">
          Pick the MP3 to retag. Optionally pull tags and cover art from another
          MP3.
        </p>
        <div className="convert-files-grid">
          <button
            className={`file-dropzone file-dropzone-small ${dragOver ? 'drag-over' : ''} ${file ? 'has-file' : ''}`}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            type="button"
            aria-label="Select MP3 to retag"
            onClick={openRetagDialog}
            onKeyDown={(event) => handleKeyDown(event, openRetagDialog)}
          >
            <input
              type="file"
              accept=".mp3,audio/mpeg"
              onChange={handleFileChange}
              className="file-input-hidden"
              id={retagInputId}
              ref={retagInputRef}
            />
            <div className="file-dropzone-label">
              <div className="file-icon">
                {file ? (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <title>File selected</title>
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
                    <title>Select MP3</title>
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
                    <span className="file-cta">MP3 file to retag</span>
                    <span className="file-hint">Click or drop your MP3</span>
                  </>
                )}
              </div>
            </div>
          </button>

          <button
            className={`file-dropzone file-dropzone-small ${dragOverDonor ? 'drag-over' : ''} ${donorFile ? 'has-file' : ''}`}
            onDrop={onDonorDrop}
            onDragOver={onDonorDragOver}
            onDragLeave={onDonorDragLeave}
            type="button"
            aria-label="Select donor MP3"
            onClick={openDonorDialog}
            onKeyDown={(event) => handleKeyDown(event, openDonorDialog)}
          >
            <input
              type="file"
              accept=".mp3,audio/mpeg"
              onChange={handleDonorFileChange}
              className="file-input-hidden"
              id={donorInputId}
              ref={donorInputRef}
            />
            <div className="file-dropzone-label">
              <div className="file-icon">
                {donorFile ? (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <title>Donor file selected</title>
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
                    <title>Select donor MP3</title>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17,8 12,3 7,8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                )}
              </div>
              <div className="file-text">
                {donorFile ? (
                  <>
                    <span className="file-name">{donorFile.name}</span>
                    <span className="file-size">
                      {formatSize(donorFile.size)}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="file-cta">MP3 donor (optional)</span>
                    <span className="file-hint">
                      Import tags & artwork from
                    </span>
                  </>
                )}
              </div>
            </div>
          </button>
        </div>

        {loadingDonorMetadata && (
          <p className="hint">Loading donor metadata...</p>
        )}

        {donorFile && !loadingDonorMetadata && hasAnyDonorData && (
          <div className="donor-import-panel">
            <div className="donor-fields-list">
              {availableFields.map((field) => {
                const value = getDonorFieldValue(field);
                const hasValue = value !== null;
                return (
                  <label
                    key={field}
                    className={`donor-field-item checkbox-label ${!hasValue ? 'donor-field-disabled' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedFields.has(field) && hasValue}
                      disabled={!hasValue}
                      onChange={() => toggleField(field)}
                    />
                    <span className="checkbox-custom">
                      <CheckIcon />
                    </span>
                    <span className="donor-field-label">
                      {FIELD_LABELS[field]}
                    </span>
                    {hasValue && field !== 'cover' && (
                      <span className="donor-field-value">{value}</span>
                    )}
                    {hasValue && field === 'cover' && donorCoverPreviewUrl && (
                      <img
                        src={donorCoverPreviewUrl}
                        alt="Donor cover"
                        className="donor-cover-preview"
                      />
                    )}
                  </label>
                );
              })}
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-small"
              onClick={handleImport}
              disabled={selectedFields.size === 0}
            >
              Import selected fields
            </button>
          </div>
        )}

        {donorFile && !loadingDonorMetadata && !hasAnyDonorData && (
          <p className="hint hint-warning">No metadata found in donor file.</p>
        )}
      </section>

      <section className="section">
        <h2 className="section-title">
          <span className="step-number">3</span>
          Edit metadata
          {loadingMetadata && (
            <span className="loading-text"> (loading...)</span>
          )}
        </h2>
        <div className="retag-metadata-layout">
          <CoverArtPicker
            previewUrl={coverPreviewUrl}
            inputId={coverInputId}
            onChange={onCoverChange}
          />
          <div className="options-grid retag-fields-grid">
            <div className="input-group">
              <label htmlFor={retagTitleId}>{FIELD_LABELS.title}</label>
              <input
                id={retagTitleId}
                type="text"
                value={metadata.title}
                onChange={(e) => onMetadataChange('title', e.target.value)}
                placeholder="Track title"
              />
            </div>
            <div className="input-group">
              <label htmlFor={retagArtistId}>{FIELD_LABELS.artist}</label>
              <input
                id={retagArtistId}
                type="text"
                value={metadata.artist}
                onChange={(e) => onMetadataChange('artist', e.target.value)}
                placeholder="Artist name"
              />
            </div>
            <div className="input-group">
              <label htmlFor={retagAlbumId}>
                {FIELD_LABELS.album}{' '}
                <span className="optional-label">(optional)</span>
              </label>
              <input
                id={retagAlbumId}
                type="text"
                value={metadata.album}
                onChange={(e) => onMetadataChange('album', e.target.value)}
                placeholder="Album name"
              />
            </div>
            <div className="input-group">
              <label htmlFor={retagYearId}>
                {FIELD_LABELS.year}{' '}
                <span className="optional-label">(optional)</span>
              </label>
              <input
                id={retagYearId}
                type="text"
                value={metadata.year ?? ''}
                onChange={(e) => onMetadataChange('year', e.target.value)}
                placeholder="e.g. 2024"
              />
            </div>
            <div className="input-group">
              <label htmlFor={retagTrackId}>
                {FIELD_LABELS.track}{' '}
                <span className="optional-label">(optional)</span>
              </label>
              <input
                id={retagTrackId}
                type="text"
                value={metadata.track ?? ''}
                onChange={(e) => onMetadataChange('track', e.target.value)}
                placeholder="e.g. 1"
              />
            </div>
          </div>
        </div>
        <p className="hint">
          Existing metadata is prefilled from the file. Edit fields and retag.
        </p>
      </section>
    </>
  );
}

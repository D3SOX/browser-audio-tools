import type { ID3Metadata } from '../api';
import { FIELD_LABELS, type MetadataField } from '../types';

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

type MetadataImportPanelProps = {
  title: string;
  availableFields: MetadataField[];
  metadata: ID3Metadata | null;
  coverPreviewUrl: string | null;
  selectedFields: Set<MetadataField>;
  onToggleField: (field: MetadataField) => void;
  onImport: () => void;
  loading: boolean;
  fileSelected: boolean;
  emptyMessage?: string;
};

export function MetadataImportPanel({
  title,
  availableFields,
  metadata,
  coverPreviewUrl,
  selectedFields,
  onToggleField,
  onImport,
  loading,
  fileSelected,
  emptyMessage = 'No metadata found.',
}: MetadataImportPanelProps) {
  // Helper to get field value for display
  const getFieldValue = (field: MetadataField): string | null => {
    if (field === 'cover') return coverPreviewUrl ? 'Available' : null;
    return metadata?.[field] || null;
  };

  const hasAnyData =
    metadata &&
    (metadata.title ||
      metadata.artist ||
      metadata.album ||
      metadata.year ||
      metadata.track ||
      metadata.genre ||
      coverPreviewUrl);

  if (loading) {
    return <p className="hint">Loading metadata...</p>;
  }

  if (!fileSelected) {
    return null;
  }

  if (!hasAnyData) {
    return <p className="hint hint-warning">{emptyMessage}</p>;
  }

  return (
    <div className="donor-import-panel">
      <p className="donor-import-header">
        <strong>{title}</strong>
      </p>
      <div className="donor-fields-list">
        {availableFields.map((field) => {
          const value = getFieldValue(field);
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
                onChange={() => onToggleField(field)}
              />
              <span className="checkbox-custom">
                <CheckIcon />
              </span>
              <span className="donor-field-label">{FIELD_LABELS[field]}</span>
              {hasValue && field !== 'cover' && (
                <span className="donor-field-value">{value}</span>
              )}
              {hasValue && field === 'cover' && coverPreviewUrl && (
                <img
                  src={coverPreviewUrl}
                  alt="Cover art"
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
        onClick={onImport}
        disabled={selectedFields.size === 0}
      >
        Import selected fields
      </button>
    </div>
  );
}

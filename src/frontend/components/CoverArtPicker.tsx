import type { ChangeEvent } from 'react';

type CoverArtPickerProps = {
  previewUrl: string | null;
  inputId: string;
  onChange: (file: File | null) => void;
};

export function CoverArtPicker({
  previewUrl,
  inputId,
  onChange,
}: CoverArtPickerProps) {
  const handleChange = (e: ChangeEvent<HTMLInputElement>) =>
    onChange(e.target.files?.[0] ?? null);

  return (
    <div className="cover-art-container">
      <label className="cover-art-label">
        Cover <span className="optional-label">(optional)</span>
      </label>
      <div className="cover-art-preview">
        {previewUrl ? (
          <img src={previewUrl} alt="Cover art" className="cover-art-image" />
        ) : (
          <div className="cover-art-empty">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
            <span>No cover</span>
          </div>
        )}
        <input
          type="file"
          accept=".jpg,.jpeg,.png,image/jpeg,image/png"
          onChange={handleChange}
          className="file-input-hidden"
          id={inputId}
        />
        <label
          htmlFor={inputId}
          className="cover-art-edit-btn"
          title="Change cover art"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </label>
      </div>
    </div>
  );
}

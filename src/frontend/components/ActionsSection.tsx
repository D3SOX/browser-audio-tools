import type { GenericConvertOptions } from "../api";
import type { Operation } from "../types";

type ActionsSectionProps = {
  processing: boolean;
  loadingMetadata: boolean;
  loadingRetagMetadata: boolean;
  progress: number | null;
  status: string | null;
  error: string | null;
  downloadUrl: string | null;
  downloadName: string | null;
  previewUrl: string | null;
  operation: Operation;
  genericConvertOptions: GenericConvertOptions;
  onSubmit: () => void;
  onReset: () => void;
};

export function ActionsSection({
  processing,
  loadingMetadata,
  loadingRetagMetadata,
  progress,
  status,
  error,
  downloadUrl,
  downloadName,
  previewUrl,
  operation,
  genericConvertOptions,
  onSubmit,
  onReset,
}: ActionsSectionProps) {
  const submitLabel =
    operation === "noise"
      ? "Add noise + concat"
      : operation === "cover"
        ? "Extract cover"
        : operation === "convert"
          ? "Convert to MP3"
          : operation === "retag"
            ? "Retag MP3"
            : `Convert to ${genericConvertOptions.format.toUpperCase()}`;

  return (
    <section className="section">
      <h2 className="section-title">
        <span className="step-number">4</span>
        Run
      </h2>
      <div className="actions">
        <button className="btn btn-primary" onClick={onSubmit} disabled={processing || loadingMetadata || loadingRetagMetadata}>
          {processing ? (
            <>
              <span className="spinner" />
              Working...
            </>
          ) : (
            submitLabel
          )}
        </button>
        <button className="btn btn-secondary" onClick={onReset} disabled={processing}>
          Reset
        </button>
        {processing && progress !== null && (
          <div className="progress-inline">
            <div className="progress-bar" role="progressbar" aria-valuenow={progress ?? 0} aria-valuemin={0} aria-valuemax={100}>
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <span className="progress-text">{progress}%</span>
          </div>
        )}
      </div>

      {status && <div className="status-message success">{status}</div>}
      {error && <div className="status-message error">{error}</div>}

      {downloadUrl && downloadName && (
        <div className="result-card">
          <div className="result-header">
            <span className="result-label">Result ready</span>
            <a href={downloadUrl} download={downloadName} className="download-link">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7,10 12,15 17,10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              {downloadName}
            </a>
          </div>
          {previewUrl && (
            <div className="result-preview">
              {operation === "cover" ? <img src={previewUrl} alt="Cover preview" /> : <audio controls src={previewUrl} />}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

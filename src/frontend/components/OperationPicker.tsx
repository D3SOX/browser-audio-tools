import type { Operation } from '../types';

type OperationPickerProps = {
  operation: Operation;
  onChange: (operation: Operation) => void;
};

export function OperationPicker({ operation, onChange }: OperationPickerProps) {
  return (
    <section className="section">
      <h2 className="section-title">
        <span className="step-number">1</span>
        Pick an operation
      </h2>
      <div className="radio-group">
        <label
          className={`radio-card ${operation === 'noise' ? 'selected' : ''}`}
        >
          <input
            type="radio"
            name="operation"
            value="noise"
            checked={operation === 'noise'}
            onChange={() => onChange('noise')}
          />
          <div className="radio-card-icon">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <title>Noise waveform</title>
              <path d="M2 10s3-3 5-3 5 5 5 5 3-3 5-3 5 3 5 3" />
              <path d="M2 14s3 3 5 3 5-5 5-5 3 3 5 3 5-3 5-3" />
            </svg>
          </div>
          <span className="radio-card-label">Noise + Track</span>
        </label>
        <label
          className={`radio-card ${operation === 'cover' ? 'selected' : ''}`}
        >
          <input
            type="radio"
            name="operation"
            value="cover"
            checked={operation === 'cover'}
            onChange={() => onChange('cover')}
          />
          <div className="radio-card-icon">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <title>Cover art frame</title>
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
          </div>
          <span className="radio-card-label">Extract Cover</span>
        </label>
        <label
          className={`radio-card ${operation === 'retag-wav' ? 'selected' : ''}`}
        >
          <input
            type="radio"
            name="operation"
            value="retag-wav"
            checked={operation === 'retag-wav'}
            onChange={() => onChange('retag-wav')}
          />
          <div className="radio-card-icon">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <title>WAV to MP3</title>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14,2 14,8 20,8" />
              <path d="M9 15l2 2 4-4" />
            </svg>
          </div>
          <span className="radio-card-label">Retag WAV into MP3</span>
        </label>
        <label
          className={`radio-card ${operation === 'convert' ? 'selected' : ''}`}
        >
          <input
            type="radio"
            name="operation"
            value="convert"
            checked={operation === 'convert'}
            onChange={() => onChange('convert')}
          />
          <div className="radio-card-icon">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <title>Convert audio</title>
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
            </svg>
          </div>
          <span className="radio-card-label">Convert Audio</span>
        </label>
        <label
          className={`radio-card ${operation === 'retag' ? 'selected' : ''}`}
        >
          <input
            type="radio"
            name="operation"
            value="retag"
            checked={operation === 'retag'}
            onChange={() => onChange('retag')}
          />
          <div className="radio-card-icon">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <title>Retag MP3</title>
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
              <line x1="7" y1="7" x2="7.01" y2="7" />
            </svg>
          </div>
          <span className="radio-card-label">Retag MP3</span>
        </label>
        <label
          className={`radio-card ${operation === 'trim' ? 'selected' : ''}`}
        >
          <input
            type="radio"
            name="operation"
            value="trim"
            checked={operation === 'trim'}
            onChange={() => onChange('trim')}
          />
          <div className="radio-card-icon">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <title>Trim audio</title>
              <path d="M6 4v16" />
              <path d="M18 4v16" />
              <path d="M6 12h12" />
              <path d="M3 8l3-4 3 4" />
              <path d="M15 8l3-4 3 4" />
            </svg>
          </div>
          <span className="radio-card-label">Trim Audio</span>
        </label>
        <label
          className={`radio-card ${operation === 'visualize' ? 'selected' : ''}`}
        >
          <input
            type="radio"
            name="operation"
            value="visualize"
            checked={operation === 'visualize'}
            onChange={() => onChange('visualize')}
          />
          <div className="radio-card-icon">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <title>Visualizer</title>
              <path d="M2 10s3-3 5-3 5 5 5 5 3-3 5-3 5 3 5 3" />
              <path d="M2 14s3 3 5 3 5-5 5-5 3 3 5 3 5-3 5-3" />
              <rect x="1" y="5" width="22" height="14" rx="2" />
            </svg>
          </div>
          <span className="radio-card-label">Visualizer</span>
        </label>
      </div>
    </section>
  );
}

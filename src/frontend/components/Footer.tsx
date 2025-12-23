import { usePWAStatus } from '../hooks/usePWAStatus';
import type { AdblockDetectionResult } from '../utils/detectAdblock';

type Props = {
  analyticsEnabled: boolean;
  adblockStatus: AdblockDetectionResult;
  onToggleAnalytics: () => void;
};

export function Footer({
  analyticsEnabled,
  adblockStatus,
  onToggleAnalytics,
}: Props) {
  const showAdblockWarning = analyticsEnabled && adblockStatus === 'blocked';
  const { isOffline, canWorkOffline, isInstalled } = usePWAStatus();

  return (
    <footer className="card-footer">
      <p className="footer-hint">
        Runs entirely in your browser via ffmpeg.wasm. Files never leave your
        device.
        {canWorkOffline && (
          <span
            className="pwa-status-badge"
            title={
              isInstalled
                ? 'App is installed and works offline'
                : 'App is cached and works offline'
            }
          >
            {isOffline ? ' (offline)' : ' (offline ready)'}
          </span>
        )}
      </p>
      <p className="footer-hint footer-hint--spaced">
        Need broader file conversions? Try{' '}
        <a href="https://vert.sh/" target="_blank" rel="noreferrer">
          VERT
        </a>{' '}
        (open source) — this site focuses on niche audio workflows.
      </p>
      <p className="footer-hint footer-hint--spaced">
        Need more browser-based tools? Try{' '}
        <a href="https://browserytools.com/" target="_blank" rel="noreferrer">
          BrowseryTools
        </a>{' '}
        (open source) — a collection of browser-based tools for various
        purposes.
      </p>
      <div className="footer-analytics-toggle">
        <span className="analytics-toggle-label">Anonymous analytics:</span>
        <button
          type="button"
          className={`analytics-toggle-btn ${analyticsEnabled ? 'active' : ''}`}
          onClick={onToggleAnalytics}
        >
          {analyticsEnabled ? 'On' : 'Off'}
        </button>
        {showAdblockWarning && (
          <span
            className="tooltip-icon tooltip-icon-active tooltip-icon-warning"
            data-tooltip="Adblocker detected — analytics likely won't load."
            aria-label="Adblocker detected — analytics likely won't load."
            role="tooltip"
          >
            !
          </span>
        )}
      </div>
    </footer>
  );
}

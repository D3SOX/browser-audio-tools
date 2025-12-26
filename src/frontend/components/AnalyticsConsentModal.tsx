import { useState } from 'react';
import type { AdblockDetectionResult } from '../utils/detectAdblock';

type Props = {
  onAccept: () => void;
  onDecline: () => void;
  adblockStatus: AdblockDetectionResult;
};

export function AnalyticsConsentModal({
  onAccept,
  onDecline,
  adblockStatus,
}: Props) {
  const isLikelyBlocked =
    adblockStatus === 'blocked' || adblockStatus === 'unknown';
  const isAcceptDisabled = isLikelyBlocked;
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="consent-modal-backdrop">
      <div className="consent-modal">
        <h2 className="consent-modal-title">Help improve this tool?</h2>
        <p className="consent-modal-text">
          We'd like to collect anonymous usage data to understand what works and
          fix performance issues.{' '}
          <strong>No cookies, no tracking, no personal data.</strong>
        </p>
        <button
          type="button"
          className="consent-modal-details-toggle"
          onClick={() => setShowDetails(!showDetails)}
        >
          <span className="consent-modal-details-toggle-text">
            {showDetails ? 'Hide' : 'Show'} details
          </span>
          <span
            className={`consent-modal-details-toggle-icon ${showDetails ? 'expanded' : ''}`}
            aria-hidden="true"
          >
            ▼
          </span>
        </button>
        {showDetails && (
          <div className="consent-modal-details">
            <p className="consent-modal-text-small">
              <strong>What we collect:</strong> Page views, Web
              Vitals, device/browser info, and coarse location (country/region
              only).
            </p>
            <p className="consent-modal-text-small">
              <strong>What we don't:</strong> Audio files, filenames, IP
              addresses, or any personal identifiers. Sessions reset after 24
              hours.
            </p>
            <p className="consent-modal-footnote">
              <a
                className="consent-modal-link"
                href="https://vercel.com/docs/analytics/privacy-policy"
                target="_blank"
                rel="noreferrer"
              >
                Privacy details
              </a>
            </p>
          </div>
        )}
        {isLikelyBlocked && (
          <div className="consent-modal-warning">
            <p className="consent-modal-warning-text">
              <strong>Adblocker detected:</strong> Disable it for this site to
              allow analytics.
            </p>
          </div>
        )}
        <div className="consent-modal-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onDecline}
          >
            No thanks
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onAccept}
            disabled={isAcceptDisabled}
            title={
              isAcceptDisabled
                ? 'Disable your adblocker for this site to allow analytics.'
                : undefined
            }
          >
            Allow
          </button>
        </div>
      </div>
    </div>
  );
}

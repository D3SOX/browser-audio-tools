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

  return (
    <div className="consent-modal-backdrop">
      <div className="consent-modal">
        <h2 className="consent-modal-title">
          Help improve this tool and allow privacy-friendly analytics?
        </h2>
        <p className="consent-modal-text">
          We use <strong>Vercel Web Analytics</strong> and{' '}
          <strong>Speed Insights</strong> (<strong>no cookies</strong>,{' '}
          <strong>GDPR-aligned</strong>) to see what works and fix slow spots.
        </p>
        <p className="consent-modal-text">
          These tools don’t require extra consent, but we prefer to be{' '}
          <strong>transparent</strong> and let you{' '}
          <strong>choose to opt in</strong>.
        </p>
        <p className="consent-modal-text">
          Here’s exactly what gets sent (and what never does):
        </p>
        <ul className="consent-modal-list">
          <li>
            Aggregated page views, button clicks, and Web Vitals (route/URL
            only).
          </li>
          <li>
            Device/browser, network speed, and coarse country/region for
            debugging.
          </li>
          <li>No audio files, filenames, or personal identifiers are sent.</li>
          <li>
            IPs are not stored; visits use a short-lived hashed ID that resets
            after 24 hours. Sessions are not reconstructed across sites.
          </li>
        </ul>
        <p className="consent-modal-footnote">
          Read the{' '}
          <a
            className="consent-modal-link"
            href="https://vercel.com/docs/analytics/privacy-policy"
            target="_blank"
            rel="noreferrer"
          >
            Web Analytics privacy details
          </a>{' '}
          and{' '}
          <a
            className="consent-modal-link"
            href="https://vercel.com/docs/speed-insights/privacy-policy"
            target="_blank"
            rel="noreferrer"
          >
            Speed Insights privacy details
          </a>
          .
        </p>
        {isLikelyBlocked && (
          <div className="consent-modal-warning">
            <p className="consent-modal-warning-title">
              Heads-up for AdBlock/uBlock Origin users
            </p>
            <p className="consent-modal-warning-text">
              Adblockers (including uBlock Origin) block these analytics calls by
              default. If you choose to allow analytics, you’ll also need to
              disable your adblocker (or add an allowlist rule) for this site so
              events can be sent.
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
          >
            Allow analytics
          </button>
        </div>
      </div>
    </div>
  );
}

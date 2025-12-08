type Props = {
  onAccept: () => void;
  onDecline: () => void;
};

export function AnalyticsConsentModal({ onAccept, onDecline }: Props) {
  return (
    <div className="consent-modal-backdrop">
      <div className="consent-modal">
        <h2 className="consent-modal-title">Help improve this tool?</h2>
        <p className="consent-modal-text">
          We use anonymous analytics to understand how the app is used and improve it.
          No personal data or audio files are ever collected.
        </p>
        <div className="consent-modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onDecline}>
            No thanks
          </button>
          <button type="button" className="btn btn-secondary" onClick={onAccept}>
            Allow analytics
          </button>
        </div>
      </div>
    </div>
  );
}

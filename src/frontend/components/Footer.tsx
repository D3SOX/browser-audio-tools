export function Footer() {
  return (
    <footer className="card-footer">
      <p className="footer-hint">Runs entirely in your browser via ffmpeg.wasm. Files never leave your device.</p>
      <p className="footer-hint">
        Need broader file conversions? Try{" "}
        <a href="https://vert.sh/" target="_blank" rel="noreferrer">
          VERT
        </a>{" "}
        (open source) — this site focuses on niche audio workflows.
      </p>
    </footer>
  );
}

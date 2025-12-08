type OutputFilenameSectionProps = {
  outputFilename: string;
  onFilenameChange: (value: string) => void;
  useAutoFilename: boolean;
  onAutoFilenameChange: (checked: boolean) => void;
  placeholder: string;
};

export function OutputFilenameSection({
  outputFilename,
  onFilenameChange,
  useAutoFilename,
  onAutoFilenameChange,
  placeholder,
}: OutputFilenameSectionProps) {
  // Strip .mp3 from placeholder since we show it as a suffix
  const basePlaceholder = placeholder.replace(/\.mp3$/i, "");

  return (
    <section className="section">
      <h2 className="section-title">
        <span className="step-number">4</span>
        Output filename
      </h2>
      <div className="options-grid">
        <div className="input-group">
          <label htmlFor="outputFilename">Filename</label>
          <div className="input-with-suffix">
            <input
              id="outputFilename"
              type="text"
              value={outputFilename}
              onChange={(e) => onFilenameChange(e.target.value)}
              disabled={useAutoFilename}
              placeholder={basePlaceholder}
            />
            <span className="input-suffix">.mp3</span>
          </div>
        </div>
      </div>
      <label className="checkbox-label output-filename-checkbox">
        <input
          type="checkbox"
          checked={useAutoFilename}
          onChange={(e) => onAutoFilenameChange(e.target.checked)}
        />
        <span>
          Use <strong>Artist - Title</strong> format
        </span>
      </label>
    </section>
  );
}

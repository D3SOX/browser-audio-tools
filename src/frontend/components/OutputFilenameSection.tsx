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
  return (
    <section className="section">
      <h2 className="section-title">
        <span className="step-number">4</span>
        Output filename
      </h2>
      <div className="options-grid">
        <div className="input-group">
          <label htmlFor="outputFilename">Filename</label>
          <input
            id="outputFilename"
            type="text"
            value={outputFilename}
            onChange={(e) => onFilenameChange(e.target.value)}
            disabled={useAutoFilename}
            placeholder={placeholder}
          />
        </div>
      </div>
      <label className="checkbox-label output-filename-checkbox">
        <input
          type="checkbox"
          checked={useAutoFilename}
          onChange={(e) => onAutoFilenameChange(e.target.checked)}
        />
        <span>Use "Artist - Title.mp3" format</span>
      </label>
    </section>
  );
}

import { useId } from 'react';
import type { NoiseType, ProcessOptions } from '../api';

type NoiseOptionsProps = {
  options: ProcessOptions;
  onChange: <K extends keyof ProcessOptions>(
    key: K,
    value: ProcessOptions[K],
  ) => void;
};

export function NoiseOptions({ options, onChange }: NoiseOptionsProps) {
  const idBase = useId();
  const durationId = `${idBase}-durationSeconds`;
  const volumeId = `${idBase}-noiseVolume`;
  const typeId = `${idBase}-noiseType`;
  const bitrateId = `${idBase}-bitrate`;

  return (
    <section className="section">
      <h2 className="section-title">
        <span className="step-number">3</span>
        Noise options
      </h2>
      <div className="options-grid">
        <div className="input-group">
          <label htmlFor={durationId}>Noise duration (seconds)</label>
          <input
            id={durationId}
            type="number"
            min={1}
            value={options.durationSeconds}
            onChange={(e) =>
              onChange('durationSeconds', Number(e.target.value) || 0)
            }
          />
        </div>
        <div className="input-group">
          <label htmlFor={volumeId}>Noise volume (0 - 1.0)</label>
          <input
            id={volumeId}
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={options.noiseVolume}
            onChange={(e) =>
              onChange('noiseVolume', Number(e.target.value) || 0)
            }
          />
        </div>
        <div className="input-group">
          <label htmlFor={typeId}>Noise type</label>
          <select
            id={typeId}
            value={options.noiseType}
            onChange={(e) => onChange('noiseType', e.target.value as NoiseType)}
          >
            <option value="pink">Pink (filtered)</option>
            <option value="white">White</option>
          </select>
        </div>
        <div className="input-group">
          <label htmlFor={bitrateId}>Output bitrate</label>
          <input
            id={bitrateId}
            type="text"
            value={options.bitrate}
            onChange={(e) => onChange('bitrate', e.target.value)}
          />
        </div>
      </div>
    </section>
  );
}

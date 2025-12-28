import { useId } from 'react';
import type { NoiseType, ProcessOptions } from '../api';
import { BITRATE_OPTIONS } from '../types';
import { Switch } from './Switch';

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
          <select
            id={bitrateId}
            value={options.bitrate}
            onChange={(e) => onChange('bitrate', e.target.value)}
          >
            {BITRATE_OPTIONS.map((bitrate) => (
              <option key={bitrate} value={bitrate}>
                {bitrate.replace('k', '')} kbps
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <Switch
            checked={!(options.prependNoise ?? false)}
            onChange={(e) => onChange('prependNoise', !e.target.checked)}
            leftIcon={
              <svg
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M7.5 3L4.5 6L7.5 9" />
              </svg>
            }
            rightIcon={
              <svg
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4.5 3L7.5 6L4.5 9" />
              </svg>
            }
          >
            {options.prependNoise ? 'Prepend' : 'Append'} (click to toggle)
          </Switch>
        </div>
      </div>
    </section>
  );
}

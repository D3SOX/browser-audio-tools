import type { ChangeEvent, DragEvent, KeyboardEvent } from 'react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import WaveSurfer from 'wavesurfer.js';
import { formatSize } from '../utils/formatSize';
import { Checkbox } from './Checkbox';

export type VisualizerExportResult = {
  blob: Blob;
  filename: string;
};

export type VisualizerHandle = {
  exportToPng: () => Promise<VisualizerExportResult>;
};

type VisualizerSectionProps = {
  file: File | null;
  dragOver: boolean;
  onDrop: (e: DragEvent) => void;
  onDragOver: (e: DragEvent) => void;
  onDragLeave: (e: DragEvent) => void;
  onFileChange: (file: File | null) => void;
};

export const VisualizerSection = forwardRef<
  VisualizerHandle,
  VisualizerSectionProps
>(function VisualizerSection(
  { file, dragOver, onDrop, onDragOver, onDragLeave, onFileChange },
  ref,
) {
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const fileUrlRef = useRef<string | null>(null);
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const waveColorId = useId();
  const backgroundColorId = useId();
  const backgroundOpacityId = useId();
  const barWidthId = useId();
  const barGapId = useId();
  const barHeightId = useId();
  const [isLoading, setIsLoading] = useState(false);

  // Color options
  const [waveColor, setWaveColor] = useState('#818cf8');
  const [backgroundColor, setBackgroundColor] = useState('#000000');
  const [backgroundOpacity, setBackgroundOpacity] = useState(0); // 0 = fully transparent, 100 = fully opaque

  // Predefined color palettes
  const waveColorPresets = [
    '#818cf8',
    '#f43f5e',
    '#22c55e',
    '#f59e0b',
    '#06b6d4',
    '#ec4899',
    '#ffffff',
    '#000000',
  ];
  const bgColorPresets = [
    '#000000',
    '#1e1b4b',
    '#0f172a',
    '#18181b',
    '#1c1917',
    '#0c4a6e',
    '#4c1d95',
    '#ffffff',
  ];

  // Waveform style options
  const [barWidth, setBarWidth] = useState(2);
  const [barGap, setBarGap] = useState(1);
  const [barHeight, setBarHeight] = useState(1); // Amplitude multiplier
  const [normalize, setNormalize] = useState(true);

  // Refs to capture initial values for WaveSurfer creation
  const waveColorRef = useRef(waveColor);
  const normalizeRef = useRef(normalize);
  const barWidthRef = useRef(barWidth);
  const barGapRef = useRef(barGap);
  const barHeightRef = useRef(barHeight);

  // Keep refs in sync with state
  useEffect(() => {
    waveColorRef.current = waveColor;
  }, [waveColor]);
  useEffect(() => {
    normalizeRef.current = normalize;
  }, [normalize]);
  useEffect(() => {
    barWidthRef.current = barWidth;
  }, [barWidth]);
  useEffect(() => {
    barGapRef.current = barGap;
  }, [barGap]);
  useEffect(() => {
    barHeightRef.current = barHeight;
  }, [barHeight]);

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    onFileChange(e.target.files?.[0] ?? null);
  };
  const openFileDialog = () => fileInputRef.current?.click();
  const handleKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    action: () => void,
  ) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      action();
    }
  };

  // Initialize WaveSurfer when file changes
  useEffect(() => {
    if (!file || !waveformRef.current) {
      if (wavesurferRef.current) {
        wavesurferRef.current.destroy();
        wavesurferRef.current = null;
      }
      if (fileUrlRef.current) {
        URL.revokeObjectURL(fileUrlRef.current);
        fileUrlRef.current = null;
      }
      return;
    }

    setIsLoading(true);

    // Clear the container first
    if (waveformRef.current) {
      waveformRef.current.innerHTML = '';
    }

    // Create WaveSurfer instance
    const ws = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: waveColorRef.current,
      progressColor: waveColorRef.current,
      cursorWidth: 0,
      height: 200,
      normalize: normalizeRef.current,
      barWidth: barWidthRef.current,
      barGap: barGapRef.current,
      barRadius: Math.min(barWidthRef.current, 4),
      barHeight: barHeightRef.current,
      interact: false,
    });

    wavesurferRef.current = ws;

    const url = URL.createObjectURL(file);
    fileUrlRef.current = url;
    ws.load(url);

    ws.on('ready', () => {
      setIsLoading(false);
    });

    return () => {
      if (fileUrlRef.current) {
        URL.revokeObjectURL(fileUrlRef.current);
        fileUrlRef.current = null;
      }
      ws.destroy();
      wavesurferRef.current = null;
    };
  }, [file]);

  // Update WaveSurfer options when style settings change
  useEffect(() => {
    if (!wavesurferRef.current) return;

    wavesurferRef.current.setOptions({
      waveColor,
      progressColor: waveColor,
      normalize,
      barWidth,
      barGap,
      barRadius: Math.min(barWidth, 4),
      barHeight,
    });
  }, [waveColor, normalize, barWidth, barGap, barHeight]);

  const exportToPng = useCallback(async (): Promise<VisualizerExportResult> => {
    if (!wavesurferRef.current) {
      throw new Error('Waveform not ready');
    }

    // Use WaveSurfer's built-in exportImage method
    const dataUrls = await wavesurferRef.current.exportImage(
      'image/png',
      1,
      'dataURL',
    );
    const [firstUrl] = dataUrls ?? [];
    if (!firstUrl) {
      throw new Error('Failed to export waveform image');
    }

    // Convert data URL to blob
    const response = await fetch(firstUrl);
    const waveformBlob = await response.blob();
    const waveformImg = await createImageBitmap(waveformBlob);

    // Create canvas
    const canvas = document.createElement('canvas');
    canvas.width = waveformImg.width;
    canvas.height = waveformImg.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not get canvas context');
    }

    // Draw background with opacity
    if (backgroundOpacity > 0) {
      ctx.globalAlpha = backgroundOpacity / 100;
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1;
    }

    // Draw waveform on top
    ctx.drawImage(waveformImg, 0, 0);

    // Convert to blob
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Failed to create PNG blob'));
          return;
        }
        const filename = file
          ? `${file.name.replace(/\.[^/.]+$/, '')}-waveform.png`
          : 'waveform.png';
        resolve({ blob, filename });
      }, 'image/png');
    });
  }, [file, backgroundColor, backgroundOpacity]);

  // Expose export function to parent via ref
  useImperativeHandle(
    ref,
    () => ({
      exportToPng,
    }),
    [exportToPng],
  );

  return (
    <>
      <section className="section">
        <h2 className="section-title">
          <span className="step-number">2</span>
          Choose audio file
        </h2>
        <button
          className={`file-dropzone ${dragOver ? 'drag-over' : ''} ${file ? 'has-file' : ''}`}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          type="button"
          aria-label="Select audio file"
          onClick={openFileDialog}
          onKeyDown={(event) => handleKeyDown(event, openFileDialog)}
        >
          <input
            type="file"
            accept="audio/*,.wav,.flac,.aiff,.aif,.mp3,.ogg,.m4a"
            onChange={handleFileInputChange}
            className="file-input-hidden"
            id={fileInputId}
            ref={fileInputRef}
          />
          <div className="file-dropzone-label">
            <div className="file-icon">
              {file ? (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <title>File selected</title>
                  <path d="M9 12l2 2 4-4" />
                  <circle cx="12" cy="12" r="10" />
                </svg>
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <title>Select audio</title>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17,8 12,3 7,8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              )}
            </div>
            <div className="file-text">
              {file ? (
                <>
                  <span className="file-name">{file.name}</span>
                  <span className="file-size">{formatSize(file.size)}</span>
                </>
              ) : (
                <>
                  <span className="file-cta">
                    Click to browse or drag & drop
                  </span>
                  <span className="file-hint">
                    Supports WAV, FLAC, AIFF, MP3, OGG, AAC (m4a), and more.
                  </span>
                </>
              )}
            </div>
          </div>
        </button>
      </section>

      {file && (
        <section className="section">
          <h2 className="section-title">
            <span className="step-number">3</span>
            Customize waveform
          </h2>

          <div className="visualizer-options">
            <div className="color-picker-row">
              <div className="color-picker-group">
                <label htmlFor={waveColorId}>Wave color</label>
                <div className="color-input-wrapper">
                  <input
                    type="color"
                    id={waveColorId}
                    value={waveColor}
                    onChange={(e) => setWaveColor(e.target.value)}
                    className="color-input"
                  />
                  <input
                    type="text"
                    value={waveColor}
                    onChange={(e) => setWaveColor(e.target.value)}
                    className="color-text-input"
                    placeholder="#818cf8"
                  />
                </div>
                <div className="color-presets">
                  {waveColorPresets.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={`color-preset-btn ${waveColor === color ? 'active' : ''}`}
                      style={{ backgroundColor: color }}
                      onClick={() => setWaveColor(color)}
                      title={color}
                    />
                  ))}
                </div>
              </div>
              <div className="color-picker-group">
                <label htmlFor={backgroundColorId}>Background color</label>
                <div className="color-input-wrapper">
                  <input
                    type="color"
                    id={backgroundColorId}
                    value={backgroundColor}
                    onChange={(e) => setBackgroundColor(e.target.value)}
                    className="color-input"
                  />
                  <input
                    type="text"
                    value={backgroundColor}
                    onChange={(e) => setBackgroundColor(e.target.value)}
                    className="color-text-input"
                    placeholder="#1e1b4b"
                  />
                </div>
                <div className="color-presets">
                  {bgColorPresets.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={`color-preset-btn ${backgroundColor === color ? 'active' : ''}`}
                      style={{ backgroundColor: color }}
                      onClick={() => setBackgroundColor(color)}
                      title={color}
                    />
                  ))}
                </div>
              </div>
              <div className="slider-group opacity-slider">
                <label htmlFor={backgroundOpacityId}>
                  <span>Background opacity</span>
                  <span className="slider-value">{backgroundOpacity}%</span>
                </label>
                <input
                  type="range"
                  id={backgroundOpacityId}
                  min="0"
                  max="100"
                  step="5"
                  value={backgroundOpacity}
                  onChange={(e) => setBackgroundOpacity(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="visualizer-sliders">
              <div className="slider-group">
                <label htmlFor={barWidthId}>Bar width: {barWidth}px</label>
                <input
                  type="range"
                  id={barWidthId}
                  min="1"
                  max="10"
                  step="1"
                  value={barWidth}
                  onChange={(e) => setBarWidth(Number(e.target.value))}
                />
              </div>
              <div className="slider-group">
                <label htmlFor={barGapId}>Bar gap: {barGap}px</label>
                <input
                  type="range"
                  id={barGapId}
                  min="0"
                  max="5"
                  step="1"
                  value={barGap}
                  onChange={(e) => setBarGap(Number(e.target.value))}
                />
              </div>
              <div className="slider-group">
                <label htmlFor={barHeightId}>
                  Amplitude: {barHeight.toFixed(1)}x
                </label>
                <input
                  type="range"
                  id={barHeightId}
                  min="0.5"
                  max="3"
                  step="0.1"
                  value={barHeight}
                  onChange={(e) => setBarHeight(Number(e.target.value))}
                />
              </div>
              <Checkbox
                checked={normalize}
                onChange={(e) => setNormalize(e.target.checked)}
                className="visualizer-checkbox"
              >
                <span>Normalize</span>
              </Checkbox>
            </div>
          </div>

          <div
            className="visualizer-preview-container"
            style={{
              backgroundColor:
                backgroundOpacity === 0
                  ? 'var(--dropzone-bg)'
                  : `color-mix(in srgb, ${backgroundColor} ${backgroundOpacity}%, transparent)`,
            }}
          >
            {isLoading && (
              <div className="waveform-loading">
                <span className="spinner" /> Loading waveform...
              </div>
            )}
            <div ref={waveformRef} className="waveform visualizer-waveform" />
          </div>
        </section>
      )}
    </>
  );
});

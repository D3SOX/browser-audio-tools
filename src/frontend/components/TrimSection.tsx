import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import type { OutputFormat } from "../api";
import { formatSize } from "../utils/formatSize";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.esm.js";

export interface TrimOptions {
  startTime: number;
  endTime: number;
  format: OutputFormat;
  bitrate: string;
  removeSilence: boolean;
  silenceThreshold: number; // dB
  silenceDuration: number; // seconds
}

type TrimSectionProps = {
  file: File | null;
  dragOver: boolean;
  options: TrimOptions;
  isLosslessFormat: boolean;
  onDrop: (e: DragEvent) => void;
  onDragOver: (e: DragEvent) => void;
  onDragLeave: (e: DragEvent) => void;
  onFileChange: (file: File | null) => void;
  onOptionsChange: (options: TrimOptions) => void;
};

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${mins}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
}

function createRegionContent(): HTMLElement {
  const div = document.createElement("div");
  div.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    border: 3px solid #f43f5e;
    border-radius: 4px;
    pointer-events: none;
    box-sizing: border-box;
  `;
  
  // Left handle indicator
  const leftHandle = document.createElement("div");
  leftHandle.style.cssText = `
    position: absolute;
    left: -2px;
    top: 0;
    bottom: 0;
    width: 6px;
    background: linear-gradient(to right, #f43f5e 60%, transparent);
    pointer-events: none;
  `;
  
  // Right handle indicator
  const rightHandle = document.createElement("div");
  rightHandle.style.cssText = `
    position: absolute;
    right: -2px;
    top: 0;
    bottom: 0;
    width: 6px;
    background: linear-gradient(to left, #f43f5e 60%, transparent);
    pointer-events: none;
  `;
  
  div.appendChild(leftHandle);
  div.appendChild(rightHandle);
  return div;
}

function parseTime(str: string): number | null {
  // Parse formats like "1:23.45" or "83.45" or "83"
  const colonMatch = str.match(/^(\d+):(\d{1,2})(?:\.(\d{1,2}))?$/);
  if (colonMatch) {
    const mins = parseInt(colonMatch[1]!, 10);
    const secs = parseInt(colonMatch[2]!, 10);
    const ms = colonMatch[3] ? parseInt(colonMatch[3].padEnd(2, "0"), 10) : 0;
    return mins * 60 + secs + ms / 100;
  }
  const numMatch = str.match(/^(\d+(?:\.\d*)?)$/);
  if (numMatch) {
    return parseFloat(numMatch[1]!);
  }
  return null;
}

export function TrimSection({
  file,
  dragOver,
  options,
  isLosslessFormat,
  onDrop,
  onDragOver,
  onDragLeave,
  onFileChange,
  onOptionsChange,
}: TrimSectionProps) {
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<RegionsPlugin | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [startTimeInput, setStartTimeInput] = useState("0:00.00");
  const [endTimeInput, setEndTimeInput] = useState("0:00.00");

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    onFileChange(e.target.files?.[0] ?? null);
  };

  const updateOption = useCallback(
    <K extends keyof TrimOptions>(key: K, value: TrimOptions[K]) => {
      onOptionsChange({ ...options, [key]: value });
    },
    [options, onOptionsChange]
  );

  // Initialize WaveSurfer when file changes
  useEffect(() => {
    if (!file || !waveformRef.current) {
      // Cleanup if no file
      if (wavesurferRef.current) {
        wavesurferRef.current.destroy();
        wavesurferRef.current = null;
        regionsRef.current = null;
      }
      return;
    }

    setIsLoading(true);

    // Create regions plugin
    const regions = RegionsPlugin.create();
    regionsRef.current = regions;

    // Create WaveSurfer instance with visible colors
    const ws = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: "#818cf8",
      progressColor: "#4f46e5",
      cursorColor: "#f43f5e",
      cursorWidth: 2,
      height: 128,
      normalize: true,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      plugins: [regions],
    });

    wavesurferRef.current = ws;

    // Load the file
    const url = URL.createObjectURL(file);
    ws.load(url);

    ws.on("ready", () => {
      setIsLoading(false);
      const dur = ws.getDuration();
      setDuration(dur);

      // Create initial region spanning the whole file with visible styling
      const region = regions.addRegion({
        start: 0,
        end: dur,
        color: "rgba(244, 63, 94, 0.25)",
        drag: true,
        resize: true,
        content: createRegionContent(),
      });

      // Update options with full duration
      onOptionsChange({
        ...options,
        startTime: 0,
        endTime: dur,
      });
      setStartTimeInput(formatTime(0));
      setEndTimeInput(formatTime(dur));

      // Listen to region updates
      region.on("update-end", () => {
        onOptionsChange({
          ...options,
          startTime: region.start,
          endTime: region.end,
        });
        setStartTimeInput(formatTime(region.start));
        setEndTimeInput(formatTime(region.end));
      });
    });

    ws.on("timeupdate", (time) => {
      setCurrentTime(time);
    });

    ws.on("play", () => setIsPlaying(true));
    ws.on("pause", () => setIsPlaying(false));
    ws.on("finish", () => setIsPlaying(false));

    return () => {
      URL.revokeObjectURL(url);
      ws.destroy();
      wavesurferRef.current = null;
      regionsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  // Update region when time inputs change programmatically
  const updateRegion = useCallback(
    (start: number, end: number) => {
      if (!regionsRef.current) return;
      const regions = regionsRef.current.getRegions();
      if (regions.length > 0) {
        regions[0]!.setOptions({ start, end });
      }
    },
    []
  );

  const handleStartTimeChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setStartTimeInput(value);
    const parsed = parseTime(value);
    if (parsed !== null && parsed >= 0 && parsed < options.endTime) {
      updateOption("startTime", parsed);
      updateRegion(parsed, options.endTime);
    }
  };

  const handleEndTimeChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setEndTimeInput(value);
    const parsed = parseTime(value);
    if (parsed !== null && parsed > options.startTime && parsed <= duration) {
      updateOption("endTime", parsed);
      updateRegion(options.startTime, parsed);
    }
  };

  const handleStartTimeBlur = () => {
    setStartTimeInput(formatTime(options.startTime));
  };

  const handleEndTimeBlur = () => {
    setEndTimeInput(formatTime(options.endTime));
  };

  const togglePlayPause = () => {
    if (!wavesurferRef.current) return;
    wavesurferRef.current.playPause();
  };

  const playSelection = () => {
    if (!wavesurferRef.current) return;
    wavesurferRef.current.setTime(options.startTime);
    wavesurferRef.current.play();
    // Stop at end of selection
    const checkEnd = () => {
      if (wavesurferRef.current && wavesurferRef.current.getCurrentTime() >= options.endTime) {
        wavesurferRef.current.pause();
        wavesurferRef.current.un("timeupdate", checkEnd);
      }
    };
    wavesurferRef.current.on("timeupdate", checkEnd);
  };

  const selectAll = () => {
    updateOption("startTime", 0);
    updateOption("endTime", duration);
    setStartTimeInput(formatTime(0));
    setEndTimeInput(formatTime(duration));
    updateRegion(0, duration);
  };

  const selectionDuration = options.endTime - options.startTime;

  return (
    <>
      <section className="section">
        <h2 className="section-title">
          <span className="step-number">2</span>
          Choose audio file
        </h2>
        <div
          className={`file-dropzone ${dragOver ? "drag-over" : ""} ${file ? "has-file" : ""}`}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
        >
          <input
            type="file"
            accept="audio/*,.wav,.flac,.aiff,.aif,.mp3,.ogg,.m4a"
            onChange={handleFileInputChange}
            className="file-input-hidden"
            id="trim-file-input"
          />
          <label htmlFor="trim-file-input" className="file-dropzone-label">
            <div className="file-icon">
              {file ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 12l2 2 4-4" />
                  <circle cx="12" cy="12" r="10" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
                  <span className="file-cta">Click to browse or drag & drop</span>
                  <span className="file-hint">
                    Supports WAV, FLAC, AIFF, MP3, OGG, and more.
                  </span>
                </>
              )}
            </div>
          </label>
        </div>
      </section>

      {file && (
        <section className="section">
          <h2 className="section-title">
            <span className="step-number">3</span>
            Select trim region
          </h2>

          <div className="waveform-container">
            {isLoading && (
              <div className="waveform-loading">
                <span className="spinner" /> Loading waveform...
              </div>
            )}
            <div ref={waveformRef} className="waveform" />
          </div>

          <div className="trim-controls">
            <div className="trim-time-inputs">
              <div className="input-group input-group-compact">
                <label htmlFor="trimStart">Start</label>
                <input
                  id="trimStart"
                  type="text"
                  value={startTimeInput}
                  onChange={handleStartTimeChange}
                  onBlur={handleStartTimeBlur}
                  placeholder="0:00.00"
                />
              </div>
              <div className="input-group input-group-compact">
                <label htmlFor="trimEnd">End</label>
                <input
                  id="trimEnd"
                  type="text"
                  value={endTimeInput}
                  onChange={handleEndTimeChange}
                  onBlur={handleEndTimeBlur}
                  placeholder="0:00.00"
                />
              </div>
              <div className="trim-duration-display">
                <span className="trim-duration-label">Selection:</span>
                <span className="trim-duration-value">{formatTime(selectionDuration)}</span>
              </div>
            </div>

            <div className="trim-playback-controls">
              <button type="button" className="btn btn-icon" onClick={togglePlayPause} title={isPlaying ? "Pause" : "Play"}>
                {isPlaying ? (
                  <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                    <rect x="6" y="4" width="4" height="16" />
                    <rect x="14" y="4" width="4" height="16" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                    <polygon points="5,3 19,12 5,21" />
                  </svg>
                )}
              </button>
              <button type="button" className="btn btn-secondary btn-small" onClick={playSelection}>
                Preview selection
              </button>
              <button type="button" className="btn btn-secondary btn-small" onClick={selectAll}>
                Select all
              </button>
            </div>

            <div className="trim-current-time">
              <span>{formatTime(currentTime)}</span>
              <span className="trim-time-separator">/</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>
        </section>
      )}

      {file && (
        <section className="section">
          <h2 className="section-title">
            <span className="step-number">4</span>
            Output options
          </h2>

          <div className="options-grid">
            <div className="input-group">
              <label htmlFor="trimOutputFormat">Output format</label>
              <select
                id="trimOutputFormat"
                value={options.format}
                onChange={(e) => updateOption("format", e.target.value as OutputFormat)}
              >
                <optgroup label="Lossy">
                  <option value="mp3">MP3</option>
                  <option value="ogg">OGG Vorbis</option>
                </optgroup>
                <optgroup label="Lossless">
                  <option value="wav">WAV</option>
                  <option value="flac">FLAC</option>
                  <option value="aiff">AIFF</option>
                </optgroup>
              </select>
            </div>

            <div className={`input-group ${isLosslessFormat ? "input-group-disabled" : ""}`}>
              <label htmlFor="trimBitrate" className="label-with-tooltip">
                <span>Bitrate</span>
                {isLosslessFormat && (
                  <span
                    className="tooltip-icon tooltip-icon-active"
                    data-tooltip="Bitrate is not applicable for lossless formats."
                    aria-label="Bitrate is not applicable for lossless formats."
                    role="tooltip"
                  >
                    i
                  </span>
                )}
              </label>
              <select
                id="trimBitrate"
                value={options.bitrate}
                onChange={(e) => updateOption("bitrate", e.target.value)}
                disabled={isLosslessFormat}
              >
                <option value="96k">96 kbps</option>
                <option value="128k">128 kbps</option>
                <option value="192k">192 kbps</option>
                <option value="256k">256 kbps</option>
                <option value="320k">320 kbps</option>
              </select>
            </div>
          </div>

          <div className="silence-removal-section">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={options.removeSilence}
                onChange={(e) => updateOption("removeSilence", e.target.checked)}
              />
              <span>Remove silence from selection</span>
            </label>

            {options.removeSilence && (
              <div className="options-grid silence-options">
                <div className="input-group">
                  <label htmlFor="silenceThreshold">Silence threshold</label>
                  <select
                    id="silenceThreshold"
                    value={options.silenceThreshold}
                    onChange={(e) => updateOption("silenceThreshold", Number(e.target.value))}
                  >
                    <option value={-60}>-60 dB (very quiet)</option>
                    <option value={-50}>-50 dB (quiet)</option>
                    <option value={-40}>-40 dB (moderate)</option>
                    <option value={-30}>-30 dB (aggressive)</option>
                  </select>
                </div>
                <div className="input-group">
                  <label htmlFor="silenceDuration">Min silence duration</label>
                  <select
                    id="silenceDuration"
                    value={options.silenceDuration}
                    onChange={(e) => updateOption("silenceDuration", Number(e.target.value))}
                  >
                    <option value={0.1}>0.1s</option>
                    <option value={0.25}>0.25s</option>
                    <option value={0.5}>0.5s</option>
                    <option value={1}>1s</option>
                    <option value={2}>2s</option>
                  </select>
                </div>
              </div>
            )}
            <p className="hint">
              {options.removeSilence
                ? "Silent segments below the threshold will be removed from the output."
                : "Enable to automatically strip silent passages from your selection."}
            </p>
          </div>
        </section>
      )}
    </>
  );
}

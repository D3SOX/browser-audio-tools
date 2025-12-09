import type { Theme } from '../types';
import { ThemeToggle } from './ThemeToggle';

type HeroProps = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

export function Hero({ theme, setTheme }: HeroProps) {
  return (
    <header className="hero">
      <div className="hero-content">
        <h1 className="hero-title">Browser Audio Tools</h1>
        <p className="hero-subtitle">
          Various tools for client-side audio processing
        </p>
        <div className="hero-actions">
          <a
            className="github-link"
            href="https://github.com/D3SOX/browser-audio-tools"
            target="_blank"
            rel="noreferrer"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.18-3.37-1.18-.45-1.14-1.1-1.44-1.1-1.44-.9-.62.07-.61.07-.61 1 .07 1.53 1.02 1.53 1.02.89 1.52 2.34 1.08 2.9.83.09-.65.35-1.08.63-1.33-2.22-.25-4.56-1.11-4.56-4.95 0-1.09.39-1.98 1.02-2.67-.1-.25-.44-1.26.1-2.64 0 0 .84-.27 2.75 1.02a9.6 9.6 0 0 1 5 0c1.9-1.29 2.74-1.02 2.74-1.02.55 1.38.21 2.39.1 2.64.64.69 1.02 1.58 1.02 2.67 0 3.85-2.34 4.69-4.58 4.94.36.31.68.92.68 1.85v2.74c0 .26.18.57.69.48A10 10 0 0 0 12 2Z"
              />
            </svg>
            <span>View on GitHub</span>
          </a>
        </div>
      </div>
      <ThemeToggle theme={theme} setTheme={setTheme} />
    </header>
  );
}

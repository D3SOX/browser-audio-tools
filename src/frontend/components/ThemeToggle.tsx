import type { Theme } from '../types';

type ThemeToggleProps = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

export function ThemeToggle({ theme, setTheme }: ThemeToggleProps) {
  const options: { value: Theme; icon: string; label: string }[] = [
    { value: 'system', icon: '🖥️', label: 'Auto' },
    { value: 'light', icon: '☀️', label: 'Light' },
    { value: 'dark', icon: '🌙', label: 'Dark' },
  ];

  const activeIndex = options.findIndex((opt) => opt.value === theme);

  return (
    <div className="theme-switch" aria-label="Theme selector">
      <div className="theme-switch-track">
        <span
          className="theme-switch-indicator"
          style={{
            transform: `translateX(${Math.max(activeIndex, 0) * 100}%)`,
          }}
          aria-hidden="true"
        />
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`theme-switch-btn ${theme === opt.value ? 'active' : ''}`}
            onClick={() => setTheme(opt.value)}
            title={`${opt.label} theme`}
          >
            <span aria-hidden="true">{opt.icon}</span>
            <span className="theme-switch-label">{opt.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

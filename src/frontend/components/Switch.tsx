import type { ChangeEvent, ReactNode } from 'react';

type SwitchProps = {
  checked: boolean;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
};

export function Switch({
  checked,
  onChange,
  children,
  className = '',
  disabled = false,
  leftIcon,
  rightIcon,
}: SwitchProps) {
  return (
    <label
      className={`switch-label ${className} ${disabled ? 'switch-disabled' : ''}`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="switch-input"
      />
      <span className="switch-track">
        <span className="switch-thumb">
          {leftIcon && !checked && (
            <span className="switch-icon switch-icon-left">{leftIcon}</span>
          )}
          {rightIcon && checked && (
            <span className="switch-icon switch-icon-right">{rightIcon}</span>
          )}
        </span>
      </span>
      <span className="switch-text">{children}</span>
    </label>
  );
}

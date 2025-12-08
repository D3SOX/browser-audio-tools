import type { ChangeEvent, ReactNode } from "react";

type CheckboxProps = {
  checked: boolean;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
};

const CheckIcon = () => (
  <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="2.5,6 5,8.5 9.5,3.5" />
  </svg>
);

export function Checkbox({ checked, onChange, children, className = "", disabled = false }: CheckboxProps) {
  return (
    <label className={`checkbox-label ${className}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
      />
      <span className="checkbox-custom">
        <CheckIcon />
      </span>
      {children}
    </label>
  );
}

import React from 'react';

export function ToggleSwitch({ checked = false, onChange, disabled = false, 'aria-label': ariaLabel }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      className={['toggle', checked ? 'is-on' : ''].filter(Boolean).join(' ')}
      onClick={() => onChange && onChange(!checked)}
    ></button>
  );
}

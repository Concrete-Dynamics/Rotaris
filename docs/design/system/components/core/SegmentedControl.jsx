import React from 'react';

export function SegmentedControl({ options = [], value, onChange }) {
  return (
    <div className="seg">
      {options.map((opt) => (
        <div
          key={opt}
          className={['seg-opt', opt === value ? 'is-active' : ''].filter(Boolean).join(' ')}
          onClick={() => onChange && onChange(opt)}
        >
          {opt}
        </div>
      ))}
    </div>
  );
}

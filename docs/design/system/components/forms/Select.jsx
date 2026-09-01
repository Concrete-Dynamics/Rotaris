import React from 'react';

export function Select({ label, options = [], className = '', ...rest }) {
  const field = (
    <select className={['input', 'select', className].filter(Boolean).join(' ')} {...rest}>
      {options.map((o) =>
        typeof o === 'string' ? (
          <option key={o} value={o}>{o}</option>
        ) : (
          <option key={o.value} value={o.value}>{o.label}</option>
        )
      )}
    </select>
  );
  if (!label) return field;
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {field}
    </label>
  );
}

import React from 'react';

export function Input({ label, multiline = false, className = '', ...rest }) {
  const Field = multiline ? 'textarea' : 'input';
  const field = <Field className={['input', className].filter(Boolean).join(' ')} {...rest} />;
  if (!label) return field;
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {field}
    </label>
  );
}

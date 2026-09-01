import React from 'react';

export function Spinner({ size = 'md', label }) {
  const cls = 'spinner' + (size === 'sm' ? ' spinner-sm' : size === 'lg' ? ' spinner-lg' : '');
  const ring = <span className={cls} role="status" aria-label={label || 'Loading'}></span>;
  if (!label) return ring;
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 'var(--rt-text-xs)', color: 'var(--rt-text-tertiary)' }}>{ring}{label}</span>;
}

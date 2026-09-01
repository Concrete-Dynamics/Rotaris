import React from 'react';

export function Sparkline({ values = [], width = 160, height = 22, color = 'var(--rt-accent-500)' }) {
  if (values.length < 2) return null;
  const lo = Math.min(...values), hi = Math.max(...values), span = Math.max(hi - lo, 1);
  const pts = values
    .map((v, i) => (i * width) / (values.length - 1) + ',' + (height - 1 - ((v - lo) * (height - 2)) / span))
    .join(' ');
  return (
    <svg width={width} height={height} viewBox={'0 0 ' + width + ' ' + height} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

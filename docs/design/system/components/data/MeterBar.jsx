import React from 'react';

export function MeterBar({ pct = 0, color = 'var(--rt-accent-500)', threshold }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div style={{ position: 'relative', height: 5, background: 'var(--rt-surface-2)', borderRadius: 3 }}>
      <div style={{ position: 'absolute', inset: '0 auto 0 0', width: clamped + '%', background: color, borderRadius: 3 }}></div>
      {threshold != null && (
        <div style={{ position: 'absolute', top: -3, bottom: -3, left: threshold + '%', width: 1, background: 'var(--rt-border-strong)' }}></div>
      )}
    </div>
  );
}

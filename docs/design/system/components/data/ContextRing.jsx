import React from 'react';

export function ContextRing({ pct = 0, label, sub, threshold = 80, size = 108 }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox="0 0 108 108">
      <circle cx="54" cy="54" r={r} fill="none" stroke="var(--rt-surface-2)" strokeWidth="7" />
      <circle
        cx="54" cy="54" r={r} fill="none" stroke="var(--rt-accent-500)" strokeWidth="7" strokeLinecap="round"
        strokeDasharray={(c * pct) / 100 + ' ' + c} transform="rotate(-90 54 54)"
      />
      <circle
        cx="54" cy="54" r={r} fill="none" stroke="var(--rt-fail)" strokeWidth="2"
        strokeDasharray={'1.5 ' + (c - 1.5)} strokeDashoffset={-(c * threshold) / 100} transform="rotate(-90 54 54)"
      />
      <text x="54" y="51" textAnchor="middle" fill="var(--rt-text)" fontSize="19" fontFamily="var(--rt-font-mono)">{label ?? pct + '%'}</text>
      {sub ? <text x="54" y="67" textAnchor="middle" fill="var(--rt-text-tertiary)" fontSize="9" fontFamily="var(--rt-font-mono)">{sub}</text> : null}
    </svg>
  );
}

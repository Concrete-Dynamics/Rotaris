import React from 'react';

// Lifecycle states (agents/sessions): run, wait, done, fail. Health states (connections/providers): ok, warn, fail.
const COLORS = { run: 'var(--rt-run)', wait: 'var(--rt-wait)', done: 'var(--rt-done)', fail: 'var(--rt-fail)', ok: 'var(--rt-ok)', warn: 'var(--rt-warn)', idle: 'var(--rt-text-tertiary)' };

export function StatusDot({ state = 'idle', pulse = false, size = 7 }) {
  return (
    <span
      className={['status-dot', pulse ? 'is-pulsing' : ''].filter(Boolean).join(' ')}
      style={{ width: size, height: size, background: COLORS[state] || COLORS.idle }}
    ></span>
  );
}

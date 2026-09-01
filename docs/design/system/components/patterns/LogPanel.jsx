import React from 'react';

const LOG_COLORS = { info: 'var(--rt-text-tertiary)', run: 'var(--rt-axis-y-300)', done: 'var(--rt-axis-z-300)', warn: 'var(--rt-axis-x-300)', fail: 'var(--rt-danger-300)' };

/** Monospace run-log panel: timestamp, level, message per line. */
export function LogPanel({ lines = [], maxHeight }) {
  return (
    <div className="log-panel" style={maxHeight ? { maxHeight } : undefined}>
      {lines.map((l, i) => (
        <div key={i} className="log-line">
          <span className="log-time">{l.time}</span>
          <span className="log-level" style={{ color: LOG_COLORS[l.level] || LOG_COLORS.info }}>{l.level}</span>
          <span>{l.text}</span>
        </div>
      ))}
    </div>
  );
}

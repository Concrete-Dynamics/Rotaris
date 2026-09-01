import React from 'react';

export function Kbd({ keys, children }) {
  if (keys) return <span className="kbd-seq">{keys.map((k, i) => <kbd key={i} className="kbd">{k}</kbd>)}</span>;
  return <kbd className="kbd">{children}</kbd>;
}

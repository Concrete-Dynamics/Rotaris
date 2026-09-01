import React from 'react';

export function Tooltip({ label, kbd, side = 'top', children }) {
  return (
    <span className="tooltip">
      {children}
      <span className={'tooltip-bubble' + (side === 'bottom' ? ' is-bottom' : '')} role="tooltip">
        {label}
        {kbd ? <kbd className="kbd">{kbd}</kbd> : null}
      </span>
    </span>
  );
}

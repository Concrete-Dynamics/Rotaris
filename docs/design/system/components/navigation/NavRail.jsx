import React from 'react';

// The rail renders whatever items it is given. The set of primary views, their
// order and their labels are defined by the product specification (REQ-SHELL-023)
// and are deliberately not baked into the design system.
export function NavRail({ items = [], active, onSelect }) {
  return (
    <div className="nav-rail">
      {items.map((it) => (
        <div
          key={it.id}
          className={['nav-item', it.id === active ? 'is-active' : ''].filter(Boolean).join(' ')}
          onClick={() => onSelect && onSelect(it.id)}
        >
          <i className={'ph ' + it.icon}></i>
          <span>{it.label}</span>
        </div>
      ))}
    </div>
  );
}

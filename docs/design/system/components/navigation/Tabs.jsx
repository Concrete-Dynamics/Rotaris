import React from 'react';

export function Tabs({ tabs = [], value, onChange }) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <div key={t} className={['tab', t === value ? 'is-active' : ''].filter(Boolean).join(' ')} onClick={() => onChange && onChange(t)}>
          {t}
        </div>
      ))}
    </div>
  );
}

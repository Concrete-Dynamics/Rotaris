import React from 'react';

export function CommandPalette({ placeholder = 'Type a command or search…', query = '', onQueryChange, groups = [], activeId, onSelect, onClose, footer }) {
  return (
    <div className="cmdk-backdrop" onClick={onClose}>
      <div className="cmdk" role="dialog" aria-label="Command palette" onClick={(e) => e.stopPropagation()}>
        <div className="cmdk-head">
          <i className="ph ph-magnifying-glass"></i>
          <input className="cmdk-input" value={query} placeholder={placeholder} onChange={(e) => onQueryChange && onQueryChange(e.target.value)} autoFocus />
          <kbd className="kbd">esc</kbd>
        </div>
        <div className="cmdk-list">
          {groups.map((g) => (
            <React.Fragment key={g.label}>
              <div className="cmdk-group">{g.label}</div>
              {g.items.map((it) => (
                <div key={it.id} className={'cmdk-item' + (it.id === activeId ? ' is-active' : '')} onClick={() => onSelect && onSelect(it.id)}>
                  {it.icon ? <i className={'ph ' + it.icon}></i> : null}
                  <span>{it.label}</span>
                  {it.kbd ? <span className="cmdk-item-hint kbd-seq">{it.kbd.map((k, i) => <kbd key={i} className="kbd">{k}</kbd>)}</span> : it.hint ? <span className="cmdk-item-hint">{it.hint}</span> : null}
                </div>
              ))}
            </React.Fragment>
          ))}
        </div>
        <div className="cmdk-foot">
          <span><kbd className="kbd">↑</kbd><kbd className="kbd">↓</kbd> navigate</span>
          <span><kbd className="kbd">↵</kbd> run</span>
          <span><kbd className="kbd">esc</kbd> close</span>
          {footer}
        </div>
      </div>
    </div>
  );
}

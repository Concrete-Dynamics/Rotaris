import React from 'react';

export function Dialog({ title, children, actions, onClose }) {
  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title">{title}</div>
        <div className="dialog-body">{children}</div>
        {actions ? <div className="dialog-actions">{actions}</div> : null}
      </div>
    </div>
  );
}

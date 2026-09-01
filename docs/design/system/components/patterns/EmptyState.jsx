import React from 'react';

/** Centered empty state on the dot-grid motif — icon, message, hint, one action. */
export function EmptyState({ icon = 'ph-tree-structure', title, hint, action }) {
  return (
    <div className="empty-state rt-dot-grid-bg">
      <i className={'ph ' + icon}></i>
      {title ? <div className="empty-state-title">{title}</div> : null}
      {hint ? <div className="empty-state-hint">{hint}</div> : null}
      {action ? <div style={{ marginTop: 8 }}>{action}</div> : null}
    </div>
  );
}

import React from 'react';

export function ConfirmDialog({ title, children, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = true, onConfirm, onCancel }) {
  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()} role="alertdialog" aria-label={title}>
        <div className="dialog-title" style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          {danger ? <i className="ph ph-warning" style={{ color: 'var(--rt-danger-300)', fontSize: 19 }}></i> : null}
          {title}
        </div>
        <div className="dialog-body">{children}</div>
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>{cancelLabel}</button>
          <button type="button" className={'btn ' + (danger ? 'btn-danger' : 'btn-primary')} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

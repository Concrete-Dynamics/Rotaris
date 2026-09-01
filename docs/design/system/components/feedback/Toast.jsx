import React from 'react';

const toastIcons = { info: 'ph-info', ok: 'ph-check-circle', warn: 'ph-warning', fail: 'ph-x-circle' };

export function Toast({ level = 'info', title, children, action, onDismiss }) {
  return (
    <div className={'toast toast-' + level} role="status">
      <i className={'ph ' + toastIcons[level]}></i>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <div className="toast-title">{title}</div>
        {children ? <div className="toast-body">{children}</div> : null}
        {action || null}
      </div>
      {onDismiss ? <button className="toast-close" onClick={onDismiss} aria-label="Dismiss"><i className="ph ph-x"></i></button> : null}
    </div>
  );
}

export function ToastStack({ children }) {
  return <div className="toast-stack">{children}</div>;
}

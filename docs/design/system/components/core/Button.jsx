import React from 'react';

export function Button({ variant = 'secondary', size = 'default', icon, iconRight, disabled, children, onClick, type = 'button', className = '', ...rest }) {
  const cls = ['btn', 'btn-' + variant, size === 'compact' ? 'btn-compact' : '', className].filter(Boolean).join(' ');
  return (
    <button type={type} className={cls} disabled={disabled} onClick={onClick} {...rest}>
      {icon ? <i className={'ph ' + icon}></i> : null}
      {children}
      {iconRight ? <i className={'ph ' + iconRight}></i> : null}
    </button>
  );
}

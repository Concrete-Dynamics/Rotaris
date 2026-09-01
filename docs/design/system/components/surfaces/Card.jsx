import React from 'react';

export function Card({ title, accented = false, footer, children, className = '' }) {
  return (
    <div className={['card', accented ? 'card-accented' : '', className].filter(Boolean).join(' ')}>
      {title ? <div className="card-kicker">{title}</div> : null}
      {children}
      {footer ? <div className="card-meta">{footer}</div> : null}
    </div>
  );
}

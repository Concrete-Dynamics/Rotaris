import React from 'react';

/** The baseline-aligned title row every view opens with: title, dim context, right-aligned actions. */
export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="page-header">
      <h4 style={{ margin: 0 }}>{title}</h4>
      {subtitle ? <span className="page-header-sub">{subtitle}</span> : null}
      <div style={{ flex: 1 }}></div>
      {children}
    </div>
  );
}

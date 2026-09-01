import React from 'react';

export function KpiCard({ title, value, unit, sparkline, footer }) {
  return (
    <div className="card card-accented">
      <div className="card-kicker">{title}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span className="kpi-value">{value}</span>
        {unit ? <span className="kpi-unit">{unit}</span> : null}
      </div>
      {sparkline}
      {footer ? <div className="card-meta">{footer}</div> : null}
    </div>
  );
}

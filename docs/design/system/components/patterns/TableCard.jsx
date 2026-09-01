import React from 'react';

/** A Card with a flush-mounted Table — the delegation-tree / commit-list pattern. */
export function TableCard({ title, actions, columns = [], rows = [], footer, accented = false }) {
  return (
    <div className={['card', 'table-card', accented ? 'card-accented' : ''].filter(Boolean).join(' ')}>
      {(title || actions) ? (
        <div className="table-card-head">
          {title ? <div className="card-kicker">{title}</div> : null}
          <div style={{ flex: 1 }}></div>
          {actions}
        </div>
      ) : null}
      <table className="table">
        <thead>
          <tr>{columns.map((c, i) => <th key={i}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
      {footer ? <div className="table-card-foot">{footer}</div> : null}
    </div>
  );
}

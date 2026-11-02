import { Button as DesignButton } from '../design-system/index.js';

/** REQ-CONFIG-327: a warning prompt with Yes and Cancel, Cancel as the default. Shared with the Security policy card (REQ-SANDBOX-117),
 * which `ConfigSettings.tsx` draws: kept apart from both so neither imports the other back (an import cycle, R-091). */
export function Confirm({ title, body, onYes, onCancel }: { title: string; body: string; onYes: () => void; onCancel: () => void }) {
  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="settings-confirm-title">
        <h2 id="settings-confirm-title" className="dialog-title">{title}</h2>
        <p className="dialog-body">{body}</p>
        <div className="dialog-actions">
          <DesignButton type="button" className="btn btn-secondary" autoFocus onClick={onCancel}>Cancel</DesignButton>
          <DesignButton type="button" className="btn btn-warning" onClick={onYes}>Yes</DesignButton>
        </div>
      </div>
    </div>
  );
}

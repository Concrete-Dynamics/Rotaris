import { useEffect, useId } from 'react';
import type { LaunchPreview } from '@rotaris/contracts';
import { DISCLOSURE_ABANDON, DISCLOSURE_ACCEPT, DISCLOSURE_ACCEPT_ALWAYS, DISCLOSURE_TITLE, disclosureLines } from './presentation.js';
import { Button as DesignButton } from '../../design-system/index.js';

/**
 * Part AP — the elevation's disclosure (REQ-TRACE-470..474): the first action of a launch that would start a run
 * declares what the run receives, the worktree it is confined to and when it begins, and offers the way to abandon.
 * Abandoning writes nothing (the act is never sent); accepting sends the act with `payload.disclosure = accepted`;
 * accepting permanently also asks main to suppress it for later launches (`requirements.runs {op: 'suppress'}`).
 * A repository that cannot host a run shows its reason in place of "when it begins" and offers only Abandon
 * (REQ-TRACE-498's two repository rows). Cancel is the default, as the design's confirmation contract has it.
 */
export interface LaunchDisclosureProps {
  readonly preview: LaunchPreview;
  readonly onAccept: (always: boolean) => void;
  readonly onAbandon: () => void;
  /** REQ-TRACE-498: "setting one up is offered" where the folder is not a repository. */
  readonly onSetUpGit?: (() => void) | undefined;
}

export function LaunchDisclosure({ preview, onAccept, onAbandon, onSetUpGit }: LaunchDisclosureProps) {
  const titleId = useId();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); onAbandon(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onAbandon]);
  const lines = disclosureLines(preview);
  const canStart = preview.repository.ok;
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onAbandon(); }}>
      <div className="dialog req-pane__dialog" role="alertdialog" aria-modal="true" aria-labelledby={titleId} data-testid="req-pane-disclosure">
        <h2 id={titleId} className="dialog-title">{DISCLOSURE_TITLE}: {preview.id}</h2>
        <ul className="dialog-body req-pane__disclosure-lines">{lines.map((line) => <li key={line} className={line.startsWith('It is confined') ? 'req-pane__mono' : undefined}>{line}</li>)}</ul>
        <div className="dialog-actions">
          <DesignButton type="button" className="btn btn-secondary" autoFocus onClick={onAbandon}>{DISCLOSURE_ABANDON}</DesignButton>
          {!canStart && !preview.repository.ok && preview.repository.offerSetup && onSetUpGit !== undefined && <DesignButton type="button" className="btn btn-secondary" onClick={onSetUpGit}>Set up Git here</DesignButton>}
          {canStart && <DesignButton type="button" className="btn btn-secondary" onClick={() => onAccept(true)}>{DISCLOSURE_ACCEPT_ALWAYS}</DesignButton>}
          {canStart && <DesignButton type="button" className="btn btn-primary" onClick={() => onAccept(false)}>{DISCLOSURE_ACCEPT}</DesignButton>}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useId, useState } from 'react';
import type { CheckpointListPayload, CheckpointPreviewPayload } from '@rotaris/contracts';
import { Button as DesignButton, Input as DesignInput, TextArea as DesignTextArea } from './design-system/index.js';

/**
 * ADR-0039's desktop flow, the dialogs (REQ-GIT-096..100): the window-modal indeterminate progress dialog with no
 * cancel (the one latency this flow carries, bounded by REQ-GIT-033), and the restore confirmation — the summary
 * sentence, REQ-GIT-064's text verbatim in a read-only monospace field, the warning and the consent checkbox when the
 * preview carries dirty paths, Cancel the default and every other exit "do not restore" (REQ-GIT-099). Language from
 * docs/design/system: Dialog, Field, Button; tokens by name; every state is text as well as colour.
 */
export const RESTORE_LISTING_LOADING = "Rotaris is still reading this session's checkpoints.";
export const RESTORE_UNAVAILABLE = "This session's checkpoints cannot be restored.";
export const CHECKPOINTS_READING = "Reading this session's checkpoints…";
export const RESTORE_CANCELLED = 'Restore cancelled. The working tree was not changed.';
export const TREE_UNCHANGED = 'The working tree was left unchanged.';
export const OVERWRITE_CONSENT_REASON = 'Confirm that the uncommitted changes above may be overwritten first.';

export type ListingState =
  | { readonly state: 'none' }
  | { readonly state: 'reading'; readonly sessionId: string }
  | { readonly state: 'ready'; readonly sessionId: string; readonly listing: CheckpointListPayload }
  | { readonly state: 'unavailable'; readonly sessionId: string; readonly reason: string }
  | { readonly state: 'empty'; readonly sessionId: string; readonly reason: string | null };

/** REQ-GIT-089: the four disabled reasons in order; null when the button is enabled. */
export function restoreDisabledReason(listing: ListingState, selected: number | null, noSessionText: string, noRowText: string): string | null {
  if (listing.state === 'none') return noSessionText;
  if (listing.state === 'reading') return RESTORE_LISTING_LOADING;
  if (listing.state === 'unavailable') return listing.reason || RESTORE_UNAVAILABLE;
  if (listing.state === 'empty' && listing.reason) return listing.reason;
  if (listing.state === 'ready' && listing.listing.unavailable) return listing.listing.unavailable;
  if (selected === null) return noRowText;
  return null;
}

/** REQ-GIT-087: the card's empty text by cause. */
export function checkpointsEmptyText(listing: ListingState, noSessionText: string, emptyText: string): string | null {
  if (listing.state === 'none') return noSessionText;
  if (listing.state === 'reading') return CHECKPOINTS_READING;
  if (listing.state === 'unavailable') return listing.reason;
  if (listing.state === 'empty') return listing.reason ?? emptyText;
  if (listing.listing.unavailable) return listing.listing.unavailable;
  return listing.listing.rows.length === 0 ? emptyText : null;
}

/** REQ-GIT-096 / REQ-GIT-100: `Inspecting checkpoint <n>…` and `Restoring checkpoint <n>…` — window title "Checkpoints", no cancel, Escape ignored. */
export function CheckpointProgressDialog({ text }: { text: string }) {
  const titleId = useId();
  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog checkpoint-dialog checkpoint-dialog--progress" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy="true" data-testid="checkpoint-progress">
        <h2 id={titleId} className="dialog-title">Checkpoints</h2>
        <p className="dialog-body" data-testid="checkpoint-progress-text">{text}</p>
        <div className="checkpoint-dialog__bar" role="progressbar" aria-label={text} aria-valuetext="in progress"><span className="checkpoint-dialog__bar-fill" /></div>
      </div>
    </div>
  );
}

export interface RestoreConfirmProps {
  readonly preview: CheckpointPreviewPayload;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/** REQ-GIT-097/098/099: the confirmation. */
export function RestoreConfirmDialog({ preview, onConfirm, onCancel }: RestoreConfirmProps) {
  const titleId = useId();
  const checkId = useId();
  const [consented, setConsented] = useState(false);
  const dirty = preview.dirty.length > 0 && preview.blockedReason !== '';
  const canConfirm = !dirty || consented;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); onCancel(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <div className="dialog checkpoint-dialog checkpoint-dialog--confirm" role="alertdialog" aria-modal="true" aria-labelledby={titleId} data-testid="checkpoint-confirm" data-dirty={dirty ? '1' : '0'}>
        <h2 id={titleId} className="dialog-title">Restore checkpoint {preview.sequence}?</h2>
        <p className="dialog-body checkpoint-dialog__summary" data-testid="checkpoint-summary">{preview.summary}</p>
        <DesignTextArea className="input mono checkpoint-dialog__preview" readOnly aria-label="Restore preview" data-testid="checkpoint-preview-text" value={preview.text} rows={Math.min(14, Math.max(4, preview.text.split('\n').length + 1))} />
        {dirty && (
          <div className="checkpoint-dialog__warning" role="alert" data-testid="checkpoint-warning">
            <p className="checkpoint-dialog__warning-text">{preview.blockedReason}</p>
            <label className="checkpoint-dialog__check" htmlFor={checkId}>
              <DesignInput id={checkId} type="checkbox" data-testid="checkpoint-overwrite" checked={consented} onChange={(event) => setConsented(event.currentTarget.checked)} />
              <span>Overwrite {preview.dirty.length} uncommitted change(s)</span>
            </label>
          </div>
        )}
        <div className="dialog-actions">
          <DesignButton type="button" className="btn btn-secondary" autoFocus data-testid="checkpoint-cancel" onClick={onCancel}>Cancel</DesignButton>
          <DesignButton type="button" className="btn btn-danger" data-testid="checkpoint-restore-confirm" disabled={!canConfirm} title={canConfirm ? undefined : OVERWRITE_CONSENT_REASON} aria-disabled={!canConfirm} onClick={() => { if (canConfirm) onConfirm(); }}>Restore checkpoint {preview.sequence}</DesignButton>
        </div>
        {!canConfirm && <p className="checkpoint-dialog__reason text-secondary" data-testid="checkpoint-consent-reason">{OVERWRITE_CONSENT_REASON}</p>}
      </div>
    </div>
  );
}

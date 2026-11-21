import { SEVERITY_GLYPHS, type Notice, type NoticeAction, type NoticeSeverity } from '@rotaris/contracts';
import { markMotionStart } from './motion.js';
import { Button as DesignButton, layoutContractAttributes, MeterBar, type UiLayoutContract } from './design-system/index.js';

/** The notice-banner brief §8: the meter contained in the text column it spans. */
const METER_LAYOUT: UiLayoutContract = { id: 'notice-meter', relations: [{ kind: 'containment' }] };

/**
 * ADR-0049 / REQ-SHELL-114 / REQ-SHELL-116 — the ONE persistent notice, an inline banner under the title bar.
 *
 * REQ-NOTIFY-035 (design G1): severity is a 1 px border, a 3 px left rule and a glyph, never a filled background.
 * REQ-NOTIFY-005 / REQ-NOTIFY-037: the title is always drawn and is one plain sentence; the message row and the
 * detail row are drawn only where their text is non-empty; the detail is selectable.
 * REQ-NOTIFY-038: a copy control appears exactly where the detail is non-empty and says what it copies.
 * REQ-NOTIFY-040: the dismiss control appears exactly where the notice is persistent. Nothing leaves on a timer.
 * REQ-NOTIFY-258 / REQ-SHELL-149: the severity word is in the accessible name, so the state is never colour alone.
 * REQ-SHELL-115: the one action is a member of the closed vocabulary; the root dispatches it.
 * REQ-NOTIFY-043 (R-117): where the notice carries `progress` — the update's download with a stated size — a meter spans the
 * text column under the message; its accessible name is the figure in words (`{percent}% downloaded`, the brief's §6).
 */
export const SEVERITY_WORDS: Readonly<Record<NoticeSeverity, string>> = { info: 'Notice', success: 'Success', warning: 'Warning', error: 'Error' };

export interface NoticeBannerProps {
  readonly notice: Notice;
  readonly onAcknowledge?: ((id: number) => void) | undefined;
  readonly onAction?: ((action: NoticeAction) => void) | undefined;
}

export function NoticeBanner({ notice, onAcknowledge, onAction }: NoticeBannerProps) {
  const word = SEVERITY_WORDS[notice.severity];
  /*
   * Review-ui UIR-U01 (R-117): the action is keyed by whether it restarts, so when the update notice's `Cancel download`
   * becomes `Restart now` the restart is a new control — a press begun on the cancel cannot land on it, and the focus does not
   * carry over to it. `Cancel download` → `Update now` stays one control (the notice-banner brief §5).
   */
  const actionKey = notice.action?.action.kind === 'restart' ? 'restart' : 'action';
  return (
    <div
      ref={(element) => { if (element) markMotionStart(element); }}
      className={`notice notice--${notice.severity}`}
      role={notice.severity === 'error' ? 'alert' : 'status'}
      aria-label={`${word}: ${notice.title}`}
      data-severity={notice.severity}
      data-notice-id={notice.id}
      data-session={notice.sessionId}
      data-testid="notice"
    >
      <span className="notice__glyph" aria-hidden="true">{SEVERITY_GLYPHS[notice.severity]}</span>
      <div className="notice__text">
        <span className="notice__headline" data-testid="notice-title">{notice.title}</span>
        {notice.message !== '' && <span className="notice__message text-secondary" data-testid="notice-message">{notice.message}</span>}
        {notice.progress !== undefined && <MeterBar className="notice__meter" tone="accent" value={notice.progress} max={100} label={`${notice.progress}% downloaded`} data-testid="notice-meter" {...layoutContractAttributes(METER_LAYOUT)} />}
        {notice.detail !== '' && (
          <details className="notice__details">
            <summary>Details</summary>
            <pre className="notice__detail mono" data-testid="notice-detail">{notice.detail}</pre>
            <DesignButton type="button" className="btn btn-ghost" aria-label="Copy the technical detail" onClick={() => { void navigator.clipboard?.writeText(notice.detail); }}>Copy</DesignButton>
          </details>
        )}
      </div>
      {/*
        One row for both controls, cross-centred. They were direct children of a `flex-start` banner
        with only the dismiss carrying `align-self: center`, so their centres sat 5.42 px apart on
        every view at both sizes — the first misalignment on every screen in the product, found by
        the visual critic of 2026-09-12 (UIR-008). The `align-y` contract is what keeps it found.
      */}
      {(notice.action || notice.persistent) && (
        <div className="notice__actions">
          {notice.action && (
            /*
              REQ-SHELL-118: while an update downloads, the offer's `Update now` is DISABLED so the same download
              cannot be started twice, and its accessible description says why. `action.disabled` carries that
              description (contracts `notices.ts`); nothing else about the control changes, and no other notice
              sets it. The description is also the tooltip, so a pointer user reads the same sentence.
            */
            <DesignButton key={actionKey} type="button" className="btn btn-secondary notice__action" data-action={notice.action.action.kind} ui={{ id: 'notice-action', relations: [] }} disabled={notice.action.disabled !== undefined} aria-disabled={notice.action.disabled !== undefined ? true : undefined} aria-description={notice.action.disabled} title={notice.action.disabled} onClick={() => onAction?.(notice.action!.action)}>{notice.action.label}</DesignButton>
          )}
          {notice.persistent && (
            <DesignButton type="button" className="btn btn-ghost notice__dismiss" aria-label={`Dismiss this ${word.toLowerCase()}`} ui={{ id: 'notice-dismiss', relations: notice.action ? [{ kind: 'align-y', target: 'notice-action', edge: 'middle' }] : [] }} onClick={() => onAcknowledge?.(notice.id)}>Dismiss</DesignButton>
          )}
        </div>
      )}
    </div>
  );
}

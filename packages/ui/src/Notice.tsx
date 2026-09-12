import { SEVERITY_GLYPHS, type Notice, type NoticeAction, type NoticeSeverity } from '@rotaris/contracts';
import { markMotionStart } from './motion.js';
import { Button as DesignButton } from './design-system/index.js';

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
 */
export const SEVERITY_WORDS: Readonly<Record<NoticeSeverity, string>> = { info: 'Notice', success: 'Success', warning: 'Warning', error: 'Error' };

export interface NoticeBannerProps {
  readonly notice: Notice;
  readonly onAcknowledge?: ((id: number) => void) | undefined;
  readonly onAction?: ((action: NoticeAction) => void) | undefined;
}

export function NoticeBanner({ notice, onAcknowledge, onAction }: NoticeBannerProps) {
  const word = SEVERITY_WORDS[notice.severity];
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
            <DesignButton type="button" className="btn btn-secondary notice__action" data-action={notice.action.action.kind} ui={{ id: 'notice-action', relations: [] }} onClick={() => onAction?.(notice.action!.action)}>{notice.action.label}</DesignButton>
          )}
          {notice.persistent && (
            <DesignButton type="button" className="btn btn-ghost notice__dismiss" aria-label={`Dismiss this ${word.toLowerCase()}`} ui={{ id: 'notice-dismiss', relations: notice.action ? [{ kind: 'align-y', target: 'notice-action', edge: 'middle' }] : [] }} onClick={() => onAcknowledge?.(notice.id)}>Dismiss</DesignButton>
          )}
        </div>
      )}
    </div>
  );
}

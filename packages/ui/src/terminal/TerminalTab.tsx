import { useState } from 'react';
import type { EncodedKey, TerminalStreamMeta } from '@rotaris/contracts';
import { ConfirmDialog } from '../ConfirmDialog.js';
import { markMotionStart } from '../motion.js';
import type { GridGeometry } from './geometry.js';
import { CONTROLS, HEADER, KILL_DIALOG, commandLabel, outcomeLabel, type BannerText } from './labels.js';
import type { CopyOutcome } from './selection.js';
import { TerminalBanner } from './TerminalBanner.js';
import { TerminalGrid } from './TerminalGrid.js';
import type { TerminalView } from './xterm-view.js';
import { Button as DesignButton, Tag as DesignTag } from '../design-system/index.js';

/**
 * Part AM — one tab of the terminal window (REQ-SHELL-087..094): the header, the controls row in the fixed order with
 * Kill past the spacer, the one banner slot, the grid, and the kill confirmation. The tab holds NO state of its own:
 * arming, the banner, the once-per-lifetime flags live in the window keyed by stream, so a tab that leaves the front
 * and comes back keeps them (REQ-SHELL-090's "once per tab lifetime").
 */
export interface TabState {
  readonly armed: boolean;
  readonly banner: BannerText | null;
  /** REQ-SHELL-090: the read-only banner fires once per tab lifetime, re-enabled when armed or exited changes. */
  readonly readOnlySpent: boolean;
  /** REQ-SHELL-091: the exit notice shows once. */
  readonly exitedShown: boolean;
  readonly focusRequest: number;
  /** Counts every banner the slot has been given, so "once per tab lifetime" is measurable rather than inferred. */
  readonly bannerSeq: number;
}

export const INITIAL_TAB_STATE: TabState = Object.freeze({ armed: false, banner: null, readOnlySpent: false, exitedShown: false, focusRequest: 0, bannerSeq: 0 });

export interface TerminalTabProps {
  readonly meta: TerminalStreamMeta;
  readonly view: TerminalView;
  readonly state: TabState;
  readonly onToggleControl: () => void;
  readonly onInterrupt: () => void;
  readonly onEndInput: () => void;
  readonly onKill: () => void;
  readonly onCopyAll: () => void;
  readonly onKey: (key: EncodedKey) => void;
  readonly onRejectedInput: () => void;
  readonly onCopy: (outcome: CopyOutcome) => void;
  readonly onGeometry: (geometry: GridGeometry) => void;
  readonly onBannerAction: () => void;
  readonly registerTakeControl?: ((element: HTMLButtonElement | null) => void) | undefined;
}

export function TerminalTab(props: TerminalTabProps) {
  const { meta, state, view, onToggleControl, onInterrupt, onEndInput, onKill, onCopyAll, onKey, onRejectedInput, onCopy, onGeometry, onBannerAction, registerTakeControl } = props;
  const [killAsked, setKillAsked] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const running = meta.running;
  const ended = !running;
  const label = commandLabel(meta);
  const outcome = outcomeLabel(meta);
  const reason = ended ? CONTROLS.endedReason : CONTROLS.helpAvailable;
  // REQ-SHELL-091: the four action controls disabled once the process has exited, the reason on each (ADR-0050:
  // tooltip AND accessible description) and reachable through the enabled help control beside them.
  const disabledProps = ended ? { disabled: true, title: CONTROLS.endedReason, 'aria-description': CONTROLS.endedReason } : {};
  const canTakeControl = running && meta.acceptsInput;
  const takeControlReason = ended ? CONTROLS.endedReason : meta.acceptsInput ? undefined : 'This terminal does not accept input.';
  return (
    <section className="term-tab" data-testid="term-tab" data-stream-id={meta.streamId} data-running={running} data-armed={state.armed} aria-label={label.full}>
      <header className="term-tab__header">
        <span
          ref={(element) => { if (element && running) markMotionStart(element); }}
          className={`status-dot term-tab__dot${running ? ' is-pulsing' : ''}`}
          role="img"
          aria-label={HEADER.statusName}
          data-state={running ? 'running' : 'idle'}
          data-testid="term-status-dot"
        />
        <span className="term-tab__command mono" aria-label={HEADER.commandName} title={label.full} data-testid="term-command">{label.text}</span>
        {meta.truncated && (
          <DesignTag kind="outline" className="term-tab__truncated" aria-label={HEADER.truncationName} title={HEADER.truncationTooltip} data-testid="term-truncated">{HEADER.truncationLabel}</DesignTag>
        )}
        <span className={`tag ${running ? 'tag-run' : 'tag-neutral'} term-tab__outcome mono`} aria-label={HEADER.outcomeName} data-testid="term-outcome">{outcome}</span>
      </header>
      <div className="term-tab__controls" role="toolbar" aria-label="Terminal controls">
        <DesignButton
          ref={registerTakeControl}
          type="button"
          className={`btn ${state.armed ? 'btn-warning' : 'btn-secondary'} btn-compact`}
          aria-label={CONTROLS.takeControlName}
          aria-pressed={state.armed}
          aria-description={takeControlReason ?? CONTROLS.takeControlDescription}
          title={takeControlReason ?? CONTROLS.takeControlDescription}
          disabled={!canTakeControl}
          onClick={onToggleControl}
          data-testid="term-take-control"
        >{state.armed ? CONTROLS.releaseControl : CONTROLS.takeControl}</DesignButton>
        <DesignButton type="button" className="btn btn-secondary btn-compact" aria-label={CONTROLS.interruptName} {...disabledProps} onClick={onInterrupt} data-testid="term-interrupt">{CONTROLS.interrupt}</DesignButton>
        <DesignButton type="button" className="btn btn-secondary btn-compact" aria-label={CONTROLS.endInputName} {...disabledProps} onClick={onEndInput} data-testid="term-end-input">{CONTROLS.endInput}</DesignButton>
        <DesignButton
          type="button"
          className="btn btn-ghost btn-compact term-tab__help"
          aria-label={CONTROLS.helpName}
          aria-description={reason}
          aria-expanded={helpOpen}
          title={reason}
          onClick={() => setHelpOpen((v) => !v)}
          data-testid="term-help"
        >?</DesignButton>
        <span className="term-tab__spacer" aria-hidden="true" />
        <DesignButton type="button" className="btn btn-secondary btn-compact" aria-label={CONTROLS.copyAllName} onClick={onCopyAll} data-testid="term-copy-all">{CONTROLS.copyAll}</DesignButton>
        <DesignButton
          type="button"
          className="btn btn-danger btn-compact"
          aria-label={CONTROLS.killName}
          aria-description={ended ? CONTROLS.endedReason : CONTROLS.killDescription}
          title={ended ? CONTROLS.endedReason : CONTROLS.killDescription}
          disabled={ended || !meta.canKill}
          onClick={() => setKillAsked(true)}
          data-testid="term-kill"
        >{CONTROLS.kill}</DesignButton>
      </div>
      {helpOpen && <p className="term-tab__help-note text-secondary" role="note" data-testid="term-help-note">{reason}</p>}
      <div className="term-tab__banner" data-testid="term-banner-slot" data-banner-seq={state.bannerSeq}>
        {state.banner && <TerminalBanner banner={state.banner} onAction={onBannerAction} />}
      </div>
      <TerminalGrid
        view={view}
        armed={state.armed}
        running={running}
        onKey={onKey}
        onRejectedInput={onRejectedInput}
        onCopy={onCopy}
        onGeometry={onGeometry}
        focusRequest={state.focusRequest}
      />
      {killAsked && (
        <ConfirmDialog
          title={KILL_DIALOG.title}
          body={KILL_DIALOG.body}
          lines={KILL_DIALOG.lines(meta.command)}
          confirmLabel={KILL_DIALOG.confirm}
          destructive
          onConfirm={() => { setKillAsked(false); onKill(); }}
          onCancel={() => setKillAsked(false)}
          testId="term-kill-dialog"
        />
      )}
    </section>
  );
}

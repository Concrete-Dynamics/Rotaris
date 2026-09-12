import { useCallback, useEffect, useRef, useState } from 'react';
import type { Result } from '@rotaris/kernel';
import { describeKey, type EncodedKey, type TerminalRefusal, type TerminalStreamMeta } from '@rotaris/contracts';
import type { Acknowledger } from '../TranscriptSurface.js';
import { AuditBuffer, type AuditEntry } from './audit.js';
import type { StreamDisplay } from './emulator.js';
import type { GridGeometry } from './geometry.js';
import { BANNERS, EMPTY_STATE, TABLIST_NAME, outcomeLabel, tabLabel, tabTooltip, type Attempt } from './labels.js';
import { NOTHING_TO_COPY, copyText, type CopyOutcome } from './selection.js';
import { TerminalStreamSet } from './streams.js';
import { INITIAL_TAB_STATE, TerminalTab, type TabState } from './TerminalTab.js';
import { isTerminalView, xtermViewEmulator, type TerminalView } from './xterm-view.js';
import { Button as DesignButton, EmptyState as DesignEmptyState } from '../design-system/index.js';

/**
 * Part AM — the pop-out terminal window's content (REQ-SHELL-079..094). One tab per known stream in arrival order,
 * the tab set named "Terminal sessions"; the empty state when no stream is retained; a 120 ms tick that refreshes
 * every tab's header (a background tab never keeps showing "running" after it ended), repaints only the grid in
 * front (the others are detached, and the library pauses their rendering), and coalesces tab creation and
 * relabelling; the tick stops while the document is hidden and resumes when shown (REQ-SHELL-084/086).
 *
 * The window's lifecycle — one per main window, the title, opening without focus when automatic, rebuild on reopen,
 * session focus and new-session clearing (REQ-SHELL-080/081/086/108..111) — is `main/windows.ts`'s and the renderer
 * boot branch's (wave 2, AL′). This component is what they mount; it receives the frames' subscription point and the
 * control actions as props so it can be built and proved against a scripted source (ADR-0047's first execution).
 */
export const TERMINAL_TICK_MS = 120;

export type TerminalActionResult = Promise<Result<void, TerminalRefusal>>;

/** The `terminal.*` command family (contracts `terminal.ts`, AL's) as the window sees it; wave 2 binds it to the command bridge. */
export interface TerminalActions {
  sendKeys(streamId: string, keys: readonly EncodedKey[]): TerminalActionResult;
  interrupt(streamId: string): TerminalActionResult;
  endInput(streamId: string): TerminalActionResult;
  kill(streamId: string): TerminalActionResult;
  /** REQ-SHELL-106: resizes the emulated screen always and the real terminal when possible; never refused. */
  resize(streamId: string, cols: number, rows: number): Promise<unknown> | void;
  /** REQ-SHELL-107: written by the run host, redacted there; the renderer only submits. */
  audit(streamId: string, entry: AuditEntry): void;
}

export interface TerminalWindowProps {
  /** Built with `createTerminalWindowStreams()` — its emulators must be views (`@xterm/xterm`), or no grid can mount. */
  readonly streams: TerminalStreamSet;
  readonly actions: TerminalActions;
  /** REQ-SHELL-083/115: the empty state's action, the same result as the view-navigation action from a banner. */
  readonly onGoToWorkspace: () => void;
  /** REQ-SHELL-085: bring this stream forward — only if retained screen state exists for it. */
  readonly focusStream?: string | null | undefined;
  /** REQ-CHAT-075's shape for a copy's outcome: this window's acknowledgement stack (ADR-0049: one per window). */
  readonly acknowledge?: Acknowledger | undefined;
  readonly clipboard?: ((text: string) => Promise<void>) | undefined;
  readonly tickMs?: number | undefined;
}

/** The registry a terminal window renderer keeps: the same frames, emulated by the library that can paint. */
export function createTerminalWindowStreams(): TerminalStreamSet {
  return new TerminalStreamSet(xtermViewEmulator);
}

interface TabSummary { readonly id: string; readonly label: string; readonly tooltip: string; readonly running: boolean; readonly meta: TerminalStreamMeta; readonly view: TerminalView }

function summarise(displays: readonly StreamDisplay[]): TabSummary[] {
  const out: TabSummary[] = [];
  for (const d of displays) {
    if (!isTerminalView(d.emulator)) continue;
    out.push({ id: d.streamId, label: tabLabel(d.meta), tooltip: tabTooltip(d.meta), running: d.meta.running, meta: d.meta, view: d.emulator });
  }
  return out;
}

type TabStates = ReadonlyMap<string, TabState>;
type TabPatch = Partial<TabState> | ((state: TabState) => Partial<TabState> | null);

const defaultClipboard = (text: string): Promise<void> => navigator.clipboard.writeText(text);

export function TerminalWindow({ streams, actions, onGoToWorkspace, focusStream, acknowledge, clipboard = defaultClipboard, tickMs = TERMINAL_TICK_MS }: TerminalWindowProps) {
  const [tabs, setTabs] = useState<readonly TabSummary[]>([]);
  const [front, setFront] = useState<string | null>(null);
  const [ticks, setTicks] = useState(0);
  const [tabStates, setTabStates] = useState<TabStates>(() => new Map());
  const audits = useRef(new Map<string, AuditBuffer>());
  const lastRunning = useRef(new Map<string, boolean>());
  const takeControlButton = useRef<HTMLButtonElement | null>(null);
  const initialFocusDone = useRef(false);
  const pendingFocusStream = useRef<string | null>(null);
  const latest = useRef({ actions, acknowledge, clipboard, tabStates });

  useEffect(() => { latest.current = { actions, acknowledge, clipboard, tabStates }; });
  useEffect(() => { pendingFocusStream.current = focusStream ?? null; }, [focusStream]);

  const patch = useCallback((id: string, change: TabPatch) => {
    setTabStates((prev) => {
      const current = prev.get(id) ?? INITIAL_TAB_STATE;
      const delta = typeof change === 'function' ? change(current) : change;
      if (delta === null) return prev;
      const next = new Map(prev);
      const merged = { ...current, ...delta };
      // A banner set (or replaced) advances the slot's sequence; clearing it does not.
      next.set(id, 'banner' in delta && delta.banner ? { ...merged, bannerSeq: current.bannerSeq + 1 } : merged);
      return next;
    });
  }, []);
  const auditOf = (id: string): AuditBuffer => { let a = audits.current.get(id); if (!a) { a = new AuditBuffer(); audits.current.set(id, a); } return a; };
  const submitAudit = (id: string, entries: readonly AuditEntry[]) => { for (const e of entries) latest.current.actions.audit(id, e); };

  // REQ-SHELL-084: the tick — every tab's header, tab creation and relabelling, coalesced; stopped while hidden.
  // REQ-SHELL-091's exit effects and REQ-SHELL-085's bring-forward and initial focus are applied on it too.
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const tick = () => {
      const summaries = summarise(streams.list());
      for (const t of summaries) {
        if (lastRunning.current.get(t.id) === true && !t.running) {
          // Exited: disarm, the exit notice once, the read-only banner re-enabled by the state change.
          patch(t.id, (s) => ({ armed: false, readOnlySpent: false, banner: s.exitedShown ? s.banner : BANNERS.exited(outcomeLabel(t.meta)), exitedShown: true }));
        } else if (lastRunning.current.get(t.id) === false && t.running) {
          // Part AL2 (defect AL2-4): the agent's next command re-opened the same stream — the exit notice leaves the slot,
          // and the once-per-lifetime notices are re-enabled by the exited state changing (REQ-SHELL-090/091).
          patch(t.id, (s) => ({ readOnlySpent: false, exitedShown: false, banner: s.banner?.title === 'Process exited' ? null : s.banner }));
        }
        lastRunning.current.set(t.id, t.running);
      }
      for (const id of [...lastRunning.current.keys()]) if (!streams.has(id)) { lastRunning.current.delete(id); audits.current.delete(id); }
      setTabs(summaries);
      const wanted = pendingFocusStream.current;
      setFront((current) => {
        if (wanted !== null && summaries.some((t) => t.id === wanted)) { pendingFocusStream.current = null; return wanted; }
        return current !== null && summaries.some((t) => t.id === current) ? current : (summaries[0]?.id ?? null);
      });
      setTicks((n) => n + 1);
    };
    const start = () => { if (timer === null) { timer = setInterval(tick, tickMs); tick(); } };
    const stop = () => { if (timer !== null) { clearInterval(timer); timer = null; } };
    const onVisibility = () => { if (document.visibilityState === 'hidden') stop(); else start(); };
    if (document.visibilityState !== 'hidden') start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => { stop(); document.removeEventListener('visibilitychange', onVisibility); };
  }, [streams, tickMs, patch]);

  // REQ-SHELL-085: on show, initial focus goes to take-control when enabled and unarmed, otherwise to the grid. Runs
  // after the commit that drew the first tab, so the button exists; a DOM focus only, no state.
  useEffect(() => {
    if (initialFocusDone.current || tabs.length === 0) return;
    initialFocusDone.current = true;
    const first = tabs[0]!;
    const button = takeControlButton.current;
    if (button && !button.disabled && !(tabStates.get(first.id)?.armed ?? false)) button.focus();
    else first.view.focus();
  }, [tabs, tabStates]);

  const refused = (id: string, attempt: Attempt) => patch(id, { banner: BANNERS.refused(attempt) });
  const settle = (id: string, attempt: Attempt, result: TerminalActionResult) => {
    void result.then((r) => { if (!r.ok) refused(id, attempt); }, () => refused(id, attempt));
  };

  const toggleControl = (id: string) => {
    // The state as last rendered: handlers run after the commit that published it, so this is current.
    const armedNow = latest.current.tabStates.get(id)?.armed ?? false;
    if (!armedNow) {
      // REQ-SHELL-089: arming records the audit action, shows the persistent warning, focuses the grid.
      submitAudit(id, auditOf(id).tookControl());
      patch(id, (s) => ({ armed: true, readOnlySpent: false, banner: BANNERS.control(), focusRequest: s.focusRequest + 1 }));
    } else {
      submitAudit(id, auditOf(id).releasedControl());
      // Releasing clears the banner unless a process-exit notice occupies the slot.
      patch(id, (s) => ({ armed: false, readOnlySpent: false, banner: s.banner?.title === 'Process exited' ? s.banner : null }));
    }
  };
  // REQ-SHELL-090: once per tab lifetime, re-enabled when the armed or exited state changes.
  const rejectedInput = (id: string) => patch(id, (s) => (s.readOnlySpent ? null : { readOnlySpent: true, banner: BANNERS.readOnly() }));
  const sendKey = (id: string, key: EncodedKey) => {
    submitAudit(id, auditOf(id).onKey(key));
    settle(id, describeKey(key) as Attempt, latest.current.actions.sendKeys(id, [key]));
  };
  const interrupt = (id: string) => { submitAudit(id, auditOf(id).control('C-c')); settle(id, 'interrupt the command', latest.current.actions.interrupt(id)); };
  const endInput = (id: string) => { submitAudit(id, auditOf(id).control('C-d')); settle(id, "end the command's input", latest.current.actions.endInput(id)); };
  const kill = (id: string) => { submitAudit(id, auditOf(id).kill()); settle(id, 'kill the process', latest.current.actions.kill(id)); };
  const reportCopy = (id: string, outcome: CopyOutcome) => {
    const { acknowledge: ack, clipboard: clip } = latest.current;
    if (!outcome.ok) {
      // REQ-SHELL-101: an empty-selection copy puts nothing on the clipboard and REPORTS failure.
      if (ack) ack('fail', 'Nothing copied', outcome.reason);
      else patch(id, { banner: { severity: 'warning', title: 'Nothing copied', body: outcome.reason } });
      return;
    }
    void clip(outcome.text).then(
      () => ack?.('ok', 'Copied terminal output'),
      () => { if (ack) ack('fail', 'Nothing copied', 'The platform refused the clipboard.'); else patch(id, { banner: { severity: 'warning', title: 'Nothing copied', body: 'The platform refused the clipboard.' } }); },
    );
  };
  const copyAll = (id: string, view: TerminalView) => reportCopy(id, copyText(view.allText(), NOTHING_TO_COPY));
  const geometry = (id: string, g: GridGeometry) => { void latest.current.actions.resize(id, g.cols, g.rows); };

  const frontTab = tabs.find((t) => t.id === front) ?? null;
  const frontState = frontTab ? (tabStates.get(frontTab.id) ?? INITIAL_TAB_STATE) : INITIAL_TAB_STATE;
  const empty = tabs.length === 0;
  return (
    <div className="term-window" data-testid="term-window" data-ticks={ticks} data-tabs={tabs.length} data-front={front ?? ''}>
      {empty ? (
        // REQ-SHELL-083: the empty state; the tabs are hidden while it shows.
        <div className="term-empty" data-testid="term-empty">
          <DesignEmptyState className="empty-state term-empty__block">
            <span className="empty-state-title">{EMPTY_STATE.title}</span>
            <span className="empty-state-hint">{EMPTY_STATE.body}</span>
            <DesignButton type="button" className="btn btn-primary" onClick={onGoToWorkspace} data-testid="term-go-to-workspace">{EMPTY_STATE.action}</DesignButton>
          </DesignEmptyState>
        </div>
      ) : (
        <>
          <div className="tabs term-window__tabs" role="tablist" aria-label={TABLIST_NAME} data-testid="term-tablist">
            {tabs.map((t) => (
              <DesignButton
                key={t.id}
                type="button"
                role="tab"
                className={`tab term-window__tab${t.id === front ? ' is-active' : ''}`}
                aria-selected={t.id === front}
                title={t.tooltip}
                data-stream-id={t.id}
                data-running={t.running}
                data-testid="term-tab-button"
                onClick={() => setFront(t.id)}
              >
                <span className={`status-dot term-window__tab-dot${t.running ? ' is-pulsing' : ''}`} data-state={t.running ? 'running' : 'idle'} aria-hidden="true" />
                <span className="term-window__tab-label mono">{t.label}</span>
              </DesignButton>
            ))}
          </div>
          {frontTab && (
            <div role="tabpanel" className="term-window__panel" aria-label={frontTab.tooltip}>
              <TerminalTab
                key={frontTab.id}
                meta={frontTab.meta}
                view={frontTab.view}
                state={frontState}
                onToggleControl={() => toggleControl(frontTab.id)}
                onInterrupt={() => interrupt(frontTab.id)}
                onEndInput={() => endInput(frontTab.id)}
                onKill={() => kill(frontTab.id)}
                onCopyAll={() => copyAll(frontTab.id, frontTab.view)}
                onKey={(key) => sendKey(frontTab.id, key)}
                onRejectedInput={() => rejectedInput(frontTab.id)}
                onCopy={(outcome) => reportCopy(frontTab.id, outcome)}
                onGeometry={(g) => geometry(frontTab.id, g)}
                onBannerAction={() => { if (!frontState.armed && frontTab.running) toggleControl(frontTab.id); }}
                registerTakeControl={(element) => { takeControlButton.current = element; }}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import type { PromptsRootsResult } from '@rotaris/contracts';
import { ConfirmDialog } from '../ConfirmDialog.js';
import type { RunState } from '../composer.js';
import { NO_RUN_ACTIVE, TRANSCRIPT_EMPTY } from './catalogue.js';
import { bindChatControls, chatControls, CLEAR_DESCRIPTION, CLEAR_DIALOG_BODY, CLEAR_DIALOG_CONFIRM, CLEAR_DIALOG_IMPACT, CLEAR_DIALOG_TITLE, CLEAR_LABEL, compressNow, NOTHING_TO_COMPRESS_TOAST, TRANSCRIPT_ALREADY_EMPTY_TOAST, type ChatAcknowledger, type ControlAnswer } from './host.js';
import { readPromptRoots, registerPromptCommands } from './prompts.js';
import type { Availability, SlashContext, SlashOutcome, SlashRegistry } from './types.js';

/**
 * Part AO — the transcript toolbar's "Clear transcript" (REQ-CHAT-073/082/083/084), its dialog, the binding of the
 * chat-controls host (`host.ts` says why it is module-level), the re-registration of `/compress` and `/clear` over
 * the built-ins so both take this flow, and the prompt-file commands' registration (REQ-CHAT-160). Mounted in AN's
 * `slot:clear` in `WorkspaceView`, from whose closure every input below comes.
 */
export interface ClearTranscriptControlProps {
  readonly runState: RunState;
  readonly rowCount: number;
  /** The host's `slash.control`, as `WorkspaceView` was given it; absent means neither control can dispatch. */
  readonly control?: ((op: 'forceCompression' | 'clearTranscript') => Promise<{ ok: true; value?: string } | { ok: false; reason: string }>) | undefined;
  readonly onAcknowledge?: ChatAcknowledger | undefined;
  /** The catalogue's registry, so `/compress` and `/clear` route through this flow and the prompt files register. */
  readonly registry: SlashRegistry;
  /** REQ-CHAT-028/160: a value that changes on a configuration change — the roots are read again when it does. */
  readonly configKey: unknown;
  readonly onError?: ((reason: string) => void) | undefined;
}

/**
 * Drawn as the design draws the toolbar's other control (Part X's stash opener): a compact ghost text button on the
 * transcript toolbar's line, no container of its own — the mockup's transcript column header carries its actions as a
 * row of quiet controls after the run tag (`docs/design/README.md` §7), each an icon with a tooltip; the product draws
 * this row's controls as text since Part X's stash opener (the icon font exists — `ph ph-*` — and is not the reason), the
 * label is the specification's, and REQ-CHAT-082 fixes the accessible description.
 */
export function ClearTranscriptControl({ runState, rowCount, control, onAcknowledge, registry, configKey, onError }: ClearTranscriptControlProps) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const acknowledge: ChatAcknowledger = onAcknowledge ?? (() => undefined);
  const latest = useRef({ runState, rowCount, control, acknowledge });
  // The newest props, read by the host's getters and the deferred handlers; written after every render, never during one.
  useEffect(() => { latest.current = { runState, rowCount, control, acknowledge }; });
  const dispatch = async (op: 'forceCompression' | 'clearTranscript'): Promise<ControlAnswer> => {
    const c = latest.current.control;
    if (!c) return { ok: false, reason: `/${op === 'forceCompression' ? 'compress' : 'clear'} is not available right now.` };
    try { const r = await c(op); return r.ok ? { ok: true } : { ok: false, reason: r.reason }; }
    catch (cause) { return { ok: false, reason: cause instanceof Error ? cause.message : String(cause) }; }
  };
  const requestClear = () => {
    // REQ-CHAT-082: with an empty transcript the flow only toasts — reachable when the transcript emptied between
    // the moment the control was offered and the moment it was activated (REQ-CHAT-030's own note).
    if (latest.current.rowCount === 0) { latest.current.acknowledge('info', TRANSCRIPT_ALREADY_EMPTY_TOAST); return; }
    setConfirming(true);
  };
  const confirmClear = async () => {
    setBusy(true);
    const r = await dispatch('clearTranscript');
    setBusy(false);
    setConfirming(false);
    // The run host raised the outcome — "Transcript cleared." or the failure notice — from the process that knows which;
    // a refusal here carries the renderer helper's own wording and goes to the composer's line, never invented here.
    if (!r.ok) onError?.(r.reason);
  };
  // The host: bound once; every read goes through `latest`, so the header and the palette see the current state.
  useEffect(() => {
    bindChatControls({
      get runState() { return latest.current.runState; },
      get rowCount() { return latest.current.rowCount; },
      noRunReason: NO_RUN_ACTIVE,
      compress: () => dispatch('forceCompression'),
      requestClear,
      acknowledge: (kind, title, body) => latest.current.acknowledge(kind, title, body),
    });
    return () => bindChatControls(null);
  }, []);
  /**
   * REQ-CHAT-029/030/082 — `/compress` and `/clear` re-registered over the built-ins (REQ-CHAT-022: same name, same
   * place, replaced), so both take THIS flow: `/clear` opens REQ-CHAT-083's dialog rather than clearing outright, and
   * `/compress` toasts its start and reports a refusal with the reason. Their descriptions and gating are the
   * built-ins' (REQ-CHAT-029/030). Registered after the memo that built the registry, as Part AN's handoff foresaw.
   */
  useEffect(() => {
    const whileRunning = (ctx: SlashContext): Availability => (ctx.runState === 'running' ? { ok: true } : { ok: false, reason: NO_RUN_ACTIVE });
    const whileRows = (ctx: SlashContext): Availability => (ctx.rowCount > 0 ? { ok: true } : { ok: false, reason: TRANSCRIPT_EMPTY });
    registry.register({
      name: 'compress', description: 'Compress agent context', kind: 'action', availability: whileRunning,
      run: async (): Promise<SlashOutcome> => { const host = chatControls(); if (host === null) return { kind: 'failed', message: NOTHING_TO_COMPRESS_TOAST }; const r = await compressNow(host); return r.ok ? { kind: 'executed' } : { kind: 'failed', message: r.reason }; },
    });
    registry.register({
      name: 'clear', description: 'Clear the transcript', kind: 'action', availability: whileRows,
      // REQ-CHAT-083: the dialog is the command's act; declining does nothing, which the outcome need not report.
      run: async (): Promise<SlashOutcome> => { chatControls()?.requestClear(); return { kind: 'executed' }; },
    });
  }, [registry]);
  /**
   * REQ-CHAT-160 / REQ-CHAT-028: the prompt files, read through the renderer's reader when the composer takes focus
   * and when the configuration changes (`configKey` is derived from the snapshot every `config:changed` repopulates),
   * and registered on the catalogue's registry after the built-ins so a taken name stays with its holder. A registry
   * rebuilt by its memo starts without them, so the last result is re-applied to the new registry at once. The popup's
   * list is a memo of the text and the registry, so a file added while the popup is open shows at the next keystroke.
   */
  const lastRoots = useRef<PromptsRootsResult | null>(null);
  const registered = useRef(new Set<string>());
  const apply = (result: PromptsRootsResult) => {
    const r = registerPromptCommands(registry, result, registered.current);
    registered.current = new Set(r.names);
  };
  const reload = () => {
    const p = readPromptRoots();
    if (p === null) return;
    void p.then((result) => { lastRoots.current = result; apply(result); }, () => undefined);
  };
  /**
   * Defect AO-1 (the proof's first launch): the catalogue's registry is rebuilt by its memo several times while the window
   * settles (the stash count, the reachable set and the command context each arrive once), and this effect READ THE DISK on
   * every rebuild — five root reads in the first 200 ms, each an IPC round trip and three directory listings. A rebuild
   * only needs the LAST result re-applied to the new registry; the disk is read on focus, on a configuration change and
   * once when no result exists yet.
   */
  useEffect(() => { registered.current = new Set(); if (lastRoots.current !== null) apply(lastRoots.current); else reload(); }, [registry]); // eslint-disable-line react-hooks/exhaustive-deps -- `apply`/`reload` close over refs.
  useEffect(() => { reload(); }, [configKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    // The composer's `onFocus` is not this part's to add; the focus is observed as it bubbles.
    const onFocus = (e: FocusEvent) => { if (e.target instanceof HTMLElement && e.target.classList.contains('composer__input')) reload(); };
    document.addEventListener('focusin', onFocus);
    return () => document.removeEventListener('focusin', onFocus);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const empty = rowCount === 0;
  return (
    <>
      <button type="button" className="btn btn-ghost btn-compact" data-testid="transcript-clear" aria-label={CLEAR_LABEL}
        // REQ-CHAT-073: disabled on an empty transcript; REQ-CHAT-082: the accessible description, verbatim.
        disabled={empty || busy} aria-disabled={empty || busy} aria-describedby="transcript-clear-reason"
        title={empty ? TRANSCRIPT_EMPTY : CLEAR_DESCRIPTION} onClick={requestClear}>{CLEAR_LABEL}</button>
      <span className="visually-hidden" id="transcript-clear-reason">{empty ? TRANSCRIPT_EMPTY : CLEAR_DESCRIPTION}</span>
      {confirming && (
        <ConfirmDialog title={CLEAR_DIALOG_TITLE} body={CLEAR_DIALOG_BODY} lines={[CLEAR_DIALOG_IMPACT]} confirmLabel={CLEAR_DIALOG_CONFIRM} destructive busy={busy} testId="clear-transcript-dialog"
          onCancel={() => { if (!busy) setConfirming(false); }} onConfirm={() => { void confirmClear(); }} />
      )}
    </>
  );
}

import { RUN_AGENT_ID, type CommandOutcome, type CommandRequest, type ImageAttachmentInput, type PauseResolution, type PermissionPreset, type PlanDecision, type QuestionAnswers, type RendererBridge } from '@rotaris/contracts';
import { useShellState } from '@rotaris/ui';

/**
 * SESSION ACTIONS — the gestures a surface makes against the session this window is following.
 *
 * Every one of them was a free function in the renderer's composition root, closed over the module-scope bridge and
 * the module-scope replica, and every one repeats the same three moves: resolve focus to a session id, send one
 * command, and turn anything that is not a success into a sentence a surface can show. Eleven copies of that shape is
 * eleven chances to disagree about which of them wins — and they did disagree, for long enough that a refused
 * `/compress` reported the host's excuse instead of the engine's reason (the note inside `control` is the ruling).
 *
 * They are one module now, made once against two dependencies it is handed rather than two globals it reaches for.
 * That is the whole of the interface: a test hands it a plain object for each and exercises the refusal discipline
 * without a window, a preload or a main process, which is what nothing could do while they were closures.
 *
 * Every answer is `{ ok: true } | { ok: false, reason }` — never a throw, because the caller is a click handler, and
 * never a `CommandOutcome`, because a surface should not have to know the shape main answers in.
 */
export interface SessionActionDeps {
  /** One command in, one outcome out — the preload's, in a window; a recorder, in a test. */
  readonly bridge: Pick<RendererBridge, 'command'>;
  /**
   * Only the two facts these need of the replica: which session this window follows, and how to follow another. The
   * real one (ADR-0043) satisfies it and so does `{ getState: () => ({ sessionId, follow }) }`, which is the point.
   */
  readonly replica: {
    readonly getState: () => { readonly sessionId: string | null; readonly follow: (sessionId: string | null) => void };
  };
}

export function createSessionActions({ bridge, replica }: SessionActionDeps) {
  /**
   * ADR-0019: `bridge.command` rejects when main's handler throws or the channel is gone
   * (`ipcRenderer.invoke`), and every answer of this module is never-throw — so a rejection is a
   * refusal carrying the cause, which the surface shows like any other (R0-2: the isolated start
   * met a rejection as a wedged, emptied, silent composer).
   */
  async function send(req: CommandRequest): Promise<CommandOutcome> {
    try { return await bridge.command(req); }
    catch (cause) { return { ok: false, code: 'command.unreachable', headline: 'The application did not answer', detail: cause instanceof Error ? cause.message : String(cause) }; }
  }
  /**
   * REQ-CHAT-011: no session → start one; a loaded session with no run → record the prompt.
   * REQ-SHELL-125: the launch dialog's accepted choices, held in shell state, ride on the NEXT start and are consumed
   * by it — a refused start keeps them for the retry the composer offers.
   */
  async function submitPrompt(text: string, attachments: readonly ImageAttachmentInput[]): Promise<{ ok: true } | { ok: false; reason: string }> {
    const s = replica.getState();
    if (!s.sessionId) {
      const options = useShellState.getState().launchOptions;
      const r = await send({ kind: 'session.start', prompt: text, ...(attachments.length === 0 ? {} : { attachments: [...attachments] }), ...(options?.isolation ? { isolation: options.isolation } : {}), ...(options?.attach ? { attach: { path: options.attach.path } } : {}), ...(options ? { sandboxMode: options.sandboxMode } : {}) });
      if (!r.ok) return { ok: false, reason: r.detail ?? r.headline };
      useShellState.getState().takeLaunchOptions();
      const { sessionId } = r.value as { sessionId: string };
      replica.getState().follow(sessionId);
      // Every attach begins with a whole-session update (REQ-MONITOR-214); the transcript follows it.
      const sub = await send({ kind: 'session.subscribe', sessionId });
      if (!sub.ok) return { ok: false, reason: sub.detail ?? sub.headline };
      return { ok: true };
    }
    const r = await send({ kind: 'session.prompt', sessionId: s.sessionId, prompt: text, ...(attachments.length === 0 ? {} : { attachments: [...attachments] }) });
    return r.ok ? { ok: true } : { ok: false, reason: r.detail ?? r.headline };
  }

  /**
   * REQ-SESSION-186 / ADR-0013: the stop control — graceful, and forced on a second activation. The shell resolves focus
   * to a session id, then sends the control. PD-ORCH-005 clause 3: a stop brings the run to rest, and its unfinished
   * agents resume when the session is continued, so it is never the cancel below (OQ-69).
   */
  async function stopRun(force: boolean): Promise<{ ok: true } | { ok: false; reason: string }> {
    const sessionId = replica.getState().sessionId;
    if (!sessionId) return { ok: false, reason: 'No run is active.' };
    const r = await send({ kind: 'session.control', request: { op: 'cancel', sessionId, args: { force } } });
    if (!r.ok) return { ok: false, reason: r.detail ?? r.headline };
    const result = r.value as { ok: boolean };
    return result.ok ? { ok: true } : { ok: false, reason: 'The run is no longer cancellable.' };
  }

  /** REQ-TOOLS-077 / REQ-MONITOR-150: the mode change goes to the focused session; the run decides what actually happened. */
  async function setMode(mode: PermissionPreset): Promise<{ ok: true } | { ok: false; reason: string }> {
    // REQ-CONFIG-288 / ADR-0037 ESC-1: the composer's control writes ITS key through the scoped per-field path, nothing else; refused loudly when the file cannot be read (REQ-CONFIG-442).
    const written = await send({ kind: 'config.setField', patch: { runtime: { permission_mode: mode } } });
    if (!written.ok) return { ok: false, reason: written.detail ?? written.headline };
    const sessionId = replica.getState().sessionId;
    if (!sessionId) return { ok: true };
    const r = await send({ kind: 'session.control', request: { op: 'setPermissionMode', sessionId, args: { mode } } });
    if (!r.ok) return { ok: false, reason: r.detail ?? r.headline };
    return (r.value as { ok: boolean }).ok ? { ok: true } : { ok: false, reason: 'The run did not accept the mode change.' };
  }

  /**
   * REQ-MONITOR-126/127 and REQ-MONITOR-009: the confirmed cancel of the whole run, sent as the cancellation of the
   * reserved run id. PD-ORCH-005 clause 3 keeps it final — every agent ends `cancelled` and none is resumed — which is
   * what tells it apart from the stop above (OQ-69). A refusal says the run is no longer cancellable (REQ-MONITOR-127).
   */
  async function cancelRun(): Promise<{ ok: true } | { ok: false; reason: string }> {
    const sessionId = replica.getState().sessionId;
    if (!sessionId) return { ok: false, reason: 'No run is active.' };
    const r = await send({ kind: 'session.control', request: { op: 'cancelAgent', sessionId, args: { agentId: RUN_AGENT_ID } } });
    if (!r.ok) return { ok: false, reason: r.detail ?? r.headline };
    return (r.value as { ok: boolean }).ok ? { ok: true } : { ok: false, reason: 'The run is no longer cancellable.' };
  }

  /** REQ-MONITOR-009: cancel one child; the shell resolves the session, the run decides. */
  async function cancelAgent(agentId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
    const sessionId = replica.getState().sessionId;
    if (!sessionId) return { ok: false, reason: 'No run is active.' };
    const r = await send({ kind: 'session.control', request: { op: 'cancelAgent', sessionId, args: { agentId } } });
    if (!r.ok) return { ok: false, reason: r.detail ?? r.headline };
    return (r.value as { ok: boolean }).ok ? { ok: true } : { ok: false, reason: 'That agent is not cancellable (unknown, or already finished).' };
  }

  /** ADR-0010 channel 1: one control against the focused session, `false` named as a refusal (REQ-MONITOR-006). */
  async function control(op: Parameters<typeof bridge.command>[0] extends infer R ? R extends { kind: 'session.control'; request: { op: infer O } } ? O : never : never, args: Record<string, string | number | boolean | null>, refusal: string): Promise<{ ok: true; value?: string } | { ok: false; reason: string }> {
    const sessionId = replica.getState().sessionId;
    if (!sessionId) return { ok: false, reason: 'No run is active.' };
    const r = await send({ kind: 'session.control', request: { op, sessionId, args } });
    if (!r.ok) return { ok: false, reason: r.detail ?? r.headline };
    // A refusal carries the ENGINE's words; the caller's sentence is only the fallback for a reply that states none.
    // `ControlResult` has carried `refusal` since Part AC and this helper discarded it, substituting the caller's string.
    // Harmless while the ops it names were unimplemented, and a lie the moment Part AO armed them: a `/compress` the
    // engine refused because no agent context was live reported that the host "does not support forceCompression yet".
    // Part AO saw this and raised it as a ruling request rather than widen a file it did not own (the note beside
    // `ControlRefusalSchema` in `contracts/src/control.ts`); the ruling, at merge 2, is to prefer the engine's message.
    const v = r.value as { ok: boolean; value?: string; refusal?: { code?: string; message?: string } };
    return v.ok ? { ok: true, ...(v.value === undefined ? {} : { value: v.value }) } : { ok: false, reason: v.refusal?.message ?? refusal };
  }

  /**
   * Part AC — REQ-CHAT-101/102: every step's answer in ONE control request. The answers map REQ-CHAT-095 fixes is a
   * record of records and `ControlRequestSchema`'s value space is not (REQ-MONITOR-013 limits arguments to text,
   * numbers, booleans and simple collections of those), so it crosses as two flat maps keyed by step id and is
   * recombined in `Sessions.control`. `delivered` is false unless a waiting call actually took the answers — which is
   * exactly what REQ-CHAT-102 turns into "the modal stays open", so it is never softened into an optimistic true.
   */
  async function answerQuestions(requestId: string, answers: QuestionAnswers): Promise<{ delivered: boolean }> {
    const sessionId = replica.getState().sessionId;
    if (!sessionId) return { delivered: false };
    const selected: Record<string, string | null> = {};
    const freeform: Record<string, string | null> = {};
    for (const [id, a] of Object.entries(answers)) { selected[id] = a.selected_option; freeform[id] = a.freeform_text; }
    const r = await send({ kind: 'session.control', request: { op: 'answerQuestion', sessionId, args: { requestId, selected, freeform } } });
    return { delivered: r.ok && (r.value as { ok: boolean }).ok };
  }

  /** REQ-CHAT-101: cancellation, forwarded to the waiting tool call, which the stepper emits exactly once. */
  function cancelQuestions(requestId: string): void {
    const sessionId = replica.getState().sessionId;
    if (!sessionId) return;
    void send({ kind: 'session.control', request: { op: 'cancelQuestions', sessionId, args: { requestId } } });
  }

  /**
   * REQ-SESSION-110 / REQ-MONITOR-125: continue the focused session, or resolve its pause. PD-ORCH-005 clause 6: the
   * agents a rest left paused resume, unless `withoutPaused` asks to continue without them.
   */
  async function continueSession(action: PauseResolution = 'continue', opts: { readonly withoutPaused?: boolean } = {}): Promise<{ ok: true } | { ok: false; reason: string }> {
    const sessionId = replica.getState().sessionId;
    if (!sessionId) return { ok: false, reason: 'No session is loaded.' };
    const r = await send({ kind: 'session.continue', sessionId, action, ...(opts.withoutPaused === true ? { withoutPaused: true } : {}) });
    return r.ok ? { ok: true } : { ok: false, reason: r.detail ?? r.headline };
  }

  /**
   * REQ-ORCH-154: the user's text over the plan awaiting a decision. It approves nothing — main forwards it to the
   * run host, which records it against the pending cycle and leaves the gate exactly where it was.
   */
  async function planEdit(text: string): Promise<{ ok: true } | { ok: false; reason: string }> {
    const sessionId = replica.getState().sessionId;
    if (!sessionId) return { ok: false, reason: 'No session is loaded.' };
    const r = await send({ kind: 'session.planEdit', sessionId, text });
    return r.ok ? { ok: true } : { ok: false, reason: r.detail ?? r.headline };
  }

  /** REQ-ORCH-153: one of exactly three answers, with the changes `revise` hands to the next cycle. */
  async function planDecision(decision: PlanDecision, changes: string): Promise<{ ok: true } | { ok: false; reason: string }> {
    const sessionId = replica.getState().sessionId;
    if (!sessionId) return { ok: false, reason: 'No session is loaded.' };
    const r = await send({ kind: 'session.planDecision', sessionId, decision, changes });
    return r.ok ? { ok: true } : { ok: false, reason: r.detail ?? r.headline };
  }

  /**
   * REQ-ORCH-152 / REQ-CONFIG-476 / ADR-0037 ESC-1: the run-start mode written through the scoped per-field path,
   * the same one the permission-mode chip uses. The composer's control and the start dialog's both come here, so
   * there is one key and no surface holds a mode of its own.
   *
   * PD-ORCH-003: choosing `plan` on a session an approval already released also RE-ARMS that session. The two are
   * one gesture because they are one intention — a user asking for `plan` on a released session is asking to be
   * shown the next plan, and writing only the key would leave the chip reading `Plan first` over a run that still
   * would not be held. The re-arm is sent second and its failure is reported: the mode is the durable half, and a
   * silent success over a gate that did not re-arm is the one outcome this directive exists to prevent. Choosing
   * `auto` re-arms nothing — it is the setting saying no gate is wanted at all.
   */
  async function setRunStartMode(mode: 'auto' | 'plan'): Promise<{ ok: true } | { ok: false; reason: string }> {
    const written = await send({ kind: 'config.setField', patch: { runtime: { run_start_mode: mode } } });
    if (!written.ok) return { ok: false, reason: written.detail ?? written.headline };
    if (mode !== 'plan') return { ok: true };
    const sessionId = replica.getState().sessionId;
    if (!sessionId) return { ok: true };
    const rearmed = await send({ kind: 'session.planRearm', sessionId });
    return rearmed.ok ? { ok: true } : { ok: false, reason: rearmed.detail ?? rearmed.headline };
  }

  return { answerQuestions, cancelAgent, cancelQuestions, cancelRun, continueSession, control, planDecision, planEdit, setMode, setRunStartMode, stopRun, submitPrompt };
}

import { z } from 'zod';
import { ControlRequestSchema } from './control.js';

/**
 * Channel 5: request/response. Every command returns an explicit outcome
 * value rather than throwing across the boundary, because REQ-NOTIFY-005
 * needs a headline and a detail block, which is a value (ADR-0044).
 *
 * The reconcile of REQ-MONITOR-226, the subscribe/unsubscribe of
 * REQ-SHELL-151 and the page-older-rows of REQ-SESSION-192 are all commands.
 * No sixth channel exists for reconciliation: the response is ordinary
 * traffic on channels 1 and 2.
 */
export const CommandOutcomeSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), value: z.unknown().optional() }),
  z.object({ ok: z.literal(false), code: z.string(), headline: z.string(), detail: z.string().optional() }),
]);
export type CommandOutcome = z.infer<typeof CommandOutcomeSchema>;

export const CommandRequestSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('shell.hello') }),
  /** REQ-CHAT-011: a submission with no session starts one; the text becomes row 0, kind `user`. */
  z.object({ kind: z.literal('session.start'), prompt: z.string().min(1) }),
  /** REQ-CHAT-011 again for a loaded session with no active run: append the user row. */
  z.object({ kind: z.literal('session.prompt'), sessionId: z.string(), prompt: z.string().min(1) }),
  /** Begin following: every attach starts with a whole-session update (REQ-MONITOR-214). */
  z.object({ kind: z.literal('session.subscribe'), sessionId: z.string() }),
  z.object({ kind: z.literal('session.unsubscribe'), sessionId: z.string() }),
  z.object({ kind: z.literal('session.reconcile'), sessionId: z.string() }),
  z.object({ kind: z.literal('session.pageOlder'), sessionId: z.string(), beforeIndex: z.number().int() }),
  /** ADR-0010 channel 1 over channel 5: the shell resolves focus to a session id before sending (ADR-0013). */
  z.object({ kind: z.literal('session.control'), request: ControlRequestSchema }),
  z.object({ kind: z.literal('notice.acknowledge'), noticeId: z.number().int() }),
  /** REQ-SESSION-201: main supplies the dialogs and nothing else; the work runs in the workspace service (ADR-0002 c.7). */
  z.object({ kind: z.literal('workspace.backup') }),
  z.object({ kind: z.literal('workspace.restore') }),
  z.object({ kind: z.literal('shell.switchView'), view: z.string() }),
]);
export type CommandRequest = z.infer<typeof CommandRequestSchema>;
export type CommandKind = CommandRequest['kind'];

/** The one frozen namespace the preload exposes (ADR-0044): an explicit method list, nothing else. */
export interface RendererBridge {
  readonly command: (req: CommandRequest) => Promise<CommandOutcome>;
  readonly onTranscriptIncrement: (fn: (p: unknown) => void) => () => void;
  readonly onSessionSnapshot: (fn: (p: unknown) => void) => () => void;
  readonly onTerminalFrame: (fn: (p: unknown) => void) => () => void;
  readonly onNotice: (fn: (p: unknown) => void) => () => void;
}
export const BRIDGE_KEY = 'rotaris' as const;

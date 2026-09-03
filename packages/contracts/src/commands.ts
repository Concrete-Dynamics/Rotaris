import { z } from 'zod';

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
  z.object({ kind: z.literal('session.subscribe'), sessionId: z.string() }),
  z.object({ kind: z.literal('session.unsubscribe'), sessionId: z.string() }),
  z.object({ kind: z.literal('session.reconcile'), sessionId: z.string() }),
  z.object({ kind: z.literal('session.pageOlder'), sessionId: z.string(), beforeIndex: z.number().int() }),
  z.object({ kind: z.literal('notice.acknowledge'), noticeId: z.number().int() }),
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

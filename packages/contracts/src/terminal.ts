import { z } from 'zod';
import type { EncodedKey, NamedKey } from './terminal-keys.js';

/**
 * Part AL — the live terminal's contract (ADR-0021 first executed; ADR-0020 for the PTY beneath it).
 *
 * A STREAM is one live terminal the run host holds a headless emulator for: an agent's foreground PTY
 * (`fg:<agent>`) or a background session (`bg:<ts_id>`, REQ-TOOLS-107/127). Its frames travel on channel 3
 * (`TerminalFrameSchema`, channels.ts) with a per-stream monotonic `seq` (REQ-SHELL-104); its metadata is
 * `TerminalStreamMeta` below, carried on every `meta` frame and answered by `terminal.streams`. Control
 * traffic runs the other way as the `terminal.*` commands (REQ-TOOLS-128, REQ-SHELL-106/107).
 *
 * The seam's spelling (plan §"The seams, in full", T) is kept field for field, with ONE deviation stated
 * here and in the handoff: the command discriminator is `kind`, not `name`, because `CommandRequestSchema`
 * is `z.discriminatedUnion('kind', …)` and a second discriminator cannot be spread into it.
 */
export const TERMINAL_STREAM_KINDS = ['agent', 'background'] as const;
export type TerminalStreamKind = (typeof TERMINAL_STREAM_KINDS)[number];

export const TerminalStreamMetaSchema = z.object({
  streamId: z.string().min(1),
  sessionId: z.string().min(1),
  agentId: z.string().optional(),
  /** background = `bg:<id>` (REQ-TOOLS-127). */
  kind: z.enum(TERMINAL_STREAM_KINDS),
  /** persona name, or "Background session <id elided to 12>", or "Terminal" (REQ-SHELL-082). */
  displayName: z.string(),
  command: z.string().optional(),
  running: z.boolean(),
  exitCode: z.number().int().optional(),
  /** REQ-TOOLS-128 / REQ-SHELL-087: earlier output was dropped from the retained screen. */
  truncated: z.boolean(),
  cols: z.number().int().positive(),
  rows: z.number().int().positive(),
  /** REQ-SHELL-106: whether input can be taken at all drives control enablement. */
  acceptsInput: z.boolean(),
  canKill: z.boolean(),
});
export type TerminalStreamMeta = z.infer<typeof TerminalStreamMetaSchema>;

/** Why a control was refused (REQ-SHELL-094/106); the renderer words the banner. */
export const TERMINAL_REFUSALS = ['ended', 'unknown-stream', 'no-kill-capability', 'streaming-disabled'] as const;
export type TerminalRefusal = (typeof TERMINAL_REFUSALS)[number];

/** REQ-SHELL-107: the audit entry kinds a renderer may submit; the run host words and redacts the line. */
export const TERMINAL_AUDIT_KINDS = ['line', 'control', 'took-control', 'released-control', 'kill'] as const;
export type TerminalAuditKind = (typeof TERMINAL_AUDIT_KINDS)[number];

const NamedKeySchema = z.string().min(1) as unknown as z.ZodType<NamedKey>;
const EncodedKeySchema: z.ZodType<EncodedKey> = z.union([
  z.object({ kind: z.literal('text'), text: z.string() }),
  z.object({ kind: z.literal('named'), key: NamedKeySchema }),
]);

/**
 * The seven `terminal.*` commands (channel 5), spread into `CommandRequestSchema` under the Part AL banner.
 *  - `terminal.streams`  → `TerminalStreamMeta[]`; the run host also republishes one `screen` frame per stream so a
 *                          late attacher is given the output accumulated so far (REQ-SHELL-104, ADR-0021's resync).
 *  - `terminal.sendKeys` → ok, or a `TerminalRefusal` as the outcome code `terminal.<refusal>`.
 *  - `terminal.resize`   → the emulated screen always, the PTY when there is one (REQ-SHELL-106).
 *  - `terminal.interrupt` / `terminal.endInput` / `terminal.kill` (REQ-SHELL-093, REQ-TOOLS-128).
 *  - `terminal.audit`    → REQ-SHELL-107's entry, written by the run host through the session writer, redacted.
 */
export const TERMINAL_COMMAND_SCHEMAS = [
  z.object({ kind: z.literal('terminal.streams'), sessionId: z.string().min(1) }),
  z.object({ kind: z.literal('terminal.sendKeys'), streamId: z.string().min(1), keys: z.array(EncodedKeySchema) }),
  z.object({ kind: z.literal('terminal.resize'), streamId: z.string().min(1), cols: z.number().int().min(1).max(1000), rows: z.number().int().min(1).max(1000) }),
  z.object({ kind: z.literal('terminal.interrupt'), streamId: z.string().min(1) }),
  z.object({ kind: z.literal('terminal.endInput'), streamId: z.string().min(1) }),
  z.object({ kind: z.literal('terminal.kill'), streamId: z.string().min(1) }),
  z.object({ kind: z.literal('terminal.audit'), streamId: z.string().min(1), entry: z.object({ kind: z.enum(TERMINAL_AUDIT_KINDS), text: z.string().optional() }) }),
] as const;
export type TerminalCommand = z.infer<(typeof TERMINAL_COMMAND_SCHEMAS)[number]>;
export type TerminalCommandKind = TerminalCommand['kind'];
export const TERMINAL_COMMAND_KINDS: readonly TerminalCommandKind[] = ['terminal.streams', 'terminal.sendKeys', 'terminal.resize', 'terminal.interrupt', 'terminal.endInput', 'terminal.kill', 'terminal.audit'];
export function isTerminalCommand(kind: string): kind is TerminalCommandKind {
  return (TERMINAL_COMMAND_KINDS as readonly string[]).includes(kind);
}

/**
 * ADR-0021 "The cap is load-bearing": the coalescing floor. A keystroke-armed flush never fires within 20 ms of the
 * previous frame of its stream, so a stream emits at most 50 frames/s — the figure the relay was measured against.
 * It may not be relaxed without re-measuring (obligation 1).
 */
export const TERMINAL_COALESCE_FLOOR_MS = 20;
/** REQ-MONITOR-306: the aggregate bound at the point frames are delivered to surfaces, counted per window. */
export const TERMINAL_DELIVERY_BOUND_PER_SECOND = 1000;
/** REQ-TOOLS-126's interval range, restated for the one place that clamps a caller-supplied value. */
export const TERMINAL_INTERVAL_RANGE_MS = { min: 20, max: 2000, default: 100 } as const;

/**
 * Stream ids (REQ-TOOLS-127, spec 12 "Terminal stream event model"): `{kind}:{key}`. The foreground key is the
 * agent's identifier — REQ-TOOLS-127's "identifier of the run the command belongs to, or the literal `root`" is READ
 * as the agent the engine keys rows and steering on, whose entry role carries its persona name; recorded as a
 * reading in ADR-0021's first-execution note. ONE rule, shared by the engine (the row) and the tool (the stream).
 */
export function foregroundStreamId(agentId: string): string {
  return `fg:${agentId}`;
}
export function backgroundStreamId(sessionId: string): string {
  return `bg:${sessionId}`;
}
/** REQ-SHELL-082: the display name; a raw id never appears in a label. */
export function streamDisplayName(streamId: string, personaName?: string): string {
  const sep = streamId.indexOf(':');
  if (sep <= 0) return 'Terminal';
  const kind = streamId.slice(0, sep);
  const key = streamId.slice(sep + 1);
  if (kind === 'fg') return personaName ?? (key || 'Terminal');
  if (kind === 'bg') return `Background session ${key.length > 12 ? `${key.slice(0, 12)}…` : key}`;
  return 'Terminal';
}

/**
 * REQ-CHAT-046/063/066/076: the live-terminal stream id a TOOL ROW carries while its call runs. Only a foreground
 * `terminal` command has one (a background start returns at once and its row settles; `is_input`, `reset` alone and
 * the session actions run no command). The engine calls this at append time, before the tool runs, which is why the
 * foreground id has to be deterministic per agent.
 */
export function terminalRowStreamId(toolName: string, argsJson: string, agentId: string): string | undefined {
  if (toolName !== 'terminal') return undefined;
  let a: unknown;
  try { a = JSON.parse(argsJson); } catch { return undefined; }
  if (typeof a !== 'object' || a === null) return undefined;
  const args = a as Record<string, unknown>;
  if (args['background'] === true || args['is_input'] === true) return undefined;
  if (typeof args['session_action'] === 'string' || typeof args['session_id'] === 'string') return undefined;
  if (typeof args['command'] !== 'string' || args['command'] === '') return undefined;
  return foregroundStreamId(agentId);
}

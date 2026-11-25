import { z } from 'zod';
import { FREE_TEXT_MAX, NAME_MAX } from './limits.js';
import { PRESENTATION_STATUSES, STOP_REASONS } from './status.js';

/**
 * THE INBOUND SURFACE — the one MCP server the product serves for external agents, and the two tools on it
 * (ADR-0067; REQ-MCP-119 to REQ-MCP-130). This module holds the shapes that cross a boundary: what the two tools
 * accept, the handle they return, the status vocabulary `rotaris_run_status` answers in, and the narrow asks the
 * listener process makes of main.
 *
 * Three rules this module states rather than leaves to the call sites:
 *
 * 1. **Exactly two tools** (REQ-MCP-123). `INBOUND_TOOL_NAMES` is closed, and `surface.ts` registers from it, so a
 *    third tool is an edit here and nowhere else.
 * 2. **No authority field** (REQ-MCP-124). `rotaris_start_run`'s schema is a `strictObject` holding a prompt alone:
 *    every field that means a stronger execution — `sandboxMode`, `boardPermissions`, `effectiveRoot`, `worktree`,
 *    `runType`, `initialTodo` — and every way of naming a workspace a caller could choose are refused as unknown
 *    keys, never ignored. `INBOUND_FORBIDDEN_FIELDS` is the list a test holds the schema against.
 * 3. **The workspace is main's** (REQ-MCP-120/124). A caller names no workspace: the run starts in the already-open
 *    one, and main constructs the internal start request from its own desktop state.
 */

/*
 * THE SURFACE'S TWO BOUNDS, and the one figure they are derived from (REQ-MCP-123/126, BLOCKER 1 of review 3).
 *
 * A `rotaris_start_run` crosses three processes on its way to a running session: the LISTENER asks main and waits
 * (`ASK_BOUND_MS`), main asks the run host's `session.start` and waits (`INBOUND_START_BOUND_MS`), and the run host may
 * spend `LEASE_ASK_MS` leasing credentials before it answers. If the listener's bound is shorter than main's, a start
 * that main confirms normally but slowly (after the lease, inside main's bound) is answered by the listener's own
 * timeout FIRST — the caller is told the ask failed and the handle later reserved for it is thrown away. The three are
 * therefore ONE chain: each is derived from the figure before it here, so no two can drift apart again.
 */
/** The run host's own worst case before it answers `session.start`: its credential lease (`run-host/leased-credentials.ts`). The one origin of the chain. */
export const INBOUND_HOST_CREDENTIAL_LEASE_MS = 45_000;
/** REQ-MCP-126: how long MAIN waits for the run host's `session.start`, above the host's own credential lease so a healthy-but-slow host is not read as a no-reply. */
export const INBOUND_START_BOUND_MS = INBOUND_HOST_CREDENTIAL_LEASE_MS + 15_000;
/** REQ-MCP-123/124 (BLOCKER 1): how long the LISTENER waits for main's answer, above main's own start bound plus a margin, so a start main confirms normally is delivered to the caller rather than timed out by the listener. */
export const INBOUND_LISTENER_ASK_BOUND_MS = INBOUND_START_BOUND_MS + 30_000;

/** REQ-MCP-123: the surface serves exactly these two tools, and no third. Closed on purpose; the test counts it. */
export const INBOUND_TOOL_NAMES = ['rotaris_start_run', 'rotaris_run_status'] as const;
export type InboundToolName = (typeof INBOUND_TOOL_NAMES)[number];
export function isInboundToolName(name: string): name is InboundToolName {
  return (INBOUND_TOOL_NAMES as readonly string[]).includes(name);
}

/**
 * REQ-MCP-124: the fields a caller SHALL NOT be able to set, each one a way of asking for a stronger execution or for
 * a workspace the caller chose. `rotaris_start_run` carries none of them, and a case that sends one is refused by the
 * strict schema with the key named. The list is written out so a test can assert the schema holds none of them.
 */
export const INBOUND_FORBIDDEN_FIELDS = [
  'sandboxMode', 'boardPermissions', 'effectiveRoot', 'worktree', 'runType', 'initialTodo', 'isolation', 'attach',
  'workspaceId', 'workspace', 'workspaceRoot', 'sessionId',
] as const;

/**
 * REQ-MCP-123/124: what `rotaris_start_run` accepts — a prompt, and nothing else. Strict: an unknown field is refused
 * (`unrecognized_keys`), never stripped, because stripping would silently downgrade a call that asked for authority.
 * `FREE_TEXT_MAX` is OQ-467's bound, read here so the surface names no figure of its own (limits.test.ts walks this).
 */
export const InboundStartRunInputSchema = z.strictObject({
  prompt: z.string().min(1).max(FREE_TEXT_MAX),
});
export type InboundStartRunInput = z.infer<typeof InboundStartRunInputSchema>;

/**
 * REQ-SESSION-080 / REQ-MCP-123: the handle a run started through the surface is named by. The product mints it (it is
 * not the session id a caller could correlate against anything else), the shape is fixed prefix + 32 hex characters,
 * and a value that does not match is not a handle this surface ever handed out.
 */
export const INBOUND_RUN_HANDLE_PATTERN = /^inr_[0-9a-f]{32}$/;
export const InboundRunHandleSchema = z.string().regex(INBOUND_RUN_HANDLE_PATTERN);

/**
 * REQ-MCP-123/130: what `rotaris_run_status` accepts — the handle a start returned, and nothing else. Strict, and the
 * handle is held to the SAME shape the surface mints (`INBOUND_RUN_HANDLE_PATTERN`): a call whose `run` is not such a
 * value is refused at the schema, as a stated refusal, rather than passed on to wait out an IPC bound on a value the
 * surface can already tell was never one of its handles.
 */
export const InboundRunStatusInputSchema = z.strictObject({
  run: InboundRunHandleSchema,
});
export type InboundRunStatusInput = z.infer<typeof InboundRunStatusInputSchema>;

/**
 * REQ-MCP-123/130: the status `rotaris_run_status` answers in — the product's OWN vocabulary, both halves of it:
 * `state` is the presentation status of REQ-NOTIFY-048, `stopReason` the closed set of REQ-MONITOR-301 (null while the
 * run has not stopped). `awaitingInput` (REQ-MCP-125) is the one fact a caller may observe about a run waiting on a
 * person at the desktop: it is derived from the session listing's own `awaitingInput`, and the caller may never answer
 * what it observes. No internal field, no file content, no token: what a surface shows and nothing more.
 */
export const InboundRunStatusSchema = z.object({
  run: InboundRunHandleSchema,
  sessionId: z.string().max(NAME_MAX),
  state: z.enum(PRESENTATION_STATUSES),
  stopReason: z.enum(STOP_REASONS).nullable(),
  /** REQ-MCP-125: true while the run waits for an approval or a question to be answered at the desktop. */
  awaitingInput: z.boolean().optional(),
});
export type InboundRunStatus = z.infer<typeof InboundRunStatusSchema>;

/**
 * REQ-MCP-126 / ADR-0067 point 6: the stated reason a second external request is refused with. One value, so the
 * caller is told what the product's own words say rather than a code it must map.
 */
export const INBOUND_RUN_ALREADY_ACTIVE =
  'A run started through the external surface is already active. This surface starts at most one run at a time and never queues a second; wait for the active run to end and ask again.';

/** REQ-MCP-124: a call on a workspace that is not the open one — never a caller-chosen workspace. */
export const INBOUND_NO_OPEN_WORKSPACE =
  'No workspace is open. This surface starts a run only in the workspace the desktop has open, and a caller cannot choose one.';

/** REQ-MCP-120: the inbound surface's exposure state — what the settings row shows while it is on. */
export const InboundExposureSchema = z.object({
  /** Whether the surface is on for this session. */
  enabled: z.boolean(),
  /** REQ-MCP-119: the ephemeral port the OS chose; null while off (`REQ-MCP-120`: shown while it is on). */
  port: z.number().int().positive().nullable(),
  /**
   * REQ-MCP-121: the per-exposure bearer token, shown ONCE to the user — carried back only on the press that turned the
   * surface on, and on no other answer. It is never written to the application log or a session record.
   */
  token: z.string().min(1).optional(),
});
export type InboundExposure = z.infer<typeof InboundExposureSchema>;

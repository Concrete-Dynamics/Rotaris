import { millis } from '@rotaris/kernel';
import type { ProcessEvent, ProcessReply, RunHostRequest } from '@rotaris/contracts';

/**
 * REQ-MCP-123/125/130 (BLOCKER 3 of the review, 2026-11-25): the surface's STATUS READ, and where the stop reason comes
 * from. `rotaris_run_status` SHALL read the run's state AND stop reason in the product's own vocabulary — the original
 * build set `stopReason: null` unconditionally, so a finished run reported no reason and the surface text even said "the
 * run has not stopped".
 *
 * The state and the waiting-on-a-person fact come from the run host's own `session.list` (its `status` and
 * `awaitingInput`); the STOP REASON does not ride that listing, so it is held main-side — the slot's owner is main — from
 * the run host's own terminal `run.result` (`e.result.stop_reason`, REQ-MONITOR-301's closed set), which main already
 * consumes. No new store and no new event type is minted (REQ-MCP-128): the reason is read from an event the product
 * already publishes.
 *
 * This module is the whole of that seam, kept out of `index.ts` so it can be driven without an Electron main.
 */

/** How many terminal stop reasons main remembers. Past it the oldest is dropped, as the surface's handle history is. */
export const INBOUND_STOP_REASON_HISTORY_MAX = 64;

/** The status the surface answers in, in the product's own vocabulary (REQ-MCP-123/125). */
export interface InboundStatusRead {
  readonly executionStatus: string;
  readonly stopReason: string | null;
  readonly awaitingInput: boolean;
}

/** The run host's side: the listing read, and the terminal reasons main holds. */
export interface InboundStatusDeps {
  readonly request: (request: RunHostRequest, boundMs: ReturnType<typeof millis>) => Promise<ProcessReply>;
  /** The run host's event stream, so the terminal stop reason can be captured (main calls `runHost.onEvent`). */
  readonly onEvent: (fn: (e: ProcessEvent) => void) => () => void;
  readonly log?: ((message: string) => void) | undefined;
}

export interface InboundStatusReader {
  /** REQ-MCP-123/125: the run's state, stop reason and waiting fact; null when the listing cannot be read. */
  readonly readStatus: (workspaceId: string, sessionId: string) => Promise<InboundStatusRead | null>;
  /** The last terminal stop reason main holds for a session, or undefined. */
  readonly stopReasonOf: (sessionId: string) => string | undefined;
}

export function createInboundStatusReader(deps: InboundStatusDeps): InboundStatusReader {
  const terminalReasons = new Map<string, string>();
  deps.onEvent((e) => {
    if (e.kind !== 'run.result') return;
    // REQ-MCP-123/128: the run host's own terminal stop reason, in the product's vocabulary, kept where the surface can
    // read it — the same event main already consumes for the notice, its slot and its logs. No new store, no new type.
    terminalReasons.set(e.sessionId, e.result.stop_reason);
    while (terminalReasons.size > INBOUND_STOP_REASON_HISTORY_MAX) {
      const oldest = terminalReasons.keys().next().value;
      if (oldest === undefined) break;
      terminalReasons.delete(oldest);
    }
  });

  return {
    stopReasonOf: (sessionId) => terminalReasons.get(sessionId),
    readStatus: async (workspaceId, sessionId) => {
      const r = await deps.request({ kind: 'session.list', workspaceId }, millis(10_000)).catch((cause: Error) => { deps.log?.(`inbound status: the session listing did not answer (${cause.message})`); return null; });
      if (r === null || r.kind !== 'session.list') return null;
      const row = r.sessions.find((s) => s.sessionId === sessionId);
      if (row === undefined) return null;
      // REQ-MCP-123/130: only the product's own vocabulary crosses — never an internal field, a file or a token.
      return { executionStatus: row.status, stopReason: terminalReasons.get(sessionId) ?? null, awaitingInput: row.awaitingInput };
    },
  };
}

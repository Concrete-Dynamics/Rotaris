import { millis } from '@rotaris/kernel';
import type { ProcessReply, RunHostRequest, SessionSnapshot } from '@rotaris/contracts';
import type { ObservedState } from './inbound-runs.js';

/**
 * REQ-MCP-123/125/128/130 (BLOCKER C/D of the review, 2026-11-25): the surface's STATUS READ, and where the run's state
 * and stop reason come from.
 *
 * `rotaris_run_status` SHALL read the run's state AND stop reason in the product's own vocabulary. The state and the
 * waiting-on-a-person fact come from the run host's own `session.list` (its `status` and `awaitingInput`). The STOP
 * REASON does not ride that listing, and it is NOT held main-side in a map of its own (BLOCKER D: a per-session map
 * counted every `run.result` — a desktop run's among them — against one cap, so a live handle's reason could be evicted,
 * and a desktop continuation of the same session could displace it). The reason lives with the HANDLE
 * (`InboundSurfaceRuns`, `InboundRun.stopReason`) and is fed from where the product already publishes it:
 *
 * - the run host's **terminal `run.result`** (`e.result.stop_reason`, REQ-MONITOR-301's closed set), which main already
 *   consumes; and
 * - the run host's **`publish.snapshot`** (`SessionRecordSchema.stopReason`, `packages/contracts/src/channels.ts`), which
 *   main already relays — this is the source of the reason for a run that STOPPED WITHOUT a terminal `run.result`: a
 *   desktop cancel at the plan gate or the message limit leaves the session `paused` with `stop_reason: 'user_cancelled'`
 *   and no result event at all (BLOCKER C). `stoppedSession` reads exactly those two fields off the published record.
 *
 * No new store and no new event type is minted (REQ-MCP-128): both facts are read from publications the product already
 * makes. This module is the whole of that seam, kept out of `index.ts` so the listing read can be driven without Electron.
 */

/** The status the surface answers in, in the product's own vocabulary (REQ-MCP-123/125): the live half, read from the listing. */
export interface InboundStatusRead {
  readonly executionStatus: string;
  readonly awaitingInput: boolean;
}

/** The run host's side: the listing read alone (the reason comes from the published records, wired by main). */
export interface InboundStatusDeps {
  readonly request: (request: RunHostRequest, boundMs: ReturnType<typeof millis>) => Promise<ProcessReply>;
  readonly log?: ((message: string) => void) | undefined;
}

export interface InboundStatusReader {
  /** REQ-MCP-123/125: the run's live state and waiting fact; null when the listing cannot be read or the session is not in it. */
  readonly readStatus: (workspaceId: string, sessionId: string) => Promise<InboundStatusRead | null>;
}

/**
 * REQ-MCP-123 (BLOCKER C/D): the product's own state for one session, read straight off a `publish.snapshot`'s record —
 * the two fields the surface needs, and nothing else. `executionStatus` decides busy-versus-resting (`isBusy`), and
 * `stopReason` is the reason to keep with the handle when the session is not busy.
 */
export function stoppedSession(snapshot: SessionSnapshot): { readonly sessionId: string; readonly state: ObservedState } {
  return { sessionId: snapshot.sessionId, state: { executionStatus: snapshot.session.executionStatus, stopReason: snapshot.session.stopReason } };
}

export function createInboundStatusReader(deps: InboundStatusDeps): InboundStatusReader {
  return {
    readStatus: async (workspaceId, sessionId) => {
      const r = await deps.request({ kind: 'session.list', workspaceId }, millis(10_000)).catch((cause: Error) => { deps.log?.(`inbound status: the session listing did not answer (${cause.message})`); return null; });
      if (r === null || r.kind !== 'session.list') return null;
      const row = r.sessions.find((s) => s.sessionId === sessionId);
      if (row === undefined) return null;
      // REQ-MCP-123/130: only the product's own vocabulary crosses — never an internal field, a file or a token.
      return { executionStatus: row.status, awaitingInput: row.awaitingInput };
    },
  };
}

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
  /**
   * REQ-SESSION-171 (MAJOR, 2026-11-25): the listing's own liveness verdict — the session claims a busy status while no
   * live process holds its lock. This is the definite signal that a run whose terminal write FAILED (the durable image
   * still says busy, no `run.result` ever came) really is over: nothing is running it. A genuinely running run is `live`
   * and never stale, so the reconcile can only ever end a run that nothing is running.
   */
  readonly stale: boolean;
}

/**
 * BLOCKER 2 (2026-11-25): WHAT a status read found, told apart exactly as the settle probe must. The surface's slot may
 * be freed only on a DEFINITE signal, so the three outcomes can never be conflated:
 *
 * - `row` — the listing was read and carries the session (the run exists, or at least its record does);
 * - `absent` — the listing was read successfully and the session is NOT in it (one half of the definite "no run");
 * - `unreadable` — the listing could not be read at all (a host refusal, an error, a bound). This proves NOTHING about
 *   whether a run was born, so a probe that sees it must EXTEND, never settle.
 */
export type InboundStatusReading =
  | { readonly kind: 'row'; readonly executionStatus: string; readonly awaitingInput: boolean; readonly stale: boolean }
  | { readonly kind: 'absent' }
  | { readonly kind: 'unreadable' };

/** The run host's side: the listing read alone (the reason comes from the published records, wired by main). */
export interface InboundStatusDeps {
  readonly request: (request: RunHostRequest, boundMs: ReturnType<typeof millis>) => Promise<ProcessReply>;
  readonly log?: ((message: string) => void) | undefined;
}

export interface InboundStatusReader {
  /** REQ-MCP-123/125 (BLOCKER 2): the run's live state and waiting fact, or a definite absence, or an unreadable listing. */
  readonly readStatus: (workspaceId: string, sessionId: string) => Promise<InboundStatusReading>;
}

/**
 * REQ-MCP-123 (BLOCKER C/D): the product's own state for one session, read straight off a `publish.snapshot`'s record —
 * the two fields the surface needs, and nothing else. `executionStatus` decides busy-versus-resting (`isBusy`), and
 * `stopReason` is the reason to keep with the handle when the session is not busy.
 */
export function stoppedSession(snapshot: SessionSnapshot): { readonly sessionId: string; readonly state: ObservedState } {
  return {
    sessionId: snapshot.sessionId,
    state: {
      executionStatus: snapshot.session.executionStatus,
      stopReason: snapshot.session.stopReason,
      /*
       * MAJOR 2(b) (REQ-MCP-123/125/126, 2026-11-25): the EXECUTION's own identity, as the product publishes it. The run
       * host writes `runStartedAt` anew for every launch of the session, so a snapshot of a LATER execution of the same
       * session (a desktop continuation) carries a different instant and the surface can tell it from this handle's run
       * instead of adopting its state. `null` before any run wrote it (nothing to compare, and the first real launch's
       * snapshot then fixes it).
       */
      executionStartedAt: snapshot.session.runStartedAt,
      // REQ-MCP-125: the same rule the listing uses (REQ-SESSION-031) — a pending approval or a pending question means
      // the run waits on a person. Read off the published record, so a run that ends through a park reports the flag it
      // had at its end (MAJOR of 2026-11-25: the frozen end state, not a later read of the same session).
      awaitingInput: snapshot.session.pendingApprovals.length > 0 || snapshot.session.pendingQuestions.length > 0,
    },
  };
}

export function createInboundStatusReader(deps: InboundStatusDeps): InboundStatusReader {
  return {
    readStatus: async (workspaceId, sessionId) => {
      // BLOCKER 2: a listing that could not be read is `unreadable`, NEVER `absent` — the caller's probe must extend on
      // it, since it says nothing about whether the run was born.
      const r = await deps.request({ kind: 'session.list', workspaceId }, millis(10_000)).catch((cause: Error) => { deps.log?.(`inbound status: the session listing did not answer (${cause.message})`); return null; });
      if (r === null || r.kind !== 'session.list') return { kind: 'unreadable' };
      const row = r.sessions.find((s) => s.sessionId === sessionId);
      if (row === undefined) return { kind: 'absent' };
      // REQ-MCP-123/130: only the product's own vocabulary crosses — never an internal field, a file or a token.
      return { kind: 'row', executionStatus: row.status, awaitingInput: row.awaitingInput, stale: row.stale };
    },
  };
}

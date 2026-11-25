/**
 * THE ONE RULE FOR "THIS START REFUSAL PROVES NO RUN EXISTS" (REQ-MCP-124/126). Two main-side places ask it and must
 * never drift: the inbound coordinator, which holds the surface's one-run slot and frees it only on a positive proof
 * (`inbound-runs.ts`), and the shared start coordinator, which may take a session-created worktree away again only when
 * nothing came to exist (`session-start.ts`). The rule is the same in both, because it is the same question.
 *
 * The run host's own `refused` reply is not one thing, and the `session.start` path is walked here code by code, because
 * the surface may free the slot — and delete the working tree — only where the refusal proves the run was never born.
 * The question is NOT "did anything happen"; it is "does this answer prove no run exists".
 *
 * NOT DEFINITE — each of these leaves it possible that a run was started (or a session row written) anyway:
 *
 * - `run-host.unreachable`: main's OWN reading of a no-reply within the bound. The bound may simply have been shorter than
 *   the host's work, so the host may still start the run (its credential lease alone is bounded at 45 s).
 * - `reply.unexpected`: a reply of a kind this start does not answer with. It says nothing about the run.
 * - `request.failed`: the host's own dispatch raised an exception. The throw may sit ANYWHERE in the dispatch, so a run
 *   may already have been dispatched.
 * - `session.history-failed`: the FIRST ROW of the session could not be recorded, and that row is written AFTER the
 *   session record, its lock and its history are opened (`SessionWriter.create`, `sessions.ts`). A session that exists —
 *   and whose worktree the record still names — must not have that tree taken away, so this is NOT a proof of "nothing
 *   came to exist".
 *
 * DEFINITE — everything else, because each of these is raised BEFORE the session record is created, so no run exists for
 * this request id:
 *
 * - `request.malformed`: the host could not read the request at all (`run-host/index.ts`), so `dispatch` never ran and no
 *   `session.start` was performed — a definite "no run" for THIS request id, and the slot and the tree may be freed.
 * - `workspace.refusing`, `workspace.not-open`: the host refused the request before it reached a run.
 * - `session.no-model`, `session.confinement`, `session.configuration`, `session.provider-auth`,
 *   `session.workspace-none`, `session.empty`, `session.sandbox-mode`, `session.workspace-changed`, `session.worktree`,
 *   `session.worktree-options`: validation and fence refusals raised before anything is created.
 * - `session.store-failed`, `session.image-input-unsupported`, `session.attachment-invalid`: the engine's own pre-create
 *   gates.
 *
 * A caller that would free a resource, or delete a tree, on a start refusal must ask this, never test one code by hand
 * (round 6 tested `request.failed` by hand and so deleted the tree of a run that was already running).
 */
const NOT_DEFINITE_START_REFUSALS: ReadonlySet<string> = new Set([
  'run-host.unreachable',
  'reply.unexpected',
  'request.failed',
  'session.history-failed',
]);

export function isDefiniteStartRefusal(code: string): boolean {
  return !NOT_DEFINITE_START_REFUSALS.has(code);
}

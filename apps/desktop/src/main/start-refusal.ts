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
 * The classification follows ONE question: was the refusal raised BEFORE the session record is created (and therefore
 * the run can never have been born for this request id), or can it come back AFTER the session record — and therefore
 * the session, its lock and the worktree it names may ALREADY exist? Only the first class is definite.
 *
 * NOT DEFINITE — each of these leaves it possible that a run was started (or a session row written) anyway:
 *
 * - `run-host.unreachable`: main's OWN reading of a no-reply within the bound. The bound may simply have been shorter than
 *   the host's work, so the host may still start the run (its credential lease alone is bounded at 45 s).
 * - `reply.unexpected`: a reply of a kind this start does not answer with. It says nothing about the run.
 * - `request.failed`: the host's own dispatch raised an exception. The throw may sit ANYWHERE in the dispatch, so a run
 *   may already have been dispatched.
 * - `runHost.gone`: the run host's link has ended AFTER it answered its hello (its exit, or main ending it). `ProcessLink`
 *   answers EVERY still-pending request with this refusal at once (`process-link.ts` `end`, `main/index.ts`'s
 *   `runHostChild.on('exit')`), so a `session.start` that was already dispatched — and whose start answer was still
 *   outstanding — is answered `runHost.gone` AFTER the session record may have been created. It proves nothing about
 *   whether THIS request's run was born.
 * - `session.history-failed`: the FIRST ROW of the session could not be recorded, and that row is written AFTER the
 *   session record, its lock and its history are opened (`SessionWriter.create`, `sessions.ts`). A session that exists —
 *   and whose worktree the record still names — must not have that tree taken away, so this is NOT a proof of "nothing
 *   came to exist".
 * - `session.lock-held`: the session's lock could not be claimed. `SessionWriter.create` writes the session row and claims
 *   the lock in ONE transaction, but the lock ROW is claimed AFTER the session row is upserted (`session-writer.ts`), so a
 *   lock-held answer can come back with the session row already committed — a session (and the worktree it names) exists.
 * - `session.attachment-invalid`: the engine's attachment gate. Its FIRST arm validates the inputs before the session row
 *   is written, but its SECOND arm persists the attachments AFTER `SessionWriter.create` (`sessions.ts`), so the same code
 *   can be answered with the session record (and the worktree) already created.
 *
 * DEFINITE — each of these is raised BEFORE the session record is created, so no run exists for this request id:
 *
 * - `request.malformed`: the host could not read the request at all (`run-host/index.ts`), so `dispatch` never ran and no
 *   `session.start` was performed — a definite "no run" for THIS request id, and the slot and the tree may be freed.
 * - `workspace.refusing`, `workspace.not-open`: the host refused the request before it reached a run.
 * - `session.no-model`, `session.confinement`, `session.configuration`, `session.provider-auth`,
 *   `session.workspace-none`, `session.empty`, `session.sandbox-mode`, `session.workspace-changed`, `session.worktree`,
 *   `session.worktree-options`: validation and fence refusals raised before anything is created.
 * - `session.store-failed`, `session.image-input-unsupported`: the engine's own pre-create gates, both raised before
 *   `SessionWriter.create`.
 * - `runHost.notStarted` (a missed `hello`): a request made before the hello is HELD, not posted (`ProcessLink.holdUntil`,
 *   OQ-473 (3)), and refused at the miss — so no `session.start` was ever delivered to the host and no run could exist.
 *
 * A caller that would free a resource, or delete a tree, on a start refusal must ask this, never test one code by hand
 * (round 6 tested `request.failed` by hand and so deleted the tree of a run that was already running).
 */
const NOT_DEFINITE_START_REFUSALS: ReadonlySet<string> = new Set([
  'run-host.unreachable',
  'reply.unexpected',
  'request.failed',
  'runHost.gone',
  'session.history-failed',
  'session.lock-held',
  'session.attachment-invalid',
]);

export function isDefiniteStartRefusal(code: string): boolean {
  return !NOT_DEFINITE_START_REFUSALS.has(code);
}

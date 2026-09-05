import { millis, type Clocks, type Millis } from '@rotaris/kernel';
import type { ProcessReply, ServiceAsk } from '@rotaris/contracts';
import { checkpointsEnabledFor, type CheckpointsSection } from '@rotaris/config';
import type { CheckpointCaptureInput, CheckpointCaptureResult, CheckpointPort, CheckpointPortContext } from '@rotaris/engine';

/**
 * The run-host root's side of ADR-0039 (the `HookPort` pattern): the run loop's capture at iteration close, built
 * over the workspace service's Git reached through main (ADR-0002 c.4 / ADR-0038 c.4 — the two children never talk
 * directly; every Git call is an ask main relays) and the session writer's one transaction (REQ-GIT-048).
 *
 * The two orderings ADR-0039 derives from REQ-GIT-049 are kept here, not in the writer: capture = ref THEN row (the
 * service creates the ref; the row commits after — a crash between leaves a ref with no record, tolerated); trim = rows
 * THEN refs (the writer trims the rows in the row's transaction and hands the victims back; their refs are deleted
 * after the commit; the event is published only after that, REQ-GIT-048's third precondition).
 *
 * REQ-GIT-046: the sequence is max(rows, live refs) + 1, the refs through the ask; unlistable refs → the rows alone,
 * and the service's `update-ref` with the empty old value still refuses an existing ref, so a clobber is impossible.
 * REQ-GIT-045: never raises, never aborts the run — a Git decline is the `checkpoint` warning issue.
 */
export interface CheckpointRootDeps {
  readonly clocks: Clocks;
  readonly ask: (request: ServiceAsk, boundMs: Millis) => Promise<ProcessReply>;
  readonly section: CheckpointsSection;
  readonly log: (message: string) => void;
}

/** The bound on one capture ask: REQ-GIT-033's tree-walk limit plus the relay's margin; a later answer leaves a ref with no row, which REQ-GIT-049 tolerates. */
export const CAPTURE_ASK_BOUND: Millis = millis(330_000);
export const REFS_ASK_BOUND: Millis = millis(35_000);

/** REQ-GIT-047: exactly this, ` by <child-name>` inside the parentheses only when a child is credited. */
export function checkpointMessage(sequence: number, sessionId: string, iteration: number, childName: string): string {
  return `rotaris checkpoint ${sequence} for session ${sessionId} (iteration ${iteration}${childName === '' ? '' : ` by ${childName}`})`;
}

export function createCheckpointPort(ctx: CheckpointPortContext, deps: CheckpointRootDeps): CheckpointPort {
  let enabled = checkpointsEnabledFor(deps.section, ctx.isolated);
  const keep = Math.max(1, deps.section.max_per_session);
  // Both logs: the session's own (REQ-SESSION-142) and the host's, which is what the proof reads.
  const say = (m: string) => { deps.log(m); ctx.log(m); };
  say(`checkpoints: ${enabled ? 'enabled' : 'disabled'} for session ${ctx.sessionId} (checkpoints.enabled=${deps.section.enabled === null ? 'unset' : String(deps.section.enabled)}, ${ctx.isolated ? 'isolated' : 'base tree'}, max_per_session=${keep}, include_untracked=${deps.section.include_untracked}; tree ${ctx.effectiveRoot})`);

  const issue = (iteration: number, detail: string) => {
    const r = ctx.writer.recordIssue({ kind: 'checkpoint', severity: 'warning', actor: 'checkpoints', message: `Could not record a checkpoint after iteration ${iteration}: ${detail}`, metadata: { iteration, tree_root: ctx.effectiveRoot } });
    if (!r.ok) ctx.warn(`the checkpoint warning after iteration ${iteration} could not be recorded (${r.error.code})`);
  };

  const capture = async (input: CheckpointCaptureInput): Promise<CheckpointCaptureResult> => {
    if (!enabled) return { outcome: 'disabled' };
    const started = Number(deps.clocks.monotonic.now());
    const elapsed = () => Math.round(Number(deps.clocks.monotonic.now()) - started);
    try {
      // REQ-GIT-046: the two sources; the refs through main to the service.
      const fromRows = ctx.dal.maxCheckpointSequence(ctx.writer.sessionId) ?? 0;
      let fromRefs = 0;
      const refs = await deps.ask({ kind: 'checkpoint.refs', workspaceRoot: ctx.workspaceRoot, treeRoot: ctx.effectiveRoot, sessionId: ctx.sessionId }, REFS_ASK_BOUND).catch((e: Error) => ({ kind: 'refused' as const, code: 'ask', headline: e.message }));
      if (refs.kind === 'checkpoint.refs' && refs.ok) fromRefs = refs.entries.reduce((m, e) => Math.max(m, e.sequence), 0);
      else say(`checkpoints: the live refs could not be listed (${refs.kind === 'checkpoint.refs' ? refs.detail ?? 'unknown' : refs.kind === 'refused' ? refs.headline : refs.kind}); numbering from the recorded list alone (REQ-GIT-046)`);
      const sequence = Math.max(fromRows, fromRefs) + 1;
      const message = checkpointMessage(sequence, ctx.sessionId, input.iteration, input.childName);
      const reply = await deps.ask({ kind: 'checkpoint.capture', workspaceRoot: ctx.workspaceRoot, treeRoot: ctx.effectiveRoot, sessionId: ctx.sessionId, sequence, iteration: input.iteration, childName: input.childName, checkpointKind: 'iteration', includeUntracked: deps.section.include_untracked, message }, CAPTURE_ASK_BOUND)
        .catch((e: Error) => ({ kind: 'refused' as const, code: 'ask', headline: e.message }));
      if (reply.kind !== 'checkpoint.captured') {
        const detail = reply.kind === 'refused' ? [reply.headline, 'detail' in reply ? reply.detail : undefined].filter(Boolean).join(': ') : `unexpected answer ${reply.kind}`;
        issue(input.iteration, detail);
        return { outcome: 'failed', detail };
      }
      if (reply.outcome === 'nothing-to-record') {
        say(`checkpoints: nothing to record after iteration ${input.iteration} (${reply.invocations} git invocations, ${reply.elapsedMs} ms)`);
        return { outcome: 'nothing-to-record', invocations: reply.invocations, elapsedMs: reply.elapsedMs };
      }
      if (reply.outcome === 'unavailable') {
        // REQ-GIT-044: a tree Git cannot manage resolves to disabled — a workspace without undo, not an error.
        enabled = false;
        say(`checkpoints: disabled for the rest of the run — ${reply.detail ?? 'the tree is not inside a usable Git working tree'} (REQ-GIT-044)`);
        return { outcome: 'disabled' };
      }
      if (reply.outcome === 'failed') {
        issue(input.iteration, reply.detail ?? 'Git declined');
        return { outcome: 'failed', detail: reply.detail ?? 'Git declined' };
      }
      // Recorded: the ref exists; now the row (ADR-0039's capture ordering), the trim, then the refs, then the event.
      const files = reply.files ?? [];
      const row = ctx.writer.recordCheckpoint({ sequence, ref: reply.ref ?? '', commit: reply.commit ?? '', iteration: input.iteration, childName: input.childName, files, kind: 'iteration' }, keep);
      if (!row.ok) {
        const detail = `Could not persist the checkpoint on the session: ${'reason' in row.error ? row.error.reason : row.error.code}`;
        issue(input.iteration, detail);
        return { outcome: 'failed', detail };
      }
      if (row.value.trimmed.length > 0) {
        const pruned = await deps.ask({ kind: 'checkpoint.prune', workspaceRoot: ctx.workspaceRoot, treeRoot: ctx.effectiveRoot, sessionId: ctx.sessionId, refs: row.value.trimmed.map((t) => ({ ref: t.ref, commit: t.commit_id })) }, REFS_ASK_BOUND)
          .catch((e: Error) => ({ kind: 'refused' as const, code: 'ask', headline: e.message }));
        // REQ-GIT-049: a deletion failure is logged only; the rows are already gone and a leftover ref is tolerated.
        if (pruned.kind === 'checkpoint.pruned') say(`checkpoints: retention trimmed ${row.value.trimmed.length} row(s) to ${keep}; ${pruned.deleted} ref(s) deleted${pruned.failed.length > 0 ? `; ${pruned.failed.map((f) => `${f.ref}: ${f.detail}`).join('; ')}` : ''}`);
        else say(`checkpoints: retention trimmed ${row.value.trimmed.length} row(s); their refs could not be deleted (${pruned.kind === 'refused' ? pruned.headline : pruned.kind}) and remain under refs/rotaris/checkpoints/`);
      }
      row.value.publish();
      say(`checkpoints: recorded checkpoint ${sequence} for session ${ctx.sessionId} after iteration ${input.iteration}${input.childName === '' ? '' : ` by ${input.childName}`}: ${files.length} file(s), ${reply.invocations} git invocations, ${reply.elapsedMs} ms in the service, ${elapsed()} ms end to end`);
      return { outcome: 'recorded', sequence, files: files.length, invocations: reply.invocations, elapsedMs: reply.elapsedMs };
    } catch (cause) {
      const detail = String(cause instanceof Error ? cause.message : cause);
      issue(input.iteration, detail);
      return { outcome: 'failed', detail };
    }
  };

  return { get enabled() { return enabled; }, capture };
}

## The inherited-context reports never reach the child

`delegate` accepts `inherited_context` (`packages/agent-tools/src/tools/delegation.ts`), and the ledger stores the
ids on the child's record (`packages/engine/src/children/ledger.ts`), refusing only an empty entry. Nothing
resolves them afterwards. `childPayload` (`packages/engine/src/children/notify.ts`) takes no inherited-context
argument, so a child named with `inherited_context: ['bg_…']` receives no report from that sibling. An id that
names no task is accepted, where the requirement refuses the call.

Noticed 2026-09-27 while repairing the payload order (R-054), which is where item (5) would sit. Established by
reading every use of `inheritedContext`; not observed on a live run.

## Specs

- `REQ-TOOLS-152`: `inherited_context` carries the reports of already-completed sibling tasks into the child; an id
  naming a failed or unfinished task is ignored, and an id referring to nothing refuses the call. The code carries
  no report and refuses no id.
- `REQ-TOOLS-154`: item (5), the inherited-context block, sits between the attached artifacts and the task. The
  payload has no such block.
- `REQ-ORCH-032`: relies on the call "forwarding the reports of already-completed siblings as context without
  imposing an ordering dependency".

## Relevant files

- `packages/agent-tools/src/tools/delegation.ts`: the `inherited_context` argument.
- `packages/engine/src/children/ledger.ts`: stores the ids; the only validation is the empty-entry refusal.
- `packages/engine/src/children/orchestration.ts`: `delegate` passes the ids to the ledger; `execute` never reads them.
- `packages/engine/src/children/notify.ts`: `childPayload`, with no place for item (5); `reportBlock` and
  `priorAgentContext` already render a sibling's report for REQ-ORCH-047's block.

## Repaired — 2026-09-28 under R-062

The repair stays on the `delegate` path, as R-062 asked while `PD-ORCH-005` is being built beside it. **What changed.**
`ChildLedger.spawn` now resolves every `inherited_context` id, after the dependency checks and before the cycle check.
Existence is asked of the whole session's child records and of the root execution record, which shares their id
namespace (REQ-ORCH-072). An id no task has refuses the call with no record and no id — `inherited_context id '<id>'
refers to nothing: no task has that id`. An id naming a task that exists and has not completed — the root, the caller's
own task, or any task that failed, was cancelled, has not finished, or succeeded without its report stored yet — is
ignored without refusing. The caller's own children that were `succeeded` with a report are returned on
`Spawned.inherited`, once each in the caller's order. A completed task that is not the caller's own child (another
parent's, or an earlier iteration's) is refused for ownership, never as nonexistent — `inherited_context id '<id>' is
not a sibling's: it is owned by parent '<owner>', not '<caller>'`, as the `depends_on` check refuses one.
`IterationChildren.delegate` renders them with the new `inheritedContextBlock` (`notify.ts`): a heading saying the
reports are context and not a dependency, then one `reportBlock` per sibling — the same block the parent read on its
resume, so the child inherits exactly what the parent was told — and remembers the text per task id for as long as the
run lives, on `attached`'s terms. `childPayload` gains a trailing `inheritedContext` argument and places it as item (5),
after the artifact blocks and immediately before the task; `execute`'s one call passes `this.inherited.get(task_id) ?? ''`
and is otherwise untouched. The refusal reaches the caller as REQ-TOOLS-153's `rejected` observation. That another
parent's completed task is refused rather than ignored or carried is a reading, raised as OQ-76.

*Corrected in fix round 1, the same day:* the first build resolved ids against the caller's own children only and refused
every other id as referring to nothing, so the root's id and the caller's own id — both real, unfinished tasks — were
refused as nonexistent, against REQ-TOOLS-152 (ignore an unfinished task) and REQ-ORCH-072 (a lookup naming the root
resolves to it; an agent is never told the root does not exist). The lookup now asks existence first, as above.

**Pinned by** `packages/engine/src/children/notify.test.ts` (item (5)'s position with nothing between it and the
task; the block's heading, its per-sibling `reportBlock`s and their order; an empty block leaving the payload as it
was) and `packages/engine/src/children/children.test.ts` — against a real store, the refusal of an unknown id, of
another parent's completed child (for ownership) and of an empty entry with no record written, and the ignore of a
failed, an unfinished and a report-less sibling, of another parent's unfinished child and of the root's id while the
completed one is carried once; the root's id and the caller's own id named by a depth-1 child are ignored, not refused; end to end over the scripted model, a `build` child's
payload reading (1) the workspace root, (3) the sibling-artifact index the `survey` report became, (5) the survey's
own report block, (6) the task, with the parent's resume shown to have carried the same block, and a delegation
naming `bg_00000000` rejected with no child, no `task_id:` line and the reason in the parent's next request.

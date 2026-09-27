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

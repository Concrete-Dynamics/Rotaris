## No delegation names the todo item it serves, so one item can hold two implementation delegations

REQ-ORCH-028 measures exclusive implementation ownership "per todo item and at no other granularity: at most one child at a
time may hold an implementation delegation for any one todo item", and REQ-ORCH-029 holds the coordinator to "no two
implementation delegations for the same todo item are outstanding at once", a constraint that must hold "no matter what
playbook cell or instruction text is in force" and be "externally checkable from the run's own records". The build has
nothing to measure it by: a `delegate` call names no todo item (`packages/agent-tools/src/tools/delegation.ts`), the child
ledger records none (`children`, store v33), and admission (`IterationChildren.delegate`,
`packages/engine/src/children/orchestration.ts`) refuses nothing on an item's account. So a coordinator can hold two
implementation children on one item at once, the run cannot refuse it, and no record says which item any child served.
The constraint stands on instruction text alone, which REQ-ORCH-029 says may not decide it.

Raised as [OQ-220](../architecture/open-questions.md) by fin27 while building OQ-213, which made the coordinator keep a todo
list of its own (the precondition, not the measure); recorded as a defect 2026-10-07 by fin29 when the ruling of OQ-220
(under R-072) settled how a delegation names its item. REQ-ORCH-030's per-item attempt count rests on the same missing key.

## Specs

REQ-ORCH-028 (per-item exclusive implementation ownership) and REQ-ORCH-029 (no two implementation delegations for one item
outstanding at once, held whatever the instruction text, checkable from the run's records), both faithful and unmet;
REQ-ORCH-030's per-item count keys on the same item. How a delegation names its item was the open part (OQ-220), ruled as
`PD-TOOLS-006` revision 6.

## Relevant files

- `packages/agent-tools/src/tools/delegation.ts` — `delegate`'s schema and description, which name no item.
- `packages/engine/src/children/orchestration.ts` — `IterationChildren.delegate` and `followUp`, the admission that refuses
  nothing on an item's account.
- `packages/store/src/schema.ts`, `packages/store/src/dal.ts` — the `children` table, with no column for the item.
- `packages/engine/src/run/run.ts` — the root's own plan (`coordinatorPlan`) and OQ-213's `listWritten`, which admission
  does not read.
- `apps/desktop/scripts/lib/coordinator-todo.mjs` — the live run's REQ-ORCH-029 reading, which cannot see items.

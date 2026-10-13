## A crash with a question pending records no withdrawal

A run host that dies while an agent's `ask_questions` call waits on the user leaves nothing that says a question was
asked and never answered. PD-ORCH-005 clause 9 (revision 3) withdraws "a tool call suspended on an approval or a
question when the run comes to rest — by a pause, a stop, a quit or a crash": it "leaves `pending_approvals` or
`pending_questions`, the timeline records it as withdrawn by that interruption". A pause, a stop and a quit do this in the
live process (`PendingQuestions.withdrawAll`, the gate's `question_withdrawn` entry, `packages/agent-tools/src/gate.ts`).
A crash cannot, and its record, written later from the store (`recordCrash`, `packages/engine/src/run/crash.ts`),
withdraws only what the store holds: `withdrawStoredApprovals` reads `sessions.pending_approvals`, and no question is
ever stored — the pending prompts live in each tool port's `PendingQuestions` registry and are derived from the live run
at every snapshot (`Run.pendingQuestions`, `packages/engine/src/run/run.ts`; `pendingQuestions: []` for a stored record in
`toSessionRecord`, `packages/engine/src/sessions.ts`). The crash record does settle the cut `ask_questions` call's ring row
and transcript row as interrupted, so the call is not left running; what is missing is the `question_withdrawn` entry the
clause requires. The record calls this "REQ-SESSION-025's persistence limb, owed" in four places
(`packages/contracts/src/channels.ts`, ADR-0010's fourth note, `docs/architecture/codebase.md`, OQ-96), none of them
reconciled with PD-ORCH-005 revision 3, which makes the "restored on reload" half of that limb moot (a question is
withdrawn at rest and never comes back) and leaves the durable half owed for exactly this case.

## Specs

PD-ORCH-005 clause 9 (governing over REQ-SESSION-025's question half, `docs/spec/07-sessions-persistence.md`'s
back-pointer): a crash withdraws a pending question and the timeline records it as withdrawn by the crash.

## Relevant files

- `packages/engine/src/run/crash.ts` — `recordCrash`, `withdrawStoredApprovals`; nothing for questions.
- `apps/desktop/src/run-host/tools.ts` — the port's `PendingQuestions` and the `ask_questions` executor's `publish`.
- `packages/agent-tools/src/tools/questions.ts` — `PendingQuestions`, `askQuestionsTool`.
- `packages/store/src/schema.ts`, `packages/store/src/dal.ts` — `pending_approvals` (v5) and no question column.

## Outcome — repaired 2026-10-13 (fin41, `fin41-restore-and-session`)

`sessions.pending_questions` (v35, appended in `packages/store/src/schema.ts`) mirrors the session's whole list of pending
prompts: the `ask_questions` executor calls its `pendingChanged` once the prompt is pending and once it has ended
(`packages/agent-tools/src/tools/questions.ts`), and the run host's `mirrorQuestions` writes `Run.pendingQuestions` (every
port's, through `ToolPortContext.pendingQuestionsOfSession`) into the column (`apps/desktop/src/run-host/tools.ts`).
`recordCrash` withdraws what it lists (`withdrawStoredQuestions`, `packages/engine/src/run/crash.ts`): one
`question_withdrawn` entry per prompt in the gate's words and fields, the column emptied, the count returned as
`withdrawnQuestions`. The mirror is never read back as pending: PD-ORCH-005 revision 3 withdraws a question at rest and
never restores it, which reconciles REQ-SESSION-025's question half; the four "owed" statements now say so
(`packages/contracts/src/channels.ts`, ADR-0010's fourth execution, `docs/architecture/codebase.md`, OQ-96).

Pinned by `packages/engine/src/run/crash.test.ts` ("clause 9 after a crash"), `apps/desktop/src/run-host/tools.test.ts`
(the mirror as the session's list, emptied on the answer) and `packages/store/src/store.test.ts` (v34 → v35); the first
two red before. Not driven in the built app or live.

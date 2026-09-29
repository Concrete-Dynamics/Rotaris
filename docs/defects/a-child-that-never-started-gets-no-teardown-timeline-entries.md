## A child that never started gets no teardown timeline entries

A child that reaches a terminal state without its execution ever starting gets no `child_end`, `child_result` or
`child_conversation_closed` timeline entry. The teardown that writes them sits where a child's execution ends: in
`IterationChildren.execute` and in `settleRaised`. Two paths settle a child that never started and write none of them:
- a child blocked by its dependency (REQ-ORCH-048), settled `blocked` by `Scheduler` with its report and artifact since
  the repair of
  [`a-child-blocked-by-its-dependency-gets-no-report.md`](fixed/a-child-blocked-by-its-dependency-gets-no-report.md);
- a queued child `Scheduler.finalizeIncomplete` cancels at the iteration's end.

The build's reading is that such a child never had a conversation, so there was nothing to close. That reading is
stated on the fixed note only; no requirement or open question states it, and REQ-ORCH-098's "whatever terminal state
a child reaches" does not except it.

Noticed 2026-09-29 by the verifier of the R-067 repair of the note above, and recorded under R-067. Established by
reading the code; no test asserts either form.

## Specs

- `REQ-ORCH-098`: "Whatever terminal state a child reaches, and whether or not its execution raised, that child MUST be
  fully torn down: its conversation is closed, a `child_conversation_closed` timeline event is emitted for it, …". A
  child that never started reaches a terminal state and gets no such event. Whether a child with no conversation owes
  one is a reading of the clause the specification does not settle; the owner's ruling, or an open question, decides it.
- `REQ-ORCH-108` and `REQ-ORCH-112` are met for the blocked child: it has its report and its artifact.

## Relevant files

- `packages/engine/src/children/scheduler.ts`: the blocked-child settle and `finalizeIncomplete`, neither of which
  writes a teardown entry.
- `packages/engine/src/children/orchestration.ts`: `execute` and `settleRaised`, where the teardown entries are written.
- `docs/defects/fixed/a-child-blocked-by-its-dependency-gets-no-report.md`: where the reading was first stated.

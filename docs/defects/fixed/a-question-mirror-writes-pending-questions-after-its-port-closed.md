## A question that ends after its port closed still writes `pending_questions`

The run host mirrors the session's pending question prompts to `sessions.pending_questions` each time one of a port's
prompts is put or ends (`mirrorQuestions`, `apps/desktop/src/run-host/tools.ts`). The approvals sink beside it
(`writerSink`) drops every write once the run's end has closed the port (`closed`); the question mirror does not. So an
`ask_questions` call a stop's grace detached, answered or timed out after its run ended, still saves the column into a
session whose run is over. Reproduced in `tools.test.ts`: ask, close the port, answer the prompt — the column went from the
listed prompt to `[]` after the close. The withdrawal at rest makes it unlikely in practice. A fin41 review finding
(`fin41/restore-and-session`, Task 2), carried by fin43 (`fin43-optional-findings`).

## Specs

- `REQ-SESSION-094`: a call that returns after its run ended writes nothing into the session; the repair of
  `docs/defects/fixed/a-detached-call-still-writes-through-its-tool-gate.md` closed the gate's sink and left the question
  mirror out.
- `PD-ORCH-005` clause 9 and `REQ-SESSION-031`: the mirror is the session's list of prompts pending now, for a crash's
  record and the listing; a write after the run ended is not a prompt pending in any run.

## Relevant files

- `apps/desktop/src/run-host/tools.ts` — `mirrorQuestions`, and `writerSink`'s `closed` it does not read.
- `apps/desktop/src/run-host/tools.test.ts` — the mirror's cases beside the `REQ-SESSION-094` close case.

## Repaired — 2026-10-14 (fin43, `fin43-optional-findings`)

`mirrorQuestions` returns before writing once `writes.closed()` — the approvals sink's own flag, set when the run's end
closes the port — so the mirror and the sink stop together. Pinned by `tools.test.ts`, "REQ-SESSION-094: a question that
ends after its port closed writes nothing to pending_questions", which failed without the guard (the column went from the
listed prompt to `[]` after the close). The runtime view's `sessions` row names it. No open question was raised.

## A run cancelled at the plan gate stores no summary, so it reads back with no outcome at all

The three summary columns (`summary_status`, `summary_severity`, `summary_text`) were written
in exactly one place: `Run.teardown` → `SessionWriter.endRun`. A run cancelled **at** the plan
gate never reaches teardown — it came to rest before, and the answer is taken by
`Sessions.planDecision` → `SessionWriter.resolvePlanGate`, which wrote `stop_reason =
'user_cancelled'` and nothing else.

Observed on 2026-09-16: two sessions in one workspace, both stopped by the person. The one
that was cancelled mid-run carries "The run came to rest because a person stopped it."; the
one cancelled at the gate carries `summary_text = NULL` beside the same stop reason.

The absence is visible in three places at once: `sessions.ts` presents a summary only when all
three columns are present, `summary.md` omits its whole Outcome block, and the agents view
shows an empty activity line.

## Specs

- `REQ-ORCH-082` — "this requirement is the single definition of end-of-run summarization for
  the whole product", and its first arm is `user_cancelled` → paused / warning / "The run came
  to rest because a person stopped it."
- `REQ-SESSION-093` — every outcome branch MUST persist state before returning.
- `REQ-ORCH-153` — cancel at the gate "stops the run with stop reason `user_cancelled`", which
  is the arm above by its own name.

## Relevant files

- `packages/engine/src/session-writer.ts` — `resolvePlanGate`: when it writes a stop reason it
  now writes the summary the one definition gives, inside the same durable transaction. It
  calls `summarise` rather than restating the arms, so there is still one definition.
- `packages/engine/src/run/stop-conditions.ts` — `summarise`, unchanged; rule 1 already held
  the wording.

## Not repaired here — the crash-recovery path

`Sessions.repairOne` marks a session `interrupted` after its host died and leaves the same
three columns NULL. That is **not** fixed here: REQ-SESSION-060/062 fixes exactly what the
repair path writes (its type, severity, actor, message and metadata keys) and says nothing
about a summary, and REQ-ORCH-082's five arms are all reached through a stop reason that a
crashed run never recorded. Inventing a sixth arm at the repair site would put a second
definition of end-of-run summarization in the product, which REQ-ORCH-082 forbids in terms.
Raised as an open question instead — see `docs/architecture/open-questions.md`.

## Repaired — 2026-09-16

Regression test: `packages/engine/src/run/plan-gate.test.ts`, in "cancel stops the run with
`user_cancelled` and launches nothing" — the three columns are asserted beside the stop
reason.

## The final step belt ends a working child as succeeded with no final response

A turn that exceeds 100 model steps is ended as `partial` (the final step belt, ADR-0059 decision 8). When that turn is a child's, the child's settlement maps every turn that did not fail to `succeeded`, so a child cut mid-work is reported succeeded, with an empty `final_response`, and the coordinator receives a success with nothing in it.

Seen for the first time live in the duress run at `cb6d1d5` (2026-10-15), session `1e7349db`. The child `wave2-reconcile-docs` had worked 28.5 minutes and 127 tool calls; its last calls were a `haet_edit` and a `read_file`, and its last text announced a check it was about to run. At 13:54:59.958 the belt ended its turn. The child row reads state `succeeded`, report status `succeeded`, `final_response` empty, and its brief's deliverable ("a list of every disagreement") was never produced. The only trace is one session-log warning that names no agent ("the turn exceeded 100 model steps and was ended as partial (the final step belt fired)"); no issue and no timeline entry record it.

The pack lives in an ephemeral cloud container (`Rotaris-crw-wt-live2/.live-run/runs/2026-10-15T13-20-16-026Z`) and may be gone; the figures above are the evidence.

## Specs

`REQ-ORCH-112` provides the `partial` report status for a child that stops before its brief is done, which this report contradicts. `REQ-ORCH-100` makes the raw-count thresholds the run's backstop; the belt has no requirement or configuration key of its own, so whether a working child may be cut at a fixed step count, and what the person is told, may need an open question before code. `REQ-ORCH-088` for the child's settlement.

## Relevant files

- `packages/engine/src/run/turn.ts` — lines 366 to 369: the belt and its warning.
- `packages/engine/src/run/run.ts` — line 116: `maxStepsPerTurn: 100`.
- `packages/engine/src/children/orchestration.ts` — the mapping of a turn's outcome to the child's `succeeded` / `failed`.
- `docs/architecture/adr/0059-the-loop-supervisor-as-an-in-turn-observer.md` — decision 8.

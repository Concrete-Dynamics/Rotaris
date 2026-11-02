## A timed-out child is cut off rather than paused, so its report carries no response at all

`REQ-ORCH-088` says what happens when a child's hard ceiling expires: *"gracefully pause the child;
then, if the role has a configured fallback model not yet attempted for this child, retry once on it;
otherwise record the child as failed with a timeout issue and a report of the form `Child timed out
after <N>s` carrying the last/final response extracted from the transcript."*

Neither the pause nor the extraction was built.

The ceiling armed a bare `controller.abort()`, which cuts the child off wherever it happens to be —
in practice inside a tool call, because that is where a working agent spends its time. The turn never
reaches the point where it would return its text, so the transcript ends on a tool result. The
report's extraction then took **the last assistant message**, which is the one that opened that tool
call and said nothing, so `last_response` and `final_response` were both empty.

Observed live 2026-09-16, run `a26918e8-45be-45b9-8762-24f94059183c`: a `codebase-analyst` child made
**96 tool calls**, hit its 1200 s ceiling, and reported nothing its parent could use. The parent —
which had been blocked in `wait_for_tasks` for 1164 s of the run's 1302 s, as `REQ-TOOLS-156` and
`REQ-ORCH-064` entitle it to be — read the empty report and began re-delegating the same work. The
owner stopped the run. Nothing of the twenty minutes survived.

Two further things are true and are not this defect:

- **The 20-minute block is specified.** `REQ-TOOLS-156` forbids a deadline on the wait in those words
  ("A separate deadline MUST NOT be imposed"), `REQ-ORCH-062` restates it, and
  `docs/spec/resolutions/01-run-orchestration.md` row 19 records it as *forbidden rather than merely
  omitted*. What made the block worthless was the empty report at the end of it, not its length.
- **`final_response` being empty is correct.** `REQ-ORCH-110` populates that field only where the
  child's last assistant message was not followed by further tool activity. A child that was stopped
  did not conclude. Its words belong in `last_response`, which is where they now go.

## Specs

Contradicts `REQ-ORCH-088` in both of its clauses. `REQ-ORCH-110` is **not** contradicted and is the
reason the repair puts the recovered text in `last_response` rather than `final_response`.
`REQ-CONFIG-113`'s ceiling is preserved by the backstop. `REQ-MONITOR-123`'s graceful pause is the
mechanism reused. ADR-0014 rule 1 supplies the 30 s window.

## Relevant files

- `packages/engine/src/children/orchestration.ts` — the ceiling timer, the landing flag it now sets,
  the backstop behind it, and the transcript extraction that stopped at the first assistant message.
- `packages/engine/src/children/report.ts` — `fallbackReport`, whose whole summary for a silent child
  was the words `Tools used: …` and whose key findings were empty.
- `packages/engine/src/run/turn.ts` — `shouldPause`, checked at the top of the step loop; the pause
  the requirement asks for already existed here.
- `packages/engine/src/run/grace.ts` — ADR-0014's one 30 s allowance, moved out of `run.ts` so the
  third reader can take it without reading it across an import cycle (see the note in that file).

## Repaired — 2026-09-16

The ceiling raises the landing flag `runTurn` already reads, and a `CHILD_LANDING_GRACE` backstop
cuts off a child that cannot land inside it. Regression tests in
`packages/engine/src/children/children.test.ts`: "the ceiling asks the child to land, so the step in
flight finishes and its words reach the report"; "a child that cannot land inside the grace is still
cut off by the backstop"; and in `report.test.ts`, "the fallback report of a SILENT child states what
it did, rather than the two words it used to". Reported back into ADR-0012 in place, with a row in
`docs/architecture/first-executions.md`.

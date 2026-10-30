# `live-run` — Reading a failure

Part 9 of 12 of [the live-run record](../live-run.md), which indexes every part.

## Reading a failure

Each check prints `PASS`, `FAIL` or `NOTE` with its own sentence, so a red names the assertion rather than the
run. `results.json` holds the same list plus the per-scenario detail — iterations, tokens, tool names, the
answer, the diffstat. A failure in `edit` is usually worth reading beside `edit/changed/` and `edit/diff.txt`:
what the agent wrote is as informative as what the app did with it. A weaker or smaller model failing `edit`
while `ask` passes is a fact about the model, not necessarily about the product — say which you think it is.

Read the scenario's **`autopsy.txt` first** and its `app.filtered.log` second; `transcript.md` and the verbatim
`app.log` are there for the question the first two raise. A check that went red without the autopsy showing a
cause is itself worth reporting — it means the store recorded nothing about the failure.

A live-run failure is a **defect of the product**, not of the harness, until the harness is shown to be wrong.
Record what it found where the mechanism was decided, as the standing policy in [`AGENTS.md`](../../../AGENTS.md) requires.

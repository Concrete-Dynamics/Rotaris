# `live-run` — The `faults` scenario — the endpoint misbehaving, on purpose

Part 7 of 12 of [the live-run record](../live-run.md), which indexes every part.

## The `faults` scenario — the endpoint misbehaving, on purpose

The proxy is in the path, so it can also be told to misbehave on a **named call**. Three launches:

- **`faults-ladder`** — a 429 on the second completion and a 500 on the third, neither of which reaches the
  endpoint, so the injected calls cost nothing. It asks whether the run survives both and whether each refusal left
  the trace of the layer that retried it: OQ-110 puts REQ-CONFIG-086's dispatch-layer retries before the ladder's
  (`REQ-ORCH-091..094`), so with the default budget of 5 the trace is the session log's WARNING line, and the check
  reads it (or the ladder's `model_wait`/`transient_llm_error` issue) for every injected status. `results.json`'s
  `traffic.faultsFired`/`faultsDeclared` are the run's figures (`proxy.totals()`), never the last launch's.
- **`faults-stall`** — the bytes stop mid-answer and the socket stays **open**. It asks the eighty-second
  defect's question: a model timeout once collapsed into the same `aborted` flag a user's stop sets, and the run
  reported `user_cancelled` with nobody having pressed anything. The check is that it does not do so again.
- **`faults-args`** (since 2026-10-07) — the proxy's `pace` rule holds every piece of every tool call's streamed
  arguments `LIVE_RUN_ARGS_PACE_MS` (120 ms) behind the one before it, and the stall threshold is lowered to
  `LIVE_RUN_ARGS_STALL_S` (10 s) for this launch alone, so one `write_file` of a 120-line list streams for several
  thresholds. It asks the question of L2 at `c2fdd6a` and N1 at `c2a9444`: is any agent reported stalled while it streams
  a tool call's arguments (`lib/paced-arguments.mjs`, `stallsWhileStreaming`)? A paced span shorter than the threshold and
  one evaluation is no evidence, and fails as such
  (`docs/defects/fixed/a-child-streaming-a-long-tool-call-is-reported-stalled.md`). Unlike the other two it names no call:
  the rule acts on every call of its path and fires on each that carried a piece. **First executed 2026-10-07 against
  `katalyst`:** red on the product before the repair (three `stall` issues inside paced spans, pack
  `2026-10-07T00-21-02-195Z`), green on the repaired head (220 pieces over 26.4 s, no `stall` issue, pack
  `2026-10-07T00-26-10-472Z`); its very first run, at a 60 ms pace, cleared the threshold and one evaluation by under two
  seconds, so the default became 120 ms.

This makes the first of the two frictions the `frictions` scenario reports as uncoverable inducible on demand;
that row's note points here. A rule names the **1-based index** of the call it fires at, deliberately: "the
second completion" is a reproduction, "some completion" is a coincidence.

**Both were executed against a real endpoint on 2026-09-22 and both passed on the product's side**
(`docs/architecture/first-executions.md`; pack `.live-run/runs/2026-09-22T09-05-35-955Z`). The ladder made five
calls against two refusals and completed *(falsified 2026-09-29: the two refusals were retried by the model client's
dispatch layer — REQ-CONFIG-086's `num_retries`, default 5 — before the ladder saw them, and the ladder was never
reached; the owner ruled that order as the specification's, OQ-110, R-067, so `faults-ladder` shows that a run survives
the refusals and not that the ladder handled them; each retry the dispatch layer absorbs is now a WARNING line in the
session log, so a pack's `faults-ladder/session.log` names both refusals with the delay waited)*; the stalled stream was noticed by the **idle bound at 120.5 s**,
classified `transient_llm_error`, retried at 121.5 s and finished — the first live evidence that the
eighty-second defect's repair holds.

Two things about the scenario itself were wrong and are repaired: the stalled call was **absent from the pack**
(its record was written only when the proxy let the socket go, and the product recovered first —
`docs/defects/fixed/the-stalled-call-was-the-one-call-missing-from-the-pack.md`), and
`stop_reason !== 'user_cancelled'` is a check that **cannot fail**, since a run that met no fault ends
`tasks_complete` too. It now carries a positive half: the product's own `issues` row must show it noticed, and
what it classified must not be fatal. `LIVE_RUN_STALL_HOLD_MS` must outlast the product's `llm_response_timeout`
(120 s) or the scenario measures the proxy letting go instead.

`faults-stall` holds the socket for `LIVE_RUN_STALL_HOLD_MS` (default five minutes) before letting go, so the
scenario is the slow one — it is opt-in with the others under `--only=`.

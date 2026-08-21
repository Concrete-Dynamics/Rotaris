# A finished run can be recorded as `running` — persister race

> Found: 2026-08-09, independently by two agents during wave 2 of the Phase 2 work.
> Status: **confirmed.** Reproduced 1 in 6 full-suite runs on an *unpatched* baseline, and
> diagnosed line-by-line by a second agent that had no contact with the first.
> Severity: **medium-high** — the corrupt state is durable, and we already ship a
> repair tool for its symptom.

## What happens

`src/rotaris_core/session/persister.py` runs two write paths that can land out of order:

1. The first `"running"` save computes a `0.0` debounce delay and writes through
   `asyncio.shield`.
2. The terminal `"completed"` save cancels the debounce timer and calls `flush_sync()` —
   which does **not** take `_write_lock`.

Because the first write is *shielded*, cancelling the timer does not cancel it. Whichever
write finishes last wins. When that is the shielded `"running"` write, the session is left
permanently recorded as running after it completed.

Observed as `tests/unit/test_run_host.py::test_a_successful_run_returns_a_completed_result_without_printing`
failing with `execution_status == 'running'` — a name that hides the real assertion. The
test passes in isolation and fails under load, which is why it reads as a flake.

## Why it matters more than a flaky test

SWR-2817 exists **because** sessions get stuck in `running`: a hard-crashed session blocked
restore and integration until a recovery path was added to detect and repair it. That
requirement was written for the crash case. This race produces the same corrupt state with
no crash at all — so the repair ships while one of its causes is still live, and the
condition is reachable on any sufficiently loaded machine.

The two agents that found it were working on unrelated units (`run_host` wiring and the
completion verifier). Neither could fix it: `session/persister.py` belonged to no unit in
the wave.

## Fix sketch

Make the terminal write authoritative rather than racing:

- have `flush_sync()` take `_write_lock`, so it cannot interleave with an in-flight
  shielded write; **and**
- do not shield a debounced save whose timer has been cancelled — or stamp saves with a
  monotonically increasing generation and drop a write whose generation is stale.

The generation stamp is the more robust of the two: it fixes the whole class rather than
the one ordering, and it makes a late write detectable instead of merely unlikely.

A regression test needs to force the interleaving deterministically (drive the debounce
timer and the terminal flush from a controlled loop) — reproducing it by load is what has
made this look like noise for so long.

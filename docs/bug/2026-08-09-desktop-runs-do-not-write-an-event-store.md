# Rotaris desktop runs write no event store

> Found: 2026-08-09, while wiring the event store (wave 2 of the Phase 2 work).
> Status: **confirmed by reading**; the CLI and SDK paths are covered, the desktop path is not.
> Severity: medium — the gap is on the primary marketed surface.

## What happens

SWR-2901 requires the event store to be written for **every** run, "an interactive Rotaris
session and a headless CI run leave the same trace behind". The wiring lives in
`run_host.execute_run`, which registers the store and its bus sink for the duration of a
run.

The Rotaris desktop app does not go through it. `apps/rotaris/src/rotaris/services/run_bridge.py`
calls `rotaris_core.cli.background._run_task` directly, below the layer where the store is
attached. So the CLI stores, the Python SDK stores, and the desktop app — the surface the
product is positioned around — does not.

The consequence is not a crash but an absence: replay, trajectory export and every future
Mission-Control view that reads stored history will be empty exactly for the sessions a
desktop user cares about, while working perfectly in every test and every CLI run.

## Fix sketch

Give the desktop bridge the same attach/detach pair `execute_run` uses — open and register
the session store immediately before the guarded run block, detach it in the same `finally`
that already tears down the other session-scoped registries. The store's registry is
late-binding and session-keyed for exactly this reason, so no signature has to change.

Better still, if the two paths can share one bootstrap, they should: this class of gap —
"the desktop path skips something the CLI path does" — has now appeared twice (hook
skipped-event publication was the other, fixed in the same wave), and both times because
the desktop bridge re-implements a lifecycle rather than calling it.

## Related

- [2026-08-09-terminal-result-event-bypasses-the-event-bus.md](2026-08-09-terminal-result-event-bypasses-the-event-bus.md) — fixed in wave 2; the same
  "one path writes directly instead of going through the shared seam" shape.

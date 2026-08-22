---
req-id: SWR-2453
status: draft
trace: required
test: required
title: "Every run the desktop starts is the same run as a CLI run"
epic: SWR-2000
date: 2026-08-22
---

# SWR-2453 — Every run the desktop starts is the same run as a CLI run

Every run the Rotaris desktop starts shall behave the same as a run started from
the CLI, the TUI or the SDK for the same workspace, task and configuration. No
host shall carry a private re-composition of run-lifecycle behaviour.

"Run lifecycle" means everything the engine defines around the agent loop rather
than inside it: creating or resuming the session, taking and releasing its lock,
binding the worktree, attaching the event store, publishing session start and
end, dispatching lifecycle hooks, writing per-iteration checkpoints, deriving the
terminal result, and releasing every resource on every exit path — including the
failure and cancellation paths.

The word doing the work is **every**. The desktop's ordinary run already goes
through the shared lifecycle; this requirement is about the runs that do not, and
about the property that no future run path may quietly become another one.

This requirement is about *sameness*, not about where the code lives. It does not
prescribe an entry point, a call shape, a module boundary or a migration order;
those are the implementation plan's to choose. It also does not ask the desktop
to stop owning its own event loop, its own worker thread or its own session
identity. Those are legitimate properties of a GUI host, and a design that
preserves them while removing the private re-composition satisfies this
requirement.

## Why

SWR-1830 established one host-neutral run lifecycle precisely so that "two copies
of the same lifecycle disagree the moment one of them is fixed" could not happen.
The desktop's main run path was exempted from it, then migrated — and the
migration's own account of the cost is the evidence for finishing the job: while
the second copy existed it had a gap the shared lifecycle did not, and a run that
died during intent classification was stored without its `session.start`.

At the time of writing the migration is incomplete. The desktop's **integration
run** — the agent that merges selected session worktrees — still drives the
runtime one layer below the lifecycle and hand-composes a subset of it, so it
creates and persists its own session, and does not attach the event store,
publish session start and end, or derive its terminal result the way every other
run does. The hand-composition helper that path depends on remains in the code
as the last consumer of the forked shape.

That is the same defect SWR-1830 named, surviving in one path rather than all of
them, and it is invisible precisely because the main path was fixed.

## Acceptance criteria

- For each lifecycle behaviour named above, a run started from any desktop
  surface and a CLI run of the same hermetic task over the same workspace and
  config produce the same observable outcome: the same session artifacts, the
  same lifecycle events in the same order, the same terminal status, and the same
  resources released.
- This holds for **every** run the desktop can start — the ordinary task run, the
  requirement-driven run, and the worktree integration run — not only the ones
  that already satisfied it.
- Lifecycle behaviour added once reaches every desktop run path without a
  desktop-side implementation of it. A test that pins this is part of the
  portfolio below: adding a lifecycle behaviour to the engine and asserting each
  desktop run path exhibits it, with no change under `apps/rotaris/`.
- No host holds a private re-composition of lifecycle behaviour. Where a run path
  needs something the shared lifecycle does not offer, the lifecycle grows a seam
  for it; the host does not grow a copy.
- The set of lifecycle behaviours any desktop run participates in is never a
  strict subset of the set a CLI run participates in.
- Failure and cancellation paths are covered by the same sameness: a desktop run
  cancelled mid-iteration releases what a cancelled CLI run releases, and reports
  a terminal status derived the same way.
- A host-owned concern stays host-owned and is explicitly out of scope for this
  sameness: human-readable output, signal handling, the event loop the run
  executes on, focus and window state, and which session the user is looking at.
- No user-visible behaviour changes as a result of satisfying this requirement,
  except where a run path was previously missing a lifecycle behaviour that other
  hosts already had.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Each desktop run path composes the lifecycle once and only through the shared one, asserted by driving it with a fake agent loop and checking each named behaviour fires once, in order, on both the success and the cancellation path | the host-neutral run lifecycle as each desktop path invokes it | `tests/unit/test_run_host.py` (extended), `apps/rotaris/tests/test_desktop_hook_wiring.py` (extended to the integration path) |
| Integration | The same hermetic task run from each desktop run path and from the CLI yields equal session artifacts, equal lifecycle event sequences and equal terminal status; an integration run leaves the event-store history and session start/end an ordinary run leaves; a lifecycle behaviour registered only in the engine is observed in all of them | desktop run paths ↔ CLI host over one engine | `tests/integration/test_host_lifecycle_parity.py` (new), `apps/rotaris/tests/test_worktree_integration_e2e.py` (extended) |
| User-flow E2E | A user merges two session worktrees from the desktop; a lifecycle hook fires and a checkpoint is written, the integration session is afterwards resumable and inspectable exactly as any other session is, and its events are in the store | Public product boundary → user-observable result | `apps/rotaris/tests/test_worktree_integration_e2e.py` (extended) |

Related: [SWR-1830 — Python SDK entry point over the same runtime](../1800-cli-headless/SWR-1830-python-sdk.md)
(the requirement that established the single lifecycle and recorded the desktop
exemption this one finishes closing),
[SWR-2454 — The live view keeps up with the run](SWR-2454-live-view-keeps-up-with-the-run.md)
(the observation half of the same boundary — still open on every path),
[SWR-2436 — Per-iteration checkpoints](../2400-git-worktrees/SWR-2436-iteration-checkpoints.md)
and [SWR-2701 — Hook configuration](../2700-lifecycle-hooks/SWR-2701-hook-configuration.md)
(the two lifecycle behaviours the desktop had to re-compose by hand, and what the
remaining path still re-composes),
[SWR-2901 — Session event store](../2900-event-store/SWR-2901-session-event-store.md)
(attached by the lifecycle, and therefore missing wherever the lifecycle is not
used).

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)

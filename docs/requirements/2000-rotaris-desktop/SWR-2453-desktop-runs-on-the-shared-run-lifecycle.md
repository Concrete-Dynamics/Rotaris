---
req-id: SWR-2453
status: draft
trace: required
test: required
title: "A desktop run is the same run as a CLI run"
epic: SWR-2000
date: 2026-08-22
---

# SWR-2453 — A desktop run is the same run as a CLI run

A run started from the Rotaris desktop shall behave the same as a run started
from the CLI, the TUI or the SDK for the same workspace, task and configuration.
The desktop shall not carry a second implementation of run-lifecycle behaviour.

"Run lifecycle" means everything the engine defines around the agent loop rather
than inside it: creating or resuming the session, taking and releasing its lock,
binding the worktree, publishing session start and end, dispatching lifecycle
hooks, writing per-iteration checkpoints, deriving the terminal result, and
releasing every resource on every exit path — including the failure and
cancellation paths.

This requirement is about *sameness*, not about where the code lives. It does not
prescribe an entry point, a call shape, a module boundary or a migration order;
those are the implementation plan's to choose. It also does not ask the desktop
to stop owning its own event loop, its own worker thread or its own session
identity. Those are legitimate properties of a GUI host, and a design that
preserves them while removing the duplicate lifecycle satisfies this requirement.

## Why

SWR-1830 established one host-neutral run lifecycle precisely so that "two copies
of the same lifecycle disagree the moment one of them is fixed" could not happen.
The desktop — the primary interface — was then exempted from it in that
requirement's own text. The exemption has already cost what SWR-1830 predicted:
lifecycle behaviour introduced for other hosts (hook dispatch, per-iteration
checkpointing) reached the desktop late and only by being re-composed by hand,
so for a period the primary interface was the one host with neither.

## Acceptance criteria

- For each lifecycle behaviour named above, a desktop run and a CLI run of the
  same hermetic task over the same workspace and config produce the same
  observable outcome: the same session artifacts, the same lifecycle events in
  the same order, the same terminal status, and the same resources released.
- Lifecycle behaviour added once reaches the desktop without a desktop-side
  implementation of it. A test that pins this is part of the portfolio below:
  adding a lifecycle behaviour to the engine and asserting a desktop run
  exhibits it, with no change under `apps/rotaris/`.
- The set of lifecycle behaviours a desktop run participates in is never a strict
  subset of the set a CLI run participates in.
- Failure and cancellation paths are covered by the same sameness: a desktop run
  cancelled mid-iteration releases what a cancelled CLI run releases, and reports
  a terminal status derived the same way.
- A host-owned concern stays host-owned and is explicitly out of scope for this
  sameness: human-readable output, signal handling, the event loop the run
  executes on, focus and window state, and which session the user is looking at.
- No user-visible behaviour of a desktop run changes as a result of satisfying
  this requirement, except where the desktop was previously missing a lifecycle
  behaviour that other hosts already had.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | A desktop run's lifecycle composition is the engine's, asserted by driving the lifecycle with a fake agent loop and checking each named behaviour fires once, in order, on both the success and the cancellation path | the host-neutral run lifecycle as the desktop invokes it | `tests/unit/test_run_host.py` (extended), `apps/rotaris/tests/test_run_bridge_lifecycle.py` (new) |
| Integration | The same hermetic task run once from the desktop host and once from the CLI host yields equal session artifacts, equal lifecycle event sequences and equal terminal status; a lifecycle behaviour registered only in the engine is observed in the desktop run | desktop host ↔ CLI host over one engine | `tests/integration/test_host_lifecycle_parity.py` (new) |
| User-flow E2E | A user starts a task in the desktop, a lifecycle hook fires and a checkpoint is written, the user cancels mid-run, and the session is afterwards resumable and inspectable exactly as a cancelled CLI session is | Public product boundary → user-observable result | `apps/rotaris/tests/test_run_lifecycle_e2e.py` (new) |

Related: [SWR-1830 — Python SDK entry point over the same runtime](../1800-cli-headless/SWR-1830-python-sdk.md)
(the requirement that established the single lifecycle and named the desktop
exemption this one closes),
[SWR-2454 — The live view keeps up with the run](SWR-2454-live-view-keeps-up-with-the-run.md)
(the observation half of the same boundary),
[SWR-2436 — Per-iteration checkpoints](../2400-git-worktrees/SWR-2436-iteration-checkpoints.md)
and [SWR-2701 — Hook configuration](../2700-lifecycle-hooks/SWR-2701-hook-configuration.md)
(two lifecycle behaviours the desktop had to re-compose by hand, and the
evidence for this requirement).

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)

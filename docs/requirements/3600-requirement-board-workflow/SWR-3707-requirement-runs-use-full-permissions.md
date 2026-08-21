---
req-id: SWR-3707
status: approved
trace: required
test: required
title: "A released requirement runs with full permissions, and Rotaris says so"
epic: SWR-3600
date: 2026-08-21
---

# SWR-3707 — A released requirement runs with full permissions, and Rotaris says so

Releasing a requirement (SWR-3601) starts a run nobody is watching. The flow is
dispatched onto a worker thread and the agent works in the requirement's own
worktree, so the user is somewhere else — on the board, or away from the machine
entirely.

A run that stops to ask therefore does not finish while they are gone. The
workspace default is `ask`, so an unelevated release parks on the first tool
that needs approval. Configuring `autonomous` does not fix it on its own either:
SWR-2508 downgrades an unsandboxed run straight back to `ask` unless the
workspace also opts in through `runtime.allow_unsandboxed_autonomous`. Both
halves have to be answered together or a release cannot be relied on to finish
unattended.

Requirement: a run started from the requirements board is given the permissive
preset **and** the unsandboxed opt-in, for that run only, and the user is told
so before the first release of each launch.

**Amended by SWR-3622.** When this was written the elevation was also what made
a release *possible*: no approval host was registered for a board run at all, so
a prompt it raised had nobody to answer it and the switch below was a way to
break a release rather than a setting. A board run is now an ordinary session
with a handle and an approval host, and the board says on the card when one is
waiting (SWR-3623) — so turning the elevation off yields a run that stops, asks,
and carries on once answered. The default stays on: nobody is *watching* a
release, which is a different fact from nobody being *reachable*, and a run the
user walked away from should finish rather than park.

## Acceptance criteria

- **AC-1** A run the board starts is resolved with the permissive preset and the
  unsandboxed opt-in together, so SWR-2508 does not downgrade it.
- **AC-2** The elevation reaches board-started runs only. A run started from the
  composer, the TUI or the headless CLI keeps the mode its configuration asks
  for, and the workspace's own `agents.yaml` is not rewritten.
- **AC-3** It is never silent. The first gesture of a launch that would start a
  run states what the run is given, names the worktree it is confined to, and
  offers to stop.
- **AC-4** Refusing that statement starts nothing: no delivery state is written,
  no flow is dispatched, and the card is where it was.
- **AC-5** Accepting it silences the statement for the rest of the launch;
  accepting it permanently silences it for good, across launches.
- **AC-6** A user who has silenced the statement can still see the behaviour, and
  turn it off, in Settings. Turned off, a board run takes the workspace's own
  permission mode like any other run.
- **AC-7** What the run actually received is recorded on its session, so the
  statement and the audit trail cannot disagree.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | The elevated configuration carries both halves, changes nothing else, and is skipped when the preference is off | Run configuration | `apps/rotaris/tests/test_requirement_run_permissions.py` |
| Unit | An elevated board run is not downgraded by the unattended, unsandboxed rule | Permission resolution | `apps/rotaris/tests/test_requirement_run_permissions.py` |
| Integration | The first run-starting gesture discloses; a second does not; refusing writes no state and starts no flow | Board view → controller → actions | `apps/rotaris/tests/test_requirement_run_permissions.py` |
| User-flow E2E | A user releases a requirement, reads what the run is given, and the run that starts holds it | Public product boundary → user-observable result | `apps/rotaris/tests/test_requirement_run_permissions.py` |

Epic: [Requirement Board Workflow and Review](../3600-requirement-board-workflow.md)

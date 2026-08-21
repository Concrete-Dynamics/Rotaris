---
req-id: SWR-2131
status: approved
trace: required
test: required
type: technical
derived-from: SWR-1322
title: "Queued prompt injection as a new todo phase"
epic: SWR-1300
date: 2026-07-23
---

# SWR-2131 — Queued prompt injection as a new todo phase

`SWR-1322` provides the thread-safe registry and submission API for queued
prompts, but a submitted queued prompt does nothing until the run loop picks
it up. `RalphLoop._run_main_loop` (`src/rotaris_core/ralph/loop.py`) checks the
registry whenever the loop is about to stop because all tasks completed: if
active `QUEUED` prompts are pending, it appends a new `TodoPhase` with one
task per queued prompt, marks each prompt triggered so it is not re-injected,
and continues the run instead of terminating.

## Acceptance criteria

- When the stop reason is "all tasks completed" and at least one `QUEUED`
  prompt exists, a new `TodoPhase` named "Queued Prompts" is appended with one
  `TodoTask` per active queued prompt, and the loop continues rather than
  stopping.
- Each injected prompt is marked triggered in the registry so it is not
  injected again on a later stop check.
- Stop reasons other than "all tasks completed" do not trigger queued-prompt
  injection.

Derived from: [SWR-1322 — Steering and queued prompt registry and submission API](../1300-runtime-control/SWR-1322-steering-queued-prompt-registry.md)

Epic: [Runtime Control & Responsiveness](../1300-runtime-control.md)

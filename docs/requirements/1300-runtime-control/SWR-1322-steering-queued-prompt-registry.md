---
req-id: SWR-1322
status: approved
trace: required
test: required
type: technical
derived-from: SWR-1300
title: "Steering and queued prompt registry and submission API"
epic: SWR-1300
date: 2026-07-20
---

# SWR-1322 — Steering and queued prompt registry and submission API

Runtime control (SWR-1300) includes letting a user influence an in-flight run:
inject a **steering** prompt to redirect the active agent, or **queue** a prompt
to run after the current one. That requires a thread-safe registry of pending
steering/queued prompts and an API surface for submitting them from outside the
run loop. This layer is the substrate those runtime-control behaviors build on;
it carries no product behavior of its own.

The layer comprises:

- **`PromptType` / `SteeringPrompt` / `QueuedPrompt`** — the typed prompt records
  and their status (`SteeringStatus`, `QueuedStatus`).
- **`PromptRegistry`** — a thread-safe singleton holding pending steering and
  queued prompts, since submission happens off the run thread.
- **`PromptSubmissionAPI`** — the thread-safe API layer for external submission
  of steering and queued prompts into the registry.

Derived requirements: [SWR-2131 — Queued prompt injection as a new todo phase](SWR-2131-queued-prompt-todo-injection.md)

## Acceptance criteria

- Steering and queued prompts can be submitted and retrieved in a thread-safe
  manner through the registry/API.
- Prompt records carry a stable type and status usable by the run loop to apply
  or defer them.

Derived from: [SWR-1300 — Runtime Control & Responsiveness](../1300-runtime-control.md)

Epic: [Runtime Control & Responsiveness](../1300-runtime-control.md)

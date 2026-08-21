---
req-id: SWR-2423
status: approved
trace: required
test: required
type: technical
derived-from: SWR-563
title: "User-Prompt Bridge"
epic: SWR-2000
date: 2026-07-28
---

# SWR-2423 — User-Prompt Bridge

Plumbing between the `ask_questions` tool executor and the Rotaris question
stepper UI: a `UserPromptBarrier` that blocks the SDK worker thread, a
`pending_questions` field on `SessionState` for poll-based UI detection, and
bridge methods on `RunBridge` for answer resolution.

The bridge comprises:

- **`UserPromptBarrier`** (`orchestrator/user_prompt_barrier.py`) — thread-safe
  handshake keyed by stable SDK conversation ID: `create_prompt` registers a
  prompt, `wait_for_response` returns typed resolved/cancelled/timed-out status,
  and exact-prompt `resolve`, `cancel`, and teardown cleanup release the waiter.
- **`SessionState.pending_questions`** — copied prompt metadata containing the
  asking agent ID, generated prompt ID, and steps. Read by Rotaris poll to
  render the stepper. Cleared when the matching agent's tool result arrives.
- **Executor callback** — after prompt registration, the executor passes
  conversation, prompt ID, and steps to the live session observer. This is the
  sole pending-state write route.
- **Poll detection** — `_SessionRefreshWorker` checks `pending_questions`, emits
  signal to `WorkspaceStore`, transcript inserts stepper trigger row.
- **Answer resolution** — `RunBridge.resolve_questions(agent_id, prompt_id,
  answers)` selects the exact active conversation and calls exact-prompt
  `UserPromptBarrier.resolve`. The executor unblocks and answers flow back as
  the tool result.

No drain-loop path is needed — the executor blocks directly, answers are the
tool result, and the conversation continues inside the same `run()`.

## Acceptance criteria

- `UserPromptBarrier.create_prompt` raises `RuntimeError` if a prompt is already
  pending for the conversation.
- `wait_for_response` blocks until `resolve` or `cancel` is called, teardown
  discards the prompt, or the timeout elapses.
- `resolve` from the Qt thread correctly unblocks a waiting executor on the SDK
  worker thread.
- `SessionState.pending_questions` is populated on `ask_questions` action event
  and cleared on the corresponding result event.
- Rotaris poll detects `pending_questions` and inserts a stepper trigger row
  within one poll cycle (750 ms).
- `RunBridge.resolve_questions` routes by both asking agent and prompt ID; it
  cannot answer another active conversation.
- Closing the modal or stopping the run cancels the matching wait immediately.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Exact prompt resolves, cancels, times out, and cleans up by stable conversation ID | `UserPromptBarrier` | `tests/unit/orchestrator/test_user_prompt_barrier.py` |
| Integration | Root runtime, session projection, and bridge carry one scheduler barrier and copied prompt identity | Ralph runtime and Rotaris service/store seams | `tests/unit/test_ralph_loop.py`, `apps/rotaris/tests/test_services.py` |
| User-flow E2E | Visible Rotaris answer reaches only the asking agent | PySide6 transcript through `RunBridge.resolve_questions` | `apps/rotaris/tests/test_main_window.py::test_user_answers_exact_waiting_agent_through_rotaris` |

Derived from: [SWR-563 — Interactive `ask_questions` Tool](../500-tool-platform.md)

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)

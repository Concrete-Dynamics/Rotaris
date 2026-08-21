---
req-id: SWR-778
status: approved
trace: required
test: required
title: "Claude Agent SDK native agent loop in the Ralph loop"
epic: SWR-700
date: 2026-08-08
---

# SWR-778 — Claude Agent SDK native agent loop in the Ralph loop

When a persona runs on the `claude-code` provider (SWR-777), Rotaris MUST drive
that work as **one persistent Claude Agent SDK session** — `ClaudeSDKClient`,
connected once per child task — instead of issuing one stateless
`claude_agent_sdk.query()` per LLM completion.

The Agent SDK owns the model→tool→result→model loop for that child. Rotaris
keeps everything else: sessions, iteration control, event streaming, the
transcript, persistence, permissions, logging, and multi-agent routing. Claude is
one backend behind the same child-conversation seam the Ralph loop already drives
for LiteLLM-routed providers, so a `claude-code` run is scheduled, watched,
stalled, cancelled, reported on, and rendered exactly like any other run.

## Requirement

- A `claude-code` child MUST execute inside a single `ClaudeSDKClient` session
  for the lifetime of that child conversation, so follow-up turns (todo
  corrections, steering prompts, repair continuations) reuse the established
  conversation rather than restarting it with no memory.
- The session MUST expose the tools Rotaris grants the persona — the persona's
  own `tools:` list — to Claude as in-process MCP tools (SWR-779), so the model
  reasons and acts with Rotaris's capabilities, not a parallel set of its own.
- Claude's message stream MUST be normalized into Rotaris's own event model at
  the provider boundary. No Agent SDK type (`StreamEvent`, `AssistantMessage`,
  `ToolUseBlock`, `ToolResultBlock`, `ResultMessage`) may leak past that
  boundary into the orchestrator, the TUI, or the desktop app.
- Normalized events MUST be recorded onto the child conversation's transcript in
  the same shape the existing scheduler machinery consumes, so tool-call timing,
  stall detection, progress assessment, the child report, and the session
  diagnostics timeline work for a `claude-code` child with no special-casing in
  the Ralph loop.
- The session MUST honour Rotaris's run-control verbs: a pause request
  interrupts the in-flight Claude turn, and closing the child disconnects the
  session and releases its transport.
- Token usage and cost reported by the Agent SDK at the end of a turn MUST be
  fed back into the child's LLM metrics so the existing token/cost aggregation
  (SWR-835/SWR-1419) reports a `claude-code` run like any other.
- The credential preconditions of SWR-777 still apply: a session MUST NOT start
  while a higher-precedence API/gateway credential would divert billing away
  from the subscription.
- The native loop MUST be switchable off (`runtime.claude_sdk_native_loop`), in
  which case `claude-code` falls back to the SWR-777 per-completion shim.

## Acceptance criteria

- A Ralph-loop iteration whose persona resolves to a `claude-code` model runs
  through a `ClaudeSDKClient` session and produces a normal
  `ChildReportArtifact`, including the assistant's final response.
- Rotaris tools invoked by Claude appear on the child transcript as tool calls
  with their arguments and results, and are counted by the global tool tracker,
  so an iteration that edited files is recognised as having executed work.
- Requesting a stop mid-run interrupts the Claude turn and the child closes
  without leaving the transport connected.
- No `claude_agent_sdk` symbol is imported outside
  `rotaris_core/providers/claude_sdk/` and `rotaris_core/providers/claude_code_runtime.py`.
- With `runtime.claude_sdk_native_loop: false`, the same persona runs through the
  SWR-777 shim instead, and nothing else about the run changes.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | A conversation turn records Claude's answer and its tool calls on the transcript the scheduler reads | `ClaudeSDKConversation.run` → transcript events | `tests/unit/providers/test_claude_sdk_conversation.py::test_run_records_assistant_text_and_tool_calls_on_the_transcript` |
| Unit | A follow-up message reuses the same session instead of reconnecting, so context survives a todo correction | `ClaudeSDKConversation.send_message` → session reuse | `tests/unit/providers/test_claude_sdk_conversation.py::test_follow_up_turn_reuses_the_connected_session` |
| Unit | Stopping a run interrupts the in-flight turn and closing releases the transport | `pause()` / `close()` | `tests/unit/providers/test_claude_sdk_conversation.py::test_pause_interrupts_and_close_disconnects_the_session` |
| Unit | Agent SDK usage totals reach the child's LLM metrics so token/cost display works | `RunFinished` → `LLM.metrics` | `tests/unit/providers/test_claude_sdk_conversation.py::test_run_usage_is_recorded_on_the_agent_llm_metrics` |
| Unit | A persona on another provider is untouched; the native loop only claims `claude-code` and can be switched off | conversation selection | `tests/unit/providers/test_claude_sdk_conversation.py::test_native_loop_claims_only_claude_code_agents`, `::test_native_loop_can_be_disabled_by_runtime_policy` |
| Integration | The scheduler runs a `claude-code` child end to end and returns a report naming the work Claude did | `Scheduler.run_child` with the Claude backend | `tests/integration/test_claude_sdk_ralph_loop.py::test_scheduler_runs_a_claude_code_child_and_reports_its_work` |
| User-flow E2E | A user starts a run on their Claude subscription, Claude edits a file with a Rotaris tool, and the run completes with the change on disk | Ralph loop → Claude session → Rotaris tools → workspace | `tests/integration/test_claude_sdk_ralph_loop.py::test_ralph_loop_completes_a_task_on_the_claude_backend` |

## Implementation notes

- `providers/claude_sdk/` is the whole boundary: `session.py` owns the
  `ClaudeSDKClient` lifecycle, `translate.py` turns SDK messages into the
  normalized events in `events.py`, `tool_bridge.py` (SWR-779) publishes
  Rotaris tools, and `conversation.py` is the synchronous facade the scheduler
  drives via `asyncio.to_thread`, matching `LocalConversation`.
- The facade owns a dedicated event-loop thread. `ClaudeSDKClient` is async and
  long-lived; the scheduler's contract is a blocking `run()`, so the session
  lives on its own loop and `run()` blocks on a future from it.
- Selection is by model prefix (`claude-code/…`), which the SWR-777 LLM shim
  already sets, so no persona or config change is needed to opt in.

Related requirements: [SWR-777 — Claude Code Subscription Provider](SWR-777-claude-code-subscription-provider.md)

Derived requirements: [SWR-779 — Rotaris tools as in-process MCP tools for the Claude Agent SDK](SWR-779-claude-sdk-tool-bridge.md)

Epic: [Provider Integration & Authentication](../700-providers-auth.md)

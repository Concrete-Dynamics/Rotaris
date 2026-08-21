---
req-id: SWR-779
status: approved
trace: required
test: required
type: technical
derived-from: SWR-778
title: "Rotaris tools as in-process MCP tools for the Claude Agent SDK"
epic: SWR-700
date: 2026-08-08
---

# SWR-779 — Rotaris tools as in-process MCP tools for the Claude Agent SDK

The native Claude session (SWR-778) is only useful if Claude acts with
*Rotaris's* capabilities. This requirement covers the two mechanical pieces that
make that true and keep the Agent SDK from leaking into the rest of the codebase:
the tool bridge and the normalized event translation.

## Requirement

- Rotaris MUST be able to publish an already-resolved OpenHands `ToolDefinition`
  to the Agent SDK as an in-process MCP tool, deriving the tool's name,
  description and input schema from the definition itself so a tool cannot
  describe itself differently to Claude than it does to any other model.
- Invoking a published tool MUST validate the arguments into the tool's own
  `Action` model, execute the tool's real executor, and return both a
  human-readable text result for Claude and the structured outcome, marking
  executor failures as tool errors rather than swallowing them.
- Each invocation MUST be recorded with its tool name, arguments, `Action` and
  `Observation` so the caller can correlate a later tool result from the message
  stream back to the real objects, keeping downstream outcome classification
  (terminal exit codes, edited files) intact.
- Translation of an Agent SDK message MUST be a pure function producing
  Rotaris-owned event values only — assistant text, thinking, tool start, tool
  input delta, tool call, tool result, session start, run finished — with an
  unrecognised message translating to nothing rather than raising.
- Published tool names MUST use the SDK's `mcp__<server>__<tool>` form so they
  can be listed in `allowed_tools` without a permission prompt.

## Acceptance criteria

- `build_tool_server` turns a list of `ToolDefinition`s into one SDK MCP server
  plus the fully-qualified tool names to allow, and calling a published tool
  runs the underlying executor and returns its rendered observation.
- A tool whose executor raises returns an error result to Claude naming the
  failure instead of propagating out of the handler.
- `translate_message` maps a completed assistant turn, a streamed text delta, a
  streamed tool-input delta, a tool result and a run result onto the normalized
  events, and returns an empty result for a message shape it does not know.
- The invocation log returns the recorded `Action`/`Observation` for a matching
  tool name and argument set exactly once, and `None` afterwards.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | A Rotaris tool published to Claude keeps its own name, description and schema | `build_tool_server` | `tests/unit/providers/test_claude_sdk_tool_bridge.py::test_published_tool_keeps_its_rotaris_name_description_and_schema` |
| Unit | Claude calling a published tool runs the real executor and gets its result | published tool handler | `tests/unit/providers/test_claude_sdk_tool_bridge.py::test_calling_a_published_tool_runs_the_real_executor` |
| Unit | A failing tool reports an error to Claude instead of breaking the session | published tool handler | `tests/unit/providers/test_claude_sdk_tool_bridge.py::test_failing_tool_is_reported_as_an_error_result` |
| Unit | An invocation can be correlated back to its real Action/Observation once | `ToolInvocationLog` | `tests/unit/providers/test_claude_sdk_tool_bridge.py::test_invocation_log_hands_back_each_call_exactly_once` |
| Unit | Every Agent SDK message shape becomes Rotaris's own events, unknown ones become nothing | `translate_message` | `tests/unit/providers/test_claude_sdk_translate.py` (whole module) |

Derived from: [SWR-778 — Claude Agent SDK native agent loop in the Ralph loop](SWR-778-claude-agent-sdk-native-loop.md)

Epic: [Provider Integration & Authentication](../700-providers-auth.md)

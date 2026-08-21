---
req-id: SWR-2129
status: approved
trace: required
test: required
type: technical
derived-from: SWR-500
title: "Malformed tool-call argument repair"
epic: SWR-500
date: 2026-07-23
---

# SWR-2129 — Malformed tool-call argument repair

Tool-call schema alignment (SWR-500) sometimes fails at the boundary of raw
LLM output: providers occasionally emit truncated JSON, a bare unquoted
string, or an object where the schema expects an array (`tasks`/`phases`
list fields) for the `finish` tool call and other structured tool calls.
`src/rotaris_core/agents/safe_agent.py`'s free functions
(`recover_malformed_finish_arguments`, `repair_finish_tool_call`,
`repair_malformed_tool_call_arguments`, `_repair_object_where_array_expected`)
detect and repair these shapes before the SDK rejects the call, so a single
transient formatting slip doesn't fail the whole tool call. This is
hardening infrastructure the tool platform depends on; it carries no product
behavior of its own beyond what SWR-500 already promises.

## Acceptance criteria

- A truncated or raw-string `finish` tool-call payload is recovered into a
  valid arguments dict instead of raising.
- A tool call whose arguments wrap a schema's expected array field in an
  object is repaired in place; already-valid or genuinely mismatched
  payloads are left unchanged.
- Non-`finish` tool calls are never modified by the `finish`-specific repair
  path.

Derived from: [SWR-500 — Tool Platform & Integrations](../500-tool-platform.md)

Epic: [Tool Platform & Integrations](../500-tool-platform.md)

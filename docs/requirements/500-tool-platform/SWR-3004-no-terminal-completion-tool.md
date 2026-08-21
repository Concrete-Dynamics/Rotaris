---
req-id: SWR-3004
status: approved
trace: required
test: required
type: technical
derived-from: [SWR-2132, SWR-2808]
title: "A final assistant message is the completion signal"
epic: SWR-500
date: 2026-08-13
---

# SWR-3004 — A final assistant message is the completion signal

Personas were given the SDK's built-in terminal completion tool (`FinishTool`) on
top of the SDK's own completion path. The SDK already ends a conversation on any
user-visible assistant message with no tool call, so the tool was a second,
redundant route to the same `FINISHED` state — and the more expensive one. Because
a terminal tool call is a tool event that follows the assistant text,
`extract_final_response` (SWR-2132) deliberately withholds `final_response` from a
child that answers and then calls it, which is the sole reason the `answered`
outcome (SWR-2808) and the answer-only acceptance path (SWR-2809) had to key on a
user-visible message instead. Completion shall be signalled by the message itself.

Personas shall be constructed with no built-in terminal completion tool. A run ends
when the agent emits a user-visible message without a tool call; a child that ends
this way shall expose that message as `final_response`, so the deterministic handoff
of SWR-2132 selects it without a fallback to `last_response`.

Prompts that steer an agent away from premature completion shall name the observable
behaviour — ending the turn — rather than a tool that is no longer registered.

The classification and repair machinery that recognises terminal completion tools
shall be retained as-is. `answered` (SWR-2808) and its acceptance path (SWR-2809)
stay in force for any persona or provider that still surfaces such a tool; this
requirement removes the tool from Rotaris personas, it does not retire the outcome.

## Test coverage

Unit coverage over the agent factory asserts that a constructed persona agent
registers no default SDK tools. Unit coverage over the correction prompts asserts
they no longer instruct the agent to avoid a completion tool by name. The existing
`answered`/terminal-tool unit coverage in the scheduler and transcript-progress
suites is unchanged and must stay green, proving the retained path still works.
The originating product flows — deterministic child handoff and stall
classification — are enabled by `derived-from` SWR-2132 and SWR-2808.

Derived from: [SWR-2132 — Deterministic child-result handoff](../100-orchestration-core/SWR-2132-deterministic-child-handoff.md) and [SWR-2808 — Terminal completion signal is not housekeeping](SWR-2808-terminal-completion-signal-not-housekeeping.md)

Epic: [Tool Platform & Integrations](../500-tool-platform.md)

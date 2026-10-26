[Product directives](../directives.md) › PD-MONITOR-003

<a id="pd-monitor-003"></a>

### PD-MONITOR-003 — the run-level agent carries its own tool-call count, and the run's aggregate is the run's total

The run-level agent that the inspector, the Mission view and the persona windows present (the run's synthetic root of
REQ-MONITOR-043, which is never a tree row) SHALL carry, as REQ-MONITOR-044 and REQ-MONITOR-052 give every agent, **its own**
tool-call count and called-tool history: the calls of the session's roots, which is the persisted total less every child's
persisted count, plus the live root's calls not counted yet. REQ-MONITOR-101's "aggregate run count" SHALL be the run's
displayed total of REQ-MONITOR-102, and not the run-level agent's count; no surface draws the run's aggregate called-tool
history, and the run-level agent's called history is the roots' own. The run-level agent's compression count is the
run-wide count (REQ-MONITOR-086). Every other agent node exposes its own count and history, as REQ-MONITOR-101 states.

**As built.** `runLevelAgent` (`packages/ui/src/agents.ts`) reads `SessionRecord.entryToolCalls` (`entryToolCallsOf`,
`packages/engine/src/sessions.ts`, with `Run.entryUncountedToolCalls`), `entryTools.called` and `compressions`; the run's
total is `SessionRecord.toolCalls.total`.

**Why, and what it costs.** OQ-159: REQ-MONITOR-101 gives the synthetic root the aggregate, while REQ-MONITOR-044 and
REQ-MONITOR-052 give every agent as presented its own count on its meta line and do not except the run-level agent. The two
part whenever a child has called a tool. The owner confirmed the agent's own count as built. What it costs: the run-level
agent's `{N} tool calls` is smaller than the run's total whenever a child has called a tool, and a reader adds the children's
counts, or reads the run's total, to see the whole.

> **Narrows:** REQ-MONITOR-101

*Raised by the owner, 2026-10-06; logged as [R-071](../requests.md#r-071), the ruling of OQ-159.*

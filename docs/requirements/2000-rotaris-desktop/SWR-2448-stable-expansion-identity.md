---
req-id: SWR-2448
status: approved
trace: required
test: required
type: technical
derived-from: SWR-2417
title: "Row expansion state keyed by stable identity"
epic: SWR-2000
date: 2026-08-10
---

# Row expansion state keyed by stable identity

Technical requirement derived from SWR-2417. Expanded/collapsed state for tool, thinking, and
delegation rows shall be keyed by a stable per-event identity rather than the row index, so a
box the user opened stays open while the live transcript inserts rows above it. Tool rows key
on their `tool_event_key` (fallback: role + tool + text); thinking rows on role plus
`started_at` (fallback: role + text hash); delegation rows on the agent id.

## Acceptance criteria

- Expanding a tool or thinking row, then inserting rows before it, leaves that row expanded
  and does not expand any other row.
- Rows without any distinguishing key still toggle correctly for a static transcript.
- Search-match highlighting and auto-collapse (SWR-2420) behave as before.

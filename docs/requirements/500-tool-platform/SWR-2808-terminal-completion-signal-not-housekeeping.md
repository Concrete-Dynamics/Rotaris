---
req-id: SWR-2808
status: approved
trace: required
test: required
type: technical
derived-from: [SWR-547, SWR-549]
title: "Terminal completion signal is not housekeeping"
epic: SWR-500
date: 2026-08-07
---

# SWR-2808 — Terminal completion signal is not housekeeping

The stall classifier grouped the terminal completion tool (`finish` / `FinishTool`)
with genuine housekeeping tools (`todo`, `think`). That made the correct way to end
a run strictly worse than the incorrect one: a child that emitted an answer and
stopped classified as `message_only` and could still be accepted, while the same
child that emitted the same answer and properly called `finish` classified as
`housekeeping_only` and was denied every acceptance path. Terminating a run is a
completion signal, not bookkeeping, and shall be classified as its own outcome.

Transcript progress assessment shall recognise terminal completion tools separately
from housekeeping tools. A child that calls a terminal completion tool, produces
user-visible text, and calls no substantive tool shall be assessed as the `answered`
outcome rather than `housekeeping_only`.

`answered` shall remain recovery-eligible, so a child that declares completion on a
route that requires execution still receives the single corrective prompt of SWR-548
and still fails cleanly under SWR-549. `answered` shall be accepted on the same terms
as `message_only` wherever a direct response is already an acceptable result.

## Test coverage

Unit coverage over `_assess_transcript_progress` asserts that a terminal completion
tool plus assistant text yields `answered` (not `housekeeping_only`), that a terminal
tool with no user-visible text does not, and that a substantive tool call still wins.
Scheduler unit coverage asserts `answered` still triggers exactly one recovery prompt
and still produces a failed report when the child does not follow through. The
originating product flow — housekeeping-only stall detection and clean failure — is
enabled by `derived-from` SWR-547 and SWR-549.

Derived from: [SWR-547 — Detect Housekeeping-Only Runs and SWR-549 — Fail Incomplete Execution Cleanly](../500-tool-platform.md)

Epic: [Tool Platform & Integrations](../500-tool-platform.md)

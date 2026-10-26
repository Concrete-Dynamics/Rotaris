# Resolution Record — Domain 20, Machine-Readable Event Stream, Replay, and Trajectory Export — Accepted amendment, 2026-09-06 — A9: export replacement retries

Part 6 of 8 of [domain 20's resolutions](../20-event-history-replay-export.md), which indexes every part.

## Accepted amendment, 2026-09-06 — A9: export replacement retries

The user accepted specification-review item A9. REQ-EVENTS-145 now cites
REQ-TRACE-061 for every export format it governs, including trajectory, batch,
and line-delimited exports. Exhaustion produces a recoverable failure and
preserves the previous destination. REQ-SESSION-033 retains its local summary-file
scope. This closes the export-ladder question recorded in the historical
2026-09-02 amendment above. Implementation verification is tracked in
`SPECIFICATION_RESOLUTION_PROGRESS.md` at the repository root.

**Destination failure, delivered 2026-09-13.** The replacement ladder was already
in place; what was missing was evidence that exhaustion behaves as the amendment
requires. A real refusal — a reader's open descriptor on Windows, a write-denied
parent elsewhere — now drives the ladder to exhaustion and the regression asserts
the recoverable failure, the previous export byte-identical, and no staging
leftover beside it. It found one defect: `replaceDocument` created the
destination's parent outside its own `try`, so a destination whose parent cannot
be created — a file standing where the folder would go — **raised** out of
`writeExport` instead of returning the refusal this amendment requires, and the
run host's export command would have propagated an exception rather than the
recoverable failure the user is owed. The create is now inside the contract, as
`document.parent`.

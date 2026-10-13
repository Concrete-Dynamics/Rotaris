## A near-miss quote that occurs more than once in the file is promised to match exactly

`PD-TOOLS-014`'s near-miss reply (and `PD-TOOLS-015`'s `write_file` refusal, which reuses it) quotes one window's text and says
that, sent back as `old_string`, "the file's text over <range> matches exactly". Level 1 of REQ-TOOLS-136 is a plain substring
search, while the window is whole lines, so the quoted text can occur a second time inside a longer line or across a line
boundary. The retry then matches at level 1 in two places and is refused with "Found 2 occurrences of old_str at lines 1, 2",
the reply that promised it would apply. Example: a file `x = 1\nmax = 1\n` and `old_string` `x = 1 ` match one window (line 1)
at level 2, quoted as `"x = 1"`; `x = 1` is also the tail of line 2. The several-windows reply ("Read the one you mean … and send
its exact text as old_string") fails the same way whenever the windows' text is identical: two lines `x = 1` and `old_string`
`x = 1 ` match two level-2 windows, and either window's exact text occurs twice.

Raised by fin32's review of PD-TOOLS-014 and deferred by fin35; no live run has recorded it (the six level-3 misses of the
`a68f121` duress pack were multi-line, and each quote applied). Recorded 2026-10-13 by fin36 before the repair, from the code at
`origin/main` `4f0dbc0` (`nearMissMessage`, `packages/agent-tools/src/tools/files.ts`) and the R-072 consortium's ruling NQ1.

**Repaired 2026-10-13 (fin36), under [`PD-TOOLS-014`](../../product/directives.md#pd-tools-014) revision 2
([OQ-252](../../architecture/open-questions.md#oq-252)).** `nearMissMessage` counts each quoted window's level-1 occurrences
(`levelOneLines`, the same search `matchEdit` runs); when the text recurs, the facts name the count and the lines (at most 10,
then "and N more") before the quote, "matches exactly" is dropped, and the reply asks for a neighbouring line, unchanged, in both
strings with the reader's offset and limit for the window and one line on each side; the over-30,000-character direction and the
several-windows reply carry the same sentence, and a unique quote's reply is word for word as before. Pinned by four cases under
"PD-TOOLS-014" and one under "PD-TOOLS-015" in `packages/agent-tools/src/tools/tools.test.ts`, each red on the code before, the
pinned several-windows case's expectation now carrying the flag (its two windows are identical); `live-run.mjs`'s near-miss NOTE
counts retries refused "Found N occurrences" (`lib/near-miss-edits.mjs`, target 0).

## Specs

- `PD-TOOLS-014` clause 5 promises that the quote "sent back as `old_string` with the same hash … matches at level 1", which
  holds, and is silent on whether it matches once; the reply reads as a promise that the retry applies, which the "Why" (a retry
  with no read and no probe) depends on. Raised as [OQ-252](../../architecture/open-questions.md#oq-252) and ruled under R-072
  as `PD-TOOLS-014` revision 2.
- REQ-TOOLS-136's "Found <n> occurrences" refusal of the retry is correct and unchanged.

## Relevant files

- `packages/agent-tools/src/tools/files.ts`: `nearMissMessage` (the one-window quote and its "matches exactly" sentence, the
  over-30,000-character direction, and the several-windows direction); `matchEdit`'s level-1 substring search.
- `packages/agent-tools/src/tools/tools.test.ts`: the "PD-TOOLS-014" and "PD-TOOLS-015" cases.

# ADR-0046 — The transcript apply pipeline, and where determinism is enforced — Step 4's REQ-CHAT-048 lookback, per agent — 2026-09-28

Part 8 of 8 of [ADR-0046](../0046-the-transcript-apply-pipeline.md), which indexes every part.

## Step 4's REQ-CHAT-048 lookback, per agent — 2026-09-28

*Recorded under R-062, repairing `docs/defects/fixed/duplicate-reasoning-hygiene-compares-with-the-previous-thinking-row-of-any-agent.md`.*

Step 4 kept **one** lookback for REQ-CHAT-048 — the immediately previous thinking row of any agent — and compared names,
so agent A's repeated burst was displayed twice whenever agent B reasoned between the copies. Read with "per agent"
scoping the whole rule (**OQ-91** states the other reading for the owner), the lookback is now **one per agent**:
the walk keeps each agent's previous thinking row, and the bounded form looks an agent's row up below its cut only
when that agent's unstamped thinking row is in the suffix. The consequence 4 bound is unchanged in kind — the lookup
reads back to that agent's own previous thinking row, or to the window's start where it has none, exactly as far as the
single lookback read when no thinking row lay below the cut — and a suffix with no reasoning now looks nothing up at
all. Measured at 1,200 rows the bounded projection stayed within the same order of magnitude in each of four cases (the
figures are on the note); `projector.test.ts`'s seeded walk, the arbiter that whole-state and bounded agree, is green
over seven seeds and eight switch combinations, and the interleaved cases are pinned beside it. What this could not
show: an interleaved repeat drawn by the built app — `pnpm rows-proof`'s fixtures do interleave two agents'
reasoning, but every reasoning row in them carries a duration, so REQ-CHAT-048 never applies there; the proof shows
only that nothing else it draws moved, and the interleaved repeat is shown in the unit fixtures alone.

# ADR-0046 — The transcript apply pipeline, and where determinism is enforced — Revisit if

Part 5 of 8 of [ADR-0046](../0046-the-transcript-apply-pipeline.md), which indexes every part.

## Revisit if

Step 4's bounded re-projection — the changed suffix, its enclosing fold, and the trailer rows — still
dominates the 250 ms p95 of `REQ-MONITOR-222` at the 5000-row residency bound. The fix is then a
narrower lookback or a cheaper fold representation, **not** widening step 4 back to the whole resident
window, and not removing the stage. Widening was never available as a fallback: `REQ-MONITOR-223`'s
factor of two against an empty session rules it out, which is why step 4 is incremental by decision here
rather than by later optimisation. Or the benchmark shows `refused` moving in a replay that drops no
publication — in which case a hop is losing traffic, and the defect is upstream of this stage.

---

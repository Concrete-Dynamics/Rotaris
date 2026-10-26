# ADR-0046 — The transcript apply pipeline, and where determinism is enforced — The merge with Part AA — 2026-09-07: step 4's group summary was written in the wrong order

Part 7 of 8 of [ADR-0046](../0046-the-transcript-apply-pipeline.md), which indexes every part.

## The merge with Part AA — 2026-09-07: step 4's group summary was written in the wrong order

*Recorded under GD-10, by the manager, on merged main.*

**Forty-six — the group summary carried the header's COLOUR ranking instead of the requirement's own order.**
REQ-CHAT-065 gives two orderings and they run opposite ways. The header's colour is chosen by severity, highest
first: `failed`, `blocked`, `running`, `ok`. The summary is given by example — **"reading ×4 · 3 ok · 1 failed"**
— which is ok first. Step 4 reused `SEVERITY_ORDER` for both and produced `reading ×4 · 1 failed · 3 ok`, and
its own test asserted that string, so the half was green on a falsified reading.

It surfaced because the two halves of this batch implemented one ordering each and disagreed on the string a
group copies as. **Neither half's tests could have caught it** — each asserted its own reading — and what settled
it was the requirement's example rather than either implementation. The falsified reason is kept beside its
replacement in `project.ts`: `SUMMARY_ORDER` is now declared next to `SEVERITY_ORDER` with a note saying why
there are two and that they are deliberately opposite.

There is a second, smaller thing worth the line. The two halves also produced **two implementations of one
grammar rule** — REQ-CHAT-168's "N step(s)" written for the count it carries. Step 4 now computes every trailer's
wording once and the renderer reads it back; `trailerText` is an accessor rather than a second implementation.
The plan named `TrailerRow` in the seam without defining it, which is what let each side invent a shape; a seam
that names a type must give it in full.

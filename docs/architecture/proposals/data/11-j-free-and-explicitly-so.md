# Architecture proposals — DATA slice — J. Free, and explicitly so

Part 11 of 25 of [the data proposal](../data.md), which indexes every part.

## J. Free, and explicitly so

- The physical path and on-disk encoding of the per-user preference store (`REQ-SHELL-006`:
  "Two conformant builds may therefore lay the same keys out differently on disk").
- Retry delay shapes inside the stated bounds (`REQ-LIBRARY-043`: the individual delays and any
  growth between them "are implementation choices, are not observable, and MUST NOT be relied on").
- Whether a checkpoint ref carries a reflog of its own (`REQ-GIT-004`, explicitly not constrained).
- The two skip-part directory names for the implementation language's cache and dependencies
  (`REQ-TRACE-039`, "properties of the implementation language rather than of this product's
  behavior").
- Which third-party services fill the three default tool-server roles, and their pinned versions
  (`REQ-CONFIG-181`).
- All rendered visual appearance: colours, spacing, typography, theming, icon glyphs
  (`REQ-GIT-152`, `REQ-LIBRARY-125`, `REQ-TRACE-261`), except where a requirement names a specific
  visual property.
- Wording, wherever a requirement says "the wording is left to the implementation" — which it does
  in dozens of places, and which is a deliberate reduction of the conformance surface rather than an
  invitation to be vague about the facts each message must convey.
- How much work an invocation repeats internally, provided the result is unchanged
  (`REQ-TRACE-128`, `REQ-TRACE-089`, `REQ-GIT-082`).

---

# Part 2 — Spikes run

Two questions could not be answered honestly from the specification alone. Both were checked with
throwaway scripts under the scratchpad; no product code was written.

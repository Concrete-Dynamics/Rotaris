[Product directives](../directives.md) › PD-CHAT-003

<a id="pd-chat-003"></a>

### PD-CHAT-003 — transcript row density follows the design material's compact flow

*Revision 2 (2026-10-06, [R-071](../requests.md#r-071)) — **the cost paragraph's capacity unit**, the owner's ruling of
OQ-166. The normative clauses are unchanged; the last sentence of "Why, and what it costs" is replaced below and quoted
beside its replacement. Revision 1 (2026-09-13, [R-012](../requests.md#r-012)) is otherwise unchanged.*

The workspace transcript SHALL be drawn at the density the adopted design material proposes for it
(`docs/design/README.md` G7: "the mockup's transcript column is the best available drawing of the
intent"), not at the geometry REQ-CHAT-057's figures produce when composed with per-row padding
and a per-row box minimum. Concretely:

- A row SHALL size to its content. The 30 px minimum row height of REQ-CHAT-057 SHALL NOT apply to
  the row's box; a one-line row (a tool header, a reasoning summary, a system notice) is as tall as
  its line.
- Vertical rhythm SHALL follow the mockup: **12 px** above the first row of a block (a block
  beginning at every row whose role differs from the row above, per REQ-CHAT-057's own attribution
  rule), and no more than **4 px** between consecutive rows of one block. The horizontal 10 px
  margins of REQ-CHAT-057 are UNTOUCHED.
- The transcript MUST NOT add vertical padding per row beyond what the mockup's rows carry. The
  user's own message keeps the surface REQ-CHAT-057's design already earns it (the mockup draws
  that bubble padded inside its tinted box); every other row sits on the background.
- The timestamp column (52 px), the role column (112 px), the 8 pt monospace timestamps, the
  attribution rule and the 2 px persona continuation bar of REQ-CHAT-057 are UNTOUCHED and still
  govern.

Rows MUST remain readable at this density: this directive changes spacing, not legibility, and no
row MAY be drawn so tightly that its content lines touch or its hover wash clips its text.

**Why, and what it costs.** The owner measured the built transcript (2026-09-13 screenshot) and
read it as large spacing that makes the conversation hard to follow: the requirement's figures,
taken with the row stylesheet's `min-height: 30px` + `padding: 8px 12px` + `margin: 5px`, yield a
row pitch of roughly 46–50 px where the mockup's blocks sit 12 px apart and a one-line row is
~17 px. The specification was faithful to its target and is not wrong; the owner wants something
else — the mockup's compactness. The cost is that rows no longer carry their own breathing room,
readability at density leaning on line-height and the block gap instead, and — revision 2 — that the
recycled pool's capacity is counted in the shortest row a slot can hold, 20 px (`SHORTEST_ROW_HEIGHT` in
`packages/ui/src/transcript/constants.ts`), so a tall viewport of short rows binds enough slots, while the
30 px figure (`ROW_MIN_HEIGHT`) stays the floor of the estimate a row is positioned by before its first
measurement.

> *Revision 1 said, and no longer governs:* "and that the recycled pool's capacity arithmetic
> (`ROW_MIN_HEIGHT` in `packages/ui/src/transcript/constants.ts`) keeps the 30 px figure as a conservative
> slot-size floor while real rows may be shorter." A unit taller than the shortest row binds fewer slots
> than a tall viewport of such rows shows, so for capacity the 30 px figure was the opposite of
> conservative (acceptance finding A38, repaired 2026-10-01).

> **Narrows:** REQ-CHAT-057

*Raised by the owner, 2026-09-13; logged as [R-012](../requests.md#r-012).*

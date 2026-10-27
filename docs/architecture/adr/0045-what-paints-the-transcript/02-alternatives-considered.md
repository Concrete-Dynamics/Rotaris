# ADR-0045 — What paints the transcript: a fixed-capacity recycled row pool — Alternatives considered

Part 2 of 7 of [ADR-0045](../0045-what-paints-the-transcript.md), which indexes every part.

## Alternatives considered

**A — A keyed list with a standard virtualiser.**

*For:* idiomatic; variable row heights are a solved problem; accessibility, selection and links come free
from the document model; character-exact selection over Markdown is native behaviour; keyboard
navigation is ordinary focus management.
*Against:* **it fails the element-count invariant, on a ground that survives whichever way the counting
rule below is settled.** A virtualiser mounts and unmounts row containers as the visible set moves, and a
row container is an application-owned structural element on *any* reading of `widgets`. So the count
changes whenever the number of mounted rows changes, and three of the six post-construction phases change
it: `ordered_appends` and `streaming_updates` each **clear the transcript** and refill it
(`REQ-UIBENCH-056`, `REQ-UIBENCH-057`), and the resize sweep moves the window through five sizes
(`REQ-UIBENCH-060`). `REQ-UIBENCH-054`'s "must not change" is broken in each. The objection deliberately
does **not** rest on the element count varying *inside* a row: the counting rule this record adopts
accounts that variance to `ui_objects`, so an argument resting on it would be void under the very
definition that saves option C, and an alternative must not be killed by a reason the Decision then
neutralises. Separately, A sits awkwardly with the cache rule: the framework owns element identity, so "a
retained rendering is reused only while identity, content, laid-out width and expansion state are
unchanged" becomes a memoisation convention rather than an enforced cache with an **observable entries
and characters occupancy**.

**B — A canvas-painted transcript.** One element per transcript, rows measured and painted by our own
code, with a retained-rendering cache of offscreen bitmaps.

*For:* the element-count invariant becomes trivial — one element, forever. The two caches and the fixed
metrics map directly onto a measurement cache and a painted-tile cache with real occupancy figures.
Paint cost is exactly "visible rows". It is the closest analogue to the specification's own vocabulary.
*Against:* **it forfeits the document model's accessibility and selection, and both are hard
requirements.** Pointer selection of exactly the characters covered, in every row category including
rendered Markdown; keyboard navigation and per-row accessible names; accessible descriptions everywhere;
accessible descriptions on tool rows and group headers. Meeting those over a canvas means building and
maintaining a parallel accessibility tree and a text-selection model by hand — a large, permanently
load-bearing subsystem whose failure mode is "a screen-reader user cannot read the conversation". **That
is too much risk to take for a benchmark counter.**

**C — A fixed-capacity recycled row pool.** The transcript is a scroll container holding a **constant**
number of absolutely positioned row slots, allocated at window construction and never added to or
removed from. Scrolling and content changes rebind slots to row indices and mutate their contents in
place; a slot showing nothing is emptied rather than unmounted. Row *content* is produced by a per-slot
renderer that reuses a cached rendering when the four-part key matches. Chosen.

*For:* the invariant holds if the pool is fixed and content mutation does not change the element count
within a slot. Rows remain document elements, so selection, keyboard navigation, accessibility,
tooltips and vector icons all remain native. Work is proportional to visible slots and changed slots.
Anchor restoration is natural because slots are positioned from a measured offset table rather than from
document flow. The caches are explicit objects with real occupancy.
*Against:* it is a recycler, not an ordinary list — the slot index must be the framework key, never the
row identity, or the framework unmounts and remounts. Content mutation within a slot must also be
count-stable, which is the hard part: a Markdown body produces a different number of elements for
different content. Variable row heights need our own measurement pass. It is more code than A, and it is
code that must be right.

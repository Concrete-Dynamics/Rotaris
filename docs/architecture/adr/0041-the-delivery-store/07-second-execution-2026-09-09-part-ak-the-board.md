# ADR-0041 — The delivery store is per-requirement rows in the workspace database, behind a capability-split handle — Second execution — 2026-09-09 (Part AK′), the board

Part 7 of 16 of [ADR-0041](../0041-the-delivery-store.md), which indexes every part.

## Second execution — 2026-09-09 (Part AK′), the board

*Recorded under GD-10, the standing policy that a mechanism's first execution reports back into the record that
decided it. The first execution built the store, the transition and the projection; this one draws them. Two defects
of ADR-0058 consequence 17's pattern, `AK2-1` to `AK2-5` — three of them found after this note was first written, by
the verification it invited; the manager assigns the ordinals at merge.*

**What the board is, against this record's decisions.** The view reads ONE immutable projection per generation over
the `requirements.*` command family and assembles nothing locally (`REQ-TRACE-378/379`), which is the renderer half of
the "one value, one generation" decision. The write path is single: `requirements.act` with an action from the closed
set, and no card comes to rest anywhere the engine did not put it — an optimistic label is shown for the round trip
and the resting state is the next projection's (`REQ-TRACE-387/388/399`). Live refresh is channel 10, and a change
that names the requirements it affects replaces only those cards, so the memoised card of an unnamed requirement keeps
its element (`REQ-TRACE-374`). The clock is injected and read once per board arrival and once a minute after, never
per render (`REQ-TRACE-250`).

**Defect `AK2-1` — the filter selects tore the window down.** The five `<select>` handlers read
`event.currentTarget.value` INSIDE the deferred `setFilter` updater. React had already pooled the event by the time the
updater ran, `currentTarget` was `null`, and the first filter a person chose threw inside a state updater — which React
answers by unmounting the whole tree, so choosing a filter blanked the window rather than filtering the board. The
value is read in the handler now and the updater closes over it. No reading of this record was wrong; the surface was.
Recorded at the site in `RequirementsView.tsx`.

**Defect `AK2-2` — virtualising one dimension left the other unbounded.** `REQ-TRACE-358` speaks of the cards within a
column's own scroll viewport, and the first build virtualised exactly that: each column realised the band its own
vertical scroll exposed. But `REQ-TRACE-237` makes the COLUMNS area scroll horizontally too, and `REQ-TRACE-300`'s
supported bound is a hundred populated columns. Grouped by epic, a 1,500-requirement store therefore realised a
hundred columns' bands in one commit — about 1,300 card widgets and a 1.7 s long task — for four columns in view, and
`REQ-TRACE-239`'s budget was missed by more than an order of magnitude on an axis switch. A column now decides whether
it is on screen against the columns area itself, in a layout effect before the first paint, re-decided once per frame
on horizontal scroll and on resize; off-screen columns keep their heading, their count and their full scroll-range
spacer, so a column's scroll offset survives (`REQ-TRACE-335`) while it realises no card. **Bounding the cards was not
the whole of it, and the proof is what said so.** Its first measured run still cost a 151 ms long task on the axis
switch while only 48 card widgets stood across the hundred columns — the fix was working and the budget was still
missed — because the remainder was the per-column work itself: a viewport read and a `ResizeObserver` registration on
each of a hundred lists, in the single commit that switches axis. An off-screen column now reads no geometry and
observes nothing; it keeps its spacer, so its scroll offset still survives, and it costs nothing to exist. A third reading followed the second, because the
proof again said the figure had not moved: `Column` is memoised now, so the realised-count bookkeeping of the columns
in view no longer re-renders all one hundred. **None of the three closed the gap.** The card bound is real and is
kept, the off-screen guard is right and is kept, the memoisation is right and is kept — and the axis switch still
costs 150 to 170 ms. What the sequence establishes is where the cost is NOT, which is worth recording precisely
because each attempt was a plausible reading of the same requirement and each was measured rather than argued. What
remains is the single commit that creates a hundred column subtrees and lays out a 28 820 px row.
The reading that was wrong is
the one this record's "Revisit if" warned about in the other direction: the cost at scale was never the query, it was
the paint, and the requirement that bounds it is a two-dimensional one read as one-dimensional.

**Defect `AK2-3` — a hundred columns were built to show five.** The fourth reading, and the one that closed it. The
three above all left the hundred `Column` components standing and tried to make each cheaper; what was over the
budget was building a hundred of anything at all. So the board now realises COLUMNS the way a column realises cards:
the view decides, from the laid-out boxes, which columns the area's own viewport exposes, and builds only those.
`REQ-TRACE-239` asks for exactly this — "the work of displaying it SHALL be bounded by what is on screen rather than
by how many requirements the store holds" — and `REQ-TRACE-358` is its mechanism; reading that in one dimension when
the area scrolls in two was the whole of the error.

What made this look impossible from inside the third reading was a **tension with `REQ-TRACE-300`**, which forbids
truncating, hiding or refusing a column on account of how many there are, and which the proof asserted by counting a
hundred columns in the document. Virtualising columns by removing them would have failed that assertion, and the
handoff recorded the two as irreconcilable — either 300 means a hundred columns must EXIST, or the assertion should
read the count off the board's model. **Both readings were unnecessary.** An unbuilt column is not removed: it keeps a
placeholder of exactly its own box, carrying its key and its count. Its width, its place in the row, its share of the
horizontal scroll range and every other column's position are unchanged, so a hundred columns are present, the row is
still 28 820 px, `REQ-TRACE-237/238/335` hold as literally as before, and the column is built — heading, cards,
accessible description — in the update that brings it into view. The proof asserts BOTH halves now, which is stronger
than either reading would have been: a hundred columns present, the row a hundred minimum-width columns long, and
fewer than a hundred built. A folded column is never virtualised, because a rail holds no card widgets already
(`REQ-TRACE-311`) and its accessible name is what `REQ-TRACE-320` asks a reader to find.

Two further costs were found and removed while measuring it. The margin either side of the viewport was one whole
column, chosen by analogy with `REQ-TRACE-360`'s five cards; measured, it builds a sixth column to cover a wheel notch
the band re-decides within the frame anyway, so it is half a column now. And a newly built column began from the
built-in 128 px card estimate, built eleven cards for a column of fifteen, adopted the measured mean in the layout
effect that followed and discarded three — fifty-five widgets built to keep forty, inside the same update. A card is
the same widget in every column, so a mean this board has actually measured is now what the next column starts from;
`REQ-TRACE-361` requires a column to keep using an estimate until one of its own cards has completed layout, and it
does not require that estimate to be a constant.

**The keyboard was the thing this could have quietly broken, and it did not.** `REQ-TRACE-300` requires a hundred
columns to stay keyboard-operable. Traversal used to walk the built columns in the document; it walks the board's
columns now — every one is a child of the area, built or not — and where the neighbour is not built it is scrolled
into view and takes the focus in the update that builds it. `REQ-TRACE-364`'s reveal does the same for a card whose
column is not built. The proof's fold section is where this is exercised end to end: at 1264 px the Done column lies
outside the area's viewport, so it holds no heading and cannot be clicked — by a person or by a proof — and the proof
scrolls to it first and then folds it, which is the other half of `REQ-TRACE-300` demonstrated rather than argued.

**Defect `AK2-4` — the detail drew six sections where the specification fixes five.** `REQ-TRACE-271` says exactly
five and spec 08's vocabulary list names them; `REQ-TRACE-278/280` separately require a revision-history panel with
three states. The first build drew the panel as a sixth peer — same test identifier, same class, same kicker — so the
file contradicted its own `DETAIL_SECTIONS` constant and anything counting the detail's sections found six. The
reading taken, and stated at the site: 280's "history panel" is its own surface within the detail view and not one of
271's five. It keeps its own identifier and its own class, the five stay five, and a test pins both.

**Defect `AK2-5` — the proof's own instrument measured the wrong window.** The long-task observer was re-armed before
each measurement by clearing its array and registering a fresh `PerformanceObserver` with `buffered: true` — and
`buffered` replays the entries recorded before that observer existed. Every window after the first therefore reported
the longest task since start-up, not the longest task in the window: the axis switch was reading the board's own
arrival back as its own cost, and one run printed a 102 ms arrival as a 102 ms switch. The observer is registered
once, every entry keeps its start time, and a read takes only the entries that began at or after the arming. This is
recorded because a measurement that cannot be attributed is not a measurement — and because it cuts the other way
too: arrival never cost more than 74 ms in any run, so nothing at the 150 to 180 ms scale can be explained by the
replay and the breach those figures recorded was real.

**What the first execution left for the board to state, and how it states it.** Four things the projection cannot carry
are printed in the section that would have shown them rather than left blank or invented: the current requirement hash
(`REQ-TRACE-256` puts it on the card value; `BoardCard` has no field, and the detail says the engine compares it on
every action instead); eight of `REQ-TRACE-274`'s twelve relation tokens, which the requirement document format
declares nowhere, named in the Relations section as tokens the projection cannot emit; `superseded` health, which no
store datum can reach, so no card can ever carry it; and `run.waitingOnPerson`, which is carried and always false
because no signal for it exists yet. `REQ-TRACE-346`'s analysis flag is stated as the pass reports it and deduced from
nothing. This is the same discipline the first execution used for the stated refusals, applied to a drawn surface.

**Found in the store and the projection: nothing.** Every value the board needed was on the projection or derivable by
`ui-core`'s pure display mapping; no query was added, no table was touched, no transition rule was changed, and the
`facts` channel the first execution chose (`Units`, `Last run`, `Last change`) carried what the card needs without a
seam change. The one thing the surface wanted and the seam does not offer is a unit count and a last-run stamp as
FIELDS rather than facts, which is an additive seam change nobody needed to make.

**`REQ-TRACE-239` is measured now, and this record's "Revisit if" is answered — in part, and not in the direction
expected.** That paragraph said no measurement of the 100 ms budget at `REQ-TRACE-300`'s scale existed and that the
claim was a design expectation. It is measured now, and the expectation held for one path and **failed for the other**.

*Met.* Putting a board on screen is within budget everywhere it was measured: **21 ms** on the fixture store at
1264 px (longest long task 56 ms), **14 ms** at `REQ-SHELL-022`'s 1000 x 680 minimum, and **26 ms** on a generated
1,500-requirement, 100-epic store (longest long task 69 ms), each read as the view's own figure from the projection's
arrival to the laid-out DOM. The post-debounce filter recomputation over 1,500 requirements is within `REQ-TRACE-367`'s
budget too. At `REQ-TRACE-300`'s hundred populated columns the board realises **48** card widgets, not the ~1,300 it
realised before `AK2-2`, and a column of 1,500 members realises 8 to 13 of them across a scroll from end to end.

*Not met.* **Switching the grouping axis to a hundred populated columns costs the interface thread 150 to 170 ms**,
over the budget, measured three times on this machine: 151 ms before `AK2-2`'s later halves, then 171 ms and 158 ms
after them, with no competing process for at least part of that. Two fixes were tried against it and neither moved
the figure, and both are kept because each is right on its own terms: an off-screen column now reads no geometry and
registers no observer, and `Column` is memoised so the realised-count bookkeeping of the columns in view no longer
re-renders all one hundred. The remaining cost is therefore not the cards, not the per-column effects and not the
render cascade; on the evidence it is the single commit that creates a hundred column subtrees and lays out a
28 820 px row. **This is recorded as unmet rather than argued away, and the proof's assertion is left in place and
failing.** What has not been tried, in the order a later hand should try it: realising the column SUBTREES the way
the cards are already realised, so a hundred columns cost what six do; and deciding whether `REQ-TRACE-239`'s budget
governs a re-grouping at all, which is a question for the specification and not for the person whose code is over it.
The first thing this record said to check if the budget were missed — whether the board query and the export share a
read path — is not the cause: the query is one read of one projection and the cost is entirely in the paint.

*Met, after `AK2-3`, and the paragraph above is kept as it stood rather than rewritten.* On the repaired tree the axis
switch to a hundred populated columns costs **72 ms and 89 ms** in two consecutive green runs of the proof, one long
task each, against the same proof's 151 / 171 / 158 ms before it. Five runs after the repair read 87, 89, **134**, 72
and 89 ms; the 134 is named rather than dropped, and it was taken while four other builds were launching Electron on
this machine. `REQ-TRACE-088`'s reference conditions — "one execution thread on a contemporary developer workstation
… timing the work alone" — are not those conditions, which is why a red on a timing budget is re-run alone before it
is read; the same machine's board arrival moved from 21 ms to 64 ms over the same period without a line of the board
changing. The margin at the bound is real but it is not large, and that is stated rather than smoothed.

Around it, on the same two runs: putting the board on screen costs **45 to 64 ms** on the fixture at 1264 px (longest
long task 0 to 67 ms — 0 meaning no task reached the 50 ms threshold at all), **40 to 47 ms** at `REQ-SHELL-022`'s
1000 × 680 minimum, and **60 to 73 ms** on the generated 1 500-requirement, 100-epic store. At `REQ-TRACE-300`'s bound
the board holds **100 columns present** of which **5 are built**, carrying **40 card widgets**, in a row 28 820 px
wide against a 1 134 px viewport, with the board's own model reporting a hundred columns; the post-debounce filter
recomputation over 1 500 requirements costs 7 to 9 ms against `REQ-TRACE-367`'s 100 ms. The proof's `scale` section is
the regression for all of it, and it now asserts the presence and the boundedness together, so neither can be met by
giving up the other.

**Not built here, stated:** every pane (`REQ-TRACE-417..445`), runs from the board and the queue's controls
(`464..483`) and the source write are Part AP's; the graph axis (`322..333`) is wave 3's; `REQ-TRACE-514`'s export is in
no part yet; `REQ-TRACE-486`'s evidence chord is bound on the focused card rather than registered on the command
registry, because the row allows this part one registry entry and `REQ-TRACE-390`'s move control takes it. The
`edit`, `create`, `accept-proposal` and `accept-change-work` refusals stand exactly as the first execution left them.

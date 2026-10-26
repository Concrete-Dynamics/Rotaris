# ADR-0041 — The delivery store is per-requirement rows in the workspace database, behind a capability-split handle — Third execution — 2026-09-11 (Part R″), the lane closed end to end

Part 9 of 16 of [ADR-0041](../0041-the-delivery-store.md), which indexes every part.

## Third execution — 2026-09-11 (Part R″), the lane closed end to end

*Recorded under GD-10. Defects are numbered `R2-n` here; the manager assigns the ordinals at merge, and the tally
stands at sixty-eight before them. This execution took the seam the second execution named and left open — "the five
panes are built and exported and nothing in this branch hosts them" — and closed it, then drove `REQ-TRACE-499` over
the composition that results.*

**Built and run.** The board hosts the five panes through Part AP's own registry (`REQ-TRACE-369/370/375`): one
registry per window and workspace, a pane built the first time it is needed and reused after, `installed` answerable
for every key without constructing anything, and a workspace change discarding them all. The two board-level panes —
the queue and creation — are reached from the board's header; the three that are about ONE requirement — review,
blockers, the editor — are reached from that requirement's detail, because the detail is the only surface that knows
which requirement they would open against. The elevation's disclosure (`REQ-TRACE-472`) now stands where the
specification puts it: between the first action of a launch that would start a run and anything being written. The
protocol is Part AP's, unchanged — `requirements.runs {op:'preview'}`, the dialog, `requirements.act` carrying
`payload.disclosure`, then `requirements.runs {op:'dispatch'}` — and abandoning sends nothing at all, which is how
`REQ-TRACE-472`'s "nothing whatsoever happens" is met: by not speaking, not by a rollback. The relationship graph of
`REQ-TRACE-322..333` and `REQ-TRACE-505`, which the first and second executions both left where they found it, is
built as a **presentation** of the board centred on one requirement rather than as a grouping axis, because an axis
has no centre; its model is pure and unit-tested, its walk is breadth-first with first-seen depth winning, and its
surface is depth columns of focusable node controls beside a textual edge list, which is what `REQ-TRACE-328` fixes.

**Found (1) — `R2-1`: the queue pane had no way back.** Three of Part AP's five panes carry a Close control of their
own and the queue does not, because the queue was built to be hosted and the host had not been written. Mounted as
they were, opening the queue left the board unreachable until the view was switched away and back. The way back
belongs to whoever opened the pane, so the host draws its own chrome — a titled bar with one Close control — above
whichever pane is open, and the panes' own controls stay as they are. Found by driving the surface, not by reading it.

**Found (2) — `R2-2`: the observable state could not see the panes, so the first proof of the registry was vacuous.**
`window.__rotarisBoard` reported the cards, the columns and the budgets, and said nothing about which panes were
built. A proof written against the DOM alone can see that a pane is on screen but not that a SECOND open reused the
first — which is the whole of `REQ-TRACE-369` — so the observable now carries, per key, whether the pane is installed
and the moment it was built. The assertion that re-opening the queue leaves `openedAt` unchanged is the one that can
fail; without it the proof would have passed against a host that rebuilt the pane every time.

**Found (3) — `R2-3`: the renderer built cleanly and threw on the first pane.** `PANE_TITLE` was dropped from an import
while the chrome that uses it did not yet exist, and then that chrome was written. `tsc` would have caught it; the run
of `pnpm check` that would have caught it read the file moments before the edit, and **a bundler does not resolve
identifiers**, so the build was green and the renderer threw `PANE_TITLE is not defined` the first time a pane opened —
which React answers by unmounting the tree. Found by the proof's own evidence: every pane reported `installed: false`
and the card had vanished from the DOM at the last read. **The lesson is the schedule, not the typo:** a check whose
`tsc` step ran before the last edit proves nothing about the bytes that were built.

**Found (4) — `R2-4`, in the proof: the eval readers were left pointing at the old times.** When the resting read was
moved to make room for the reveal, the two readers that consume it were not moved with it, so the assertion read the
reveal's `true` and reported "sits in undefined" while the launch's own evidence showed `column: "done"` at that moment.

**Found (5) — `R2-5`, in the proof: the refusal was read before it was drawn.** The epic-axis drag assertion read the
card's feedback in the same tick as the synthetic `dragstart`, saw an empty list and reported "the refusal was silent"
where the product had refused in words. The read waits two frames now, as every other driven assertion here does.

*The four below were found by the gate-3 verifier against the BUILT product and the committed proof, after this note
was first written. They are recorded in the same list and on the same terms, because a defect found by the reader
after the writer stopped looking is still a defect of this execution — and three of the four are of one kind: an
assertion that read a name, an attribute or a null, where only a measurement could have answered.*

**Found (6) — `R2-6`: the relationship graph's node controls were never painted.** `.req-graph__columns` is a flex item
whose `overflow-x` is not `visible`, so its automatic minimum size is zero; the edge list below it took the free space
and the wrapper was shrunk to a height of 0 and clipped its ten node buttons away. The controls were in the DOM,
carried their identifiers and their kinds, and were focusable — and the surface showed the summary, the bound statement
and twelve edge sentences with nothing between them. `REQ-TRACE-328` fixes node controls **laid out** in depth columns,
and a queryable control is not a laid-out one. `flex: none` gives the wrapper its content height. The reason the proof
passed is the finding's whole point: its `panes` stage read attributes through `querySelectorAll` and never a box, so
it could not tell a drawn graph from a clipped one. It measures the wrapper and the first node now, at both depths.

**Found (7) — `R2-7`: the pane host's own chrome was undrawn.** The bar added to repair `R2-1` had no rule in
`shell.css` or anywhere else, so it drew as a block with no padding, no gap and no rule beneath it: the kicker and the
Close control sat flush against each other, above the pane's own heading, and the surface therefore named itself twice.
Its rule now follows `.req-pane__header`'s pattern, and the duplication is settled by deciding it: the host names no
pane. All five panes draw their own `<h2 class="req-pane__title">`, so the host's business is the way back, and the
pane's identity travels on the Close control's accessible name.

**Found (8) — `R2-8`: three token-shaped names that the token set does not define.** `--rt-control-sm`,
`--rt-focus-width` and `--rt-focus-offset` occur nowhere in `packages/contracts/src/theme/themes.ts` and nowhere in
`docs/design/system/`; each appeared exactly once in the repository, in this Part's own two rules, so what rendered was
the fallback literal beside it. **A token-shaped name that resolves to nothing IS the literal** the design rule
forbids, and it is worse than an honest literal because it reads as compliance. The focus rule is dropped outright —
the house rule `:where(button, …):focus-visible` already rings these buttons with the real `--rt-focus-ring-width` and
`--rt-focus` — and the depth input's height is dropped with a stated reason: **the token set holds no control-height
token at all**, and the one compact-control height in `shell.css` is a bare `24px` in the board's own header, which is
a violation to raise rather than to copy. Raised as a ruling request in the handoff.

**Found (9) — `R2-9`, in the proof: a `REQ-TRACE-497` clause that asserted nothing.** The rotated-text-on-a-folded-rail
clause was written in the `panes` stage as `if (shapes.rail !== null) expect(…)`, and the `panes` profile folds no
column — so the read answered `null` and the clause was vacuous in every run that reported it as met. It is asserted in
`fold`, which folds a column, together with `REQ-TRACE-493`'s two accessible names and the rail's operability without a
pointer; the `panes` stage now asserts the rail's ABSENCE, so a rail arriving there fails rather than re-guarding. In
the same finding: `expect(deeper.nodes.length >= graph.nodes.length)` passed with ten against ten, because the fixture's
neighbourhood of REQ-101 is exhausted at depth 2 — an assertion a depth control that ignored the value would also pass.
The saturation is asserted as the fact it is, and the claim that a deeper walk admits more is asserted on a chain
fixture built for it in `graph.test.ts`.

**Readings recorded.**

- *`REQ-TRACE-465`'s stop control is met by navigation, and that is a reading rather than a repair.* The second
  execution left the button missing. The specification requires pause, steer, stop and answer to operate on a
  board-started run for the whole of its life; `REQ-TRACE-475` separately forbids the requirements view to build a
  transcript, an agent tree or a worktree listing of its own and requires it to link out, carrying the session
  identifier, to the surface that owns each aspect. Those two together say the board's obligation is to make the
  session reachable, not to grow a second set of run controls; the workspace view's stop operates on the same live
  handle (`REQ-TRACE-464`). The board offers the session opener on the card, in the detail's execution section and on
  the queue row that is waiting on a person. What is NOT built is a stop button on the board, and the reason is
  stated here rather than left as an omission.
- *The detail's "read-only" sentence was falsified and is replaced.* It read "writing into the source is Part AP's and
  not built in this version". Part AP built it and this execution hosts it; the sentence now states the source's
  actual writability and what to do when it is read-only (`REQ-TRACE-498`'s source row). The falsified reason is kept
  here beside its replacement, as the record's standing rule requires.
- *A reading of this record's own that turned out wrong, corrected here beside it.* The first version of this note
  reported `REQ-TRACE-499` as "released at about 11 s, running by 18 s, at review by 23 s, accepted at about 36 s,
  resting in `done` at 38 s". **Those were not durations the product produced.** They were the moments in the proof's
  `ROTARIS_CAPTURE_EVAL_AT` schedule at which the script LOOKED — 13000, 18000, 23000, 29000, 38000 ms after the
  launch — so every one of them is an upper bound on when a state was first observed and nothing more. The gate
  demonstrated it by running the same work on a different schedule and getting different figures. The proof now reads
  the transition times from the store's own rows (`delivery_history.at`, `delivery_runs.started_at` and `ended_at`),
  which is where the product records what it did, and reports the schedule as a schedule.
- *Measured, with the machine's state beside every figure* (two other agents were building and proving on this
  machine throughout; free physical memory is the variable that moved). **`REQ-TRACE-499` end to end, in the built
  application, read from the delivery store** (run of 2026-09-11 at 1.6 GB free): release recorded at
  `11:14:54.154Z`, the run's own row started at `11:14:58.256Z` and ended at `11:15:03.119Z`, the accept recorded at
  `11:15:18.560Z` — **4.1 s from the release to the run starting, a 4.9 s run, 24.4 s from the release to the
  acceptance**. Across four runs of the repaired proof the same three figures read **3.4 to 4.9 s**, **4.8 to 5.0 s**
  and **24.39 to 24.41 s**, which is the difference a measurement makes: the acceptance figure is the proof's own
  scripted wait and is therefore nearly constant, while the two the product owns move with the machine. *Observed by*
  the proof's schedule, which is a different kind of statement: backlog by 13 s, running by 18 s, at review by 23 s,
  `done` by 38 s. The delivery store afterwards holds **exactly
  one** release entry for two launches — the first disclosure was abandoned — an accept entry, and **one** run row
  carrying its session identifier and the permissions it was granted, which is `REQ-TRACE-472` and `405/464` read
  from the store rather than from the screen. **The pane registry:** `review` installed with a single `openedAt`
  that does not move when the pane is opened again, the other four `installed: false` after being asked about.
  **`REQ-TRACE-300/239`'s axis switch** — the one number in this lane never taken on a quiet machine — read 76 ms on
  the base commit at 2.93 GB free, 107 ms and 122 ms on this branch at low memory with two other agents' Electron
  proofs live (1.26 GB free for the second), and under the budget again on this branch at 2.53 GB free; Part AK′
  recorded 72, 87, 89, 89 and 134 ms for it. **The budget was not lowered and the assertion was not relaxed**: a
  breach is reported at the end of the script instead of stopping it, so a load-sensitive figure can no longer hide
  the evidence that follows it. Whoever merges should re-measure it idle.
- *The graph is not a tab.* The mockup's `REQUIREMENTS` screen carries Kanban / List / Graph tabs, which is craft; the
  specification fixes the axes (`REQ-TRACE-293`) and asks for a graph "centred on one requirement" (`REQ-TRACE-322`),
  which is not an axis value. Opening it from a requirement's detail is what makes a centre exist before the graph
  does, which is also what `REQ-TRACE-333` requires — no graph content and no contents summary before a centre has
  been chosen.

**Not built here, stated.** `accept-proposal` and `accept-change-work` remain the refusals this record's first
execution wrote, naming OQ-45's improvement store; the derived technical proposals of spec 08 §1116 are read and
shown by the review (the run's `proposed-requirements.json`, `REQ-TRACE-427/430`) and cannot be ACCEPTED, because
accepting is what causes the write (`REQ-TRACE-429`) and there is no store to write into. *Falsified, corrected
2026-10-13 (the sentences above kept as written): the store an accepted proposal writes into is the project's own
requirement source, whose write path `requirements.source.write` was built on 2026-09-10, the day before this passage;
OQ-45's improvement store is a different store, and that question closed on 2026-09-11. `accept-proposal` is built since
2026-10-13 ("Execution — 2026-10-13" below); `accept-change-work` waits on REQ-TRACE-409..416's offers, not on any store.* `REQ-TRACE-465`'s stop
button (above). `REQ-TRACE-409..416`'s offers, `278..280`'s source revisions and `REQ-TRACE-514`'s export, all where
the earlier executions left them.

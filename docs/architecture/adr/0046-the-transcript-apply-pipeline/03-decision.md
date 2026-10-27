# ADR-0046 — The transcript apply pipeline, and where determinism is enforced — Decision

Part 3 of 8 of [ADR-0046](../0046-the-transcript-apply-pipeline.md), which indexes every part.

## Decision

**Alternative B**, extended with the sequence check. On receipt of a publication, in order:

0. **Sequence check.** Does the publication's number equal the number this surface expects? If not, the
   surface has missed a publication (`REQ-MONITOR-214`): classify **`refused`**, apply nothing, record
   the diagnostic `REQ-MONITOR-226` requires, stop consuming increments, and request a whole read. The
   check is a comparison of two integers and nothing else.

   Three rules make this well defined, and each of them matters:

   - **An expectation is created by a whole-session update and by nothing else.** A surface that has
     not yet received one — because it has just subscribed, just become visible, or just changed focus
     — has no expectation, cannot observe a gap, and must not classify one. It adopts the number the
     whole-session update carries. **Un-hiding a window therefore never produces a `refused`**, however
     far the counter advanced while it was not listening.
   - **A whole-session update always sets the expectation rather than testing it.** It is the *begin*
     of `REQ-MONITOR-214`'s rule. Applying one after a focus change or a reconcile classifies `reset`
     under step 2, never `refused`.
   - **A number at or below the expectation is a superseded publication, not a gap.** It is discarded
     with no counter movement — this is the mechanism `REQ-MONITOR-225` names for "a stale read must
     never overwrite newer content, however long the earlier read took to arrive". Only a number
     *above* the expectation is a gap.

1. **Applicability check.** Is the earliest-changed index within the rows this view holds, and does the
   increment preserve the order of rows already displayed? If not, classify `refused`, do nothing else,
   and request a whole read. **Refusal is an ordinary reported outcome and must not interrupt the user
   or blank the transcript**, and the displayed rows stay in place until the replacement set is ready
   (`REQ-MONITOR-224`, `REQ-SESSION-161`).
2. **Reset check.** Earliest-changed index 0 on a shrunk transcript, or a snapshot after a focus change
   or a reconcile, classifies `reset`: discard the displayed rows and rebuild.
3. **Row-level classification.** Otherwise compare incoming with displayed from that index: one
   `insert` per row added, one `remove` per row removed, one `update` per retained row whose content
   changed; if nothing changed at all, **one `noop` and no row counters**.
4. **Projection.** Apply the role-to-kind mapping, duplicate-reasoning and dead-session hygiene, edit-
   diff row placement, tool grouping, display caps, and finally append the computed trailer rows. **Two
   bounds on this step are normative, not optimisations to reach for later.**
   - **Its input is the resident window, never the session.** `REQ-SESSION-192` caps residency at the
     5000 most recent rows and `REQ-CHAT-165` defers to that cap, so the array step 4 is handed is
     constant in the length of the session however long the session runs. That is what discharges
     `REQ-CHAT-055`, `REQ-CHAT-154` and `REQ-CHAT-157`. An earliest-changed index below the resident
     window addresses a row the view does not hold and is refused at step 1, so step 4 never has to
     reach past the window's start.
   - **Its work is bounded by what changed, not by the window.** Step 4 re-projects from the
     earliest-changed index only, walking back no further than **the nearest group boundary at or before
     that index** so that one fold can be recomputed, and recomputing the trailer rows whole because
     they are bounded by what is pending rather than by the transcript. This is required from the
     outset: `REQ-MONITOR-223` compares against an **empty** session and allows a factor of two, and a
     full 5000-row re-projection per update is not within a factor of two of no rows at all. Every part
     of step 4 admits this treatment — role-to-kind mapping, hygiene, edit-diff placement and display
     caps are per-row, folding is local to one run of consecutive rows (`REQ-CHAT-064` to
     `REQ-CHAT-066`), and trailer rows are appended at the end (`REQ-MONITOR-230`, `REQ-CHAT-051`).
   - **A display-cap change is the one whole-window pass, and it is not an update.** `REQ-CHAT-166`
     requires a cap change to take effect immediately on rows already on screen, so it re-projects the
     resident window once. It is a settings change, not transcript update content, so it is outside what
     `REQ-MONITOR-223` measures.
5. **Present.** Hand the new displayed-row array to the recycler of ADR-0045 together with the preserved
   anchor and expansion map, and resolve the paint-completion promise.

**This stage is not the transcript projector of ADR-0010.** The projector answers "what rows does this
session have" and lives in the run host; this stage answers "what rows are displayed" and lives in the
renderer. Keeping them separate is what allows the projector to read a clock (row timestamps) while this
stage may not.

### What happens during a burst, so recovery cannot thrash

A gap detected in the middle of heavy publication must not produce a reconcile per publication.

- **Recovery is single-flight per session.** Step 0's refusal sets the surface to *reconciling*. While
  it is reconciling it is **not consuming increments** — `REQ-MONITOR-226` says so in as many words —
  so further publications for that session are **dropped by the subscription handler and never enter
  this stage.** They are not queued, not replayed, and not classified.
- **Exactly one `refused` is counted for the whole episode**, on the publication that revealed the gap,
  followed by exactly one `reset` when the whole read arrives. **This is not an aesthetic choice; it is
  what `REQ-UIBENCH-083` requires.** If each publication arriving during the reconcile counted a
  `refused`, the total would depend on how many publications happened to arrive inside the recovery
  window — an arrival-timing dependency — and two fresh processes replaying the same fixture could not
  produce byte-identical counters. **A design in which dropped-during-recovery publications reach the
  stage is therefore not merely wasteful, it fails the benchmark's core determinism claim.**
- **The reconcile response carries the number it was taken at**, and the surface resumes expecting that
  number plus one. Everything numbered at or below it is superseded, which step 0's third rule already
  discards without counting.
- **Cost is bounded and the episode is not update content.** The whole read is `REQ-MONITOR-216`'s
  bounded collections — which `REQ-MONITOR-246` states cost what those collections cost "and never what
  the session's accumulated history costs" — plus a transcript reset over the resident window, bounded
  at 5000 rows by `REQ-SESSION-192`. Like the display-cap pass in step 4, a reconcile is a recovery
  rather than an update, so it sits outside what `REQ-MONITOR-223` measures. **That reading is only
  honest while reconciles are rare**, which is ADR-0043's obligation and is watched by a diagnostics
  counter rather than assumed.

### Notes that follow from the constraints and are easy to get wrong

- **The counters are cumulative for the life of the process and never reset between phases.** They
  belong to the view-model stage, not to a component instance, and must survive a `reset`.
- **`refused` and `noop` both leave the view unchanged; only the reason differs.** The classification is
  taken from the applicability decision — now including step 0's sequence decision — **not from whether
  pixels changed**.
- **Grouping is on by default and must apply increments correctly**, by treating a row that cannot join
  a group as a group boundary; the agent-scoped filter is off by default and is allowed to decline. Both
  live in step 4, so both are covered by the same refusal path.
- **The search index is derived from displayed rows**, so it is invalidated by step 4 and not by step 3
  — a change that only alters a cap or a grouping setting still invalidates it. **Invalidated is not
  recomputed whole.** `REQ-CHAT-074` requires the case-folded substring match over displayed rows to be
  recomputed whenever rows change while the panel is open; matching is independent per row, so the match
  set is updated over the same changed suffix step 4 re-projected, and only a cap or grouping change
  re-matches the window. A search implementation that can only be recomputed by a full forward scan
  would put step 4's cost back on the resident window whenever the panel happens to be open.
- **Determinism has a concrete threat: iteration order.** Any use of object key order, insertion order
  derived from asynchronous arrival, or a per-process hash seed would make cross-process identity fail.
  The stage sorts by explicit keys wherever order matters and **must not use randomness, wall-clock
  time, or locale-sensitive comparison anywhere in its output path.** The benchmark's forced locale will
  surface a locale dependency as a difference rather than hiding it, which is useful, but the code should
  not have one.
- **The sequence number is an input to step 0 and never an output.** It does not appear in the view
  model, in a displayed row, or in anything the recycler paints. Step 0 is a pure function of
  (expected, received), so it introduces no environment dependence — and a fixture that replays a
  gap replays it identically in every process.

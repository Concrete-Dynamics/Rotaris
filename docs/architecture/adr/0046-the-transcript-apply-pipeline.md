# ADR-0046 — The transcript apply pipeline, and where determinism is enforced

- **Status:** proposed
- **Date:** 2026-08-31
- **Revised:** 2026-08-31, to carry SR-3: the sequence check becomes step 0 of this stage, and the
  interaction between gap recovery and the benchmark's determinism claim is settled here rather than
  left to the implementation.
- **Origin:** UI (ADR-UI-04)
- **Depends on:** ADR-0006, ADR-0010, ADR-0043, ADR-0045
- **Governed by:** `owner-decisions.md` SR-3

## Context

`REQ-MONITOR-214`: every publication on either channel carries a sequence number from one per-session
counter; a surface begins from a whole-session update, counts on from the number that update carried,
and knows at every moment the number the next publication must bear. `REQ-MONITOR-226`: a surface
receiving any other number **has missed an update** and must record a diagnostic, stop consuming
increments, and re-render from a whole read — *"on the publication that reveals the gap rather than
after any delay"*. That is the whole of how a lost update is caught; `REQ-MONITOR-288`'s reconcile poll
is withdrawn and `REQ-MONITOR-223` forbids any timer that exists to discover whether a session has
changed.

`REQ-MONITOR-215`, `REQ-MONITOR-229`: a row already delivered may change only through a later update
whose earliest-changed index is at or below it; nothing may mutate in place a row a view already holds;
a shrunk transcript publishes earliest-changed index 0. `REQ-MONITOR-224`, `REQ-MONITOR-226` and
`REQ-CHAT-052`: a view that cannot correctly apply an increment must **decline** it, record a
diagnostic, stop consuming increments, and re-render from a whole read; it must never render a result
that differs from what a whole read would produce; and declining must not interrupt the user or blank
the transcript. `REQ-SESSION-161` adds the positive form of that last rule — *"the rows on display MUST
be unchanged by the increment that was declined"* — which is where the withdrawn re-seed rule's real
content came to rest.

**`REQ-MONITOR-223` is the cost constraint, and it is stated against an empty session, not against a
large one.** For the same update content, an update to a session holding at least 10,000 recorded
transcript rows must cost no more than **twice** the same update to a session holding **none**, at the
95th percentile, measured from the run emitting the change to the surface showing it — so this stage is
inside the measurement, not outside it. `REQ-MONITOR-222` adds a 250 ms p95 that must hold at zero rows
and at thousands; `docs/spec/resolutions/02-run-monitoring-steering.md` row 23 records that the
10,000-row point was chosen so the two performance requirements are measured on comparable material,
which is why neither can be satisfied by pointing at the other. `REQ-CHAT-055`, `REQ-CHAT-154` and
`REQ-CHAT-157` require update cost to depend on visible and changed rows and never on the transcript's
length. `REQ-SESSION-192` is the product's single definition of transcript residency and fixes it at
**the 5000 most recent rows**, evicting older ones in whole pages of 50; `REQ-CHAT-165` states no bound
of its own and defers to it. **The resident window is therefore constant in the length of the session —
but 5000 is not within a factor of two of nothing, so constancy alone does not discharge
`REQ-MONITOR-223`.**

`REQ-MONITOR-230` and `REQ-CHAT-051`: trailer rows — a pending question, pending approvals — are **not
recorded history**: they are computed from what is pending at that moment, always follow every recorded
row, and are appended identically by the whole-state and incremental paths.

`REQ-CHAT-046`, `REQ-CHAT-047`: the row-category vocabulary is **closed** at twelve members; the row-role
vocabulary is **open** — five named roles project to their own kind, any other role projects to a
message row carrying that role as its display name. `REQ-CHAT-064` to `REQ-CHAT-066`: folding is
deterministic and content-derived — two or more consecutive same-agent rows whose tool names map to the
same family fold, four named families plus "a tool name outside those lists forms a family of its own",
any intervening row of another kind ends the run, group headers carry a searchable member blob capped at
2000 characters, and structured-question rows and unsettled live terminal rows never fold.
`REQ-CHAT-046`, `REQ-CHAT-061` and `REQ-CHAT-166`: the row model retains **untruncated** tool input and
output; display caps affect only what is drawn; expansion always shows the untruncated value; a cap
change takes effect immediately on rows already on screen. `REQ-CHAT-074`: search is case-folded
substring **over displayed rows**, recomputed automatically whenever rows change while the panel is
open.

**`REQ-UIBENCH-064`, `REQ-UIBENCH-083` and `REQ-UIBENCH-099` are the determinism constraint.** The view
must own an explicit transcript apply/diff stage producing six cumulative counters — `noop`, `insert`,
`remove`, `update`, `refused`, `reset` — classified by **comparing the state being applied with the
state currently displayed**, monotonically non-decreasing across an iteration's seven records, and
**byte-identical across iterations in fresh processes** replaying the same fixture. `refused` and `noop`
are distinguished by whether the application was **valid**, not by whether anything visibly changed.
The counter set is **exactly six** and the totals must be "a function of the sequence of transcript
states applied and nothing else". Timings and memory are explicitly **not** required to be reproducible;
only the structural counters and the invariants are.

## Alternatives considered

**A — Let the rendering framework's reconciler be the apply stage.** Push the new row array into the
store and derive the counters from render callbacks.

*For:* no second diff to write.
*Against:* the counters must be classified against *the state currently displayed*, with a distinction
between `refused` (a valid-shaped application the view declined) and `noop` (an accepted application
that changed nothing) that a reconciler has no notion of. The totals must be a pure function of the
sequence of states applied, and a framework's scheduling is not something to hang a determinism claim
on. And the decline decision must be made **before** anything is applied, which is upstream of any
reconciler.

**B — An explicit, synchronous view-model stage in front of the renderer.** Incoming state — increment
or snapshot — enters a pure function together with the currently displayed view model; it returns either
a refusal, or a new view model plus a classified operation list. Chosen.

*For:* the counters are the natural output of that function. The decline is its first branch. Folding,
trailer-row appending, cap application and the search index all belong in the same stage — they are all
"what the displayed rows are", as distinct from "what the session record holds". Being pure and
synchronous makes it directly unit-testable and makes cross-process identity a property of the function
rather than of the environment. **The sequence check of `REQ-MONITOR-226` fits it without alteration**:
it is one more reason to take the refusal branch that already existed.
*Against:* a second model to keep in step with the session record, and a class of bug where the view
model and the record disagree — which is precisely what the decline-and-re-read path exists to correct.

**C — Handle the sequence gap outside this stage, in the subscription handler, and never tell the apply
stage about it.** Considered because it keeps the stage's input purely a sequence of transcript states,
which is exactly what `REQ-UIBENCH-064` says the counters must be a function of.

*Against, and decisively:* a gap is a publication the surface **declined to apply**, and
`REQ-UIBENCH-064` fixes the counter set at six with `refused` defined as an application that was not
valid. If the gap were handled outside the stage, either the refusal would go uncounted — leaving a
benchmark that reports six counters none of which move when the product's one loss-detection path
fires — or it would need a seventh counter, which the requirement forbids. Handling it inside costs
nothing: the check is a comparison of two integers.

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

## Consequences accepted

1. A view model distinct from the session record, with the drift risk that implies. The sequence number
   makes drift detectable at the next publication; it does not prevent it.
2. **A decline path that must be tested deliberately**, since in normal operation it never fires — and
   it now has two entrances, the sequence gap and the inapplicable increment, which must **both** be
   exercised. A fixture that replays a deliberately dropped publication is the only way the step 0
   branch is ever executed, and without one the product's single loss-detection mechanism ships
   unexercised.
3. A rule that **no transformation with an environment-dependent result may live between the incoming
   state and the presented rows** — which extends ADR-0006's no-bare-clocks rule into the renderer for
   this one stage. Step 0 inherits it: the recovery episode's counter contribution must not depend on
   how long the whole read took or on how many publications arrived meanwhile.
4. **Every part of step 4 must be expressible incrementally, from the first line of code.** A folding
   rule that can only be evaluated by a forward scan of the whole displayed array, or a search index that
   can only be rebuilt whole, is not admissible however clear it reads — not because it would be slow,
   but because `REQ-MONITOR-223`'s comparison against an empty session forbids it. This is the cost of
   the choice and it is paid up front.
5. **The subscription handler is now part of the determinism surface**, because it decides which
   publications reach this stage. It was previously a transport detail. Its one rule — drop for this
   session while reconciling, deliver otherwise — must be stated in the code as a rule and covered by
   the fixture in consequence 2.

## Revisit if

Step 4's bounded re-projection — the changed suffix, its enclosing fold, and the trailer rows — still
dominates the 250 ms p95 of `REQ-MONITOR-222` at the 5000-row residency bound. The fix is then a
narrower lookback or a cheaper fold representation, **not** widening step 4 back to the whole resident
window, and not removing the stage. Widening was never available as a fallback: `REQ-MONITOR-223`'s
factor of two against an empty session rules it out, which is why step 4 is incremental by decision here
rather than by later optimisation. Or the benchmark shows `refused` moving in a replay that drops no
publication — in which case a hop is losing traffic, and the defect is upstream of this stage.

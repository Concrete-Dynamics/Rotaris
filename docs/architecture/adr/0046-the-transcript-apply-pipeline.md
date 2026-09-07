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

---

## First execution — 2026-09-07, the whole pipeline (Part Z)

*Recorded under GD-10. This record carried **no execution note at all** until now.* Steps 0, 1 and 2 shipped on
2026-09-03 and were reported into **ADR-0043**'s first-execution note — the replica and the projection owner end to
end — rather than into the record that decided the pipeline. So this note covers all six steps: what the early ones
found when they ran under another record's note, and what steps 3, 4 and 5 find now.

Measured by `pnpm transcript-proof`; evidence under `.transcript-proof/`.

### Steps 0–2, as they stand (built 2026-09-03, reported elsewhere)

`packages/ui-core/src/replica.ts`. The sequence check, the three rules that make it well defined, the decline of
REQ-SESSION-161 and the reset are all there and unchanged. **One defect was found when they first ran and it is
recorded in ADR-0043 rather than here, which is the reason this note exists:** a whole-session update originally
*cleared* the rows, and the first run loop's status saves — each a snapshot — then emptied a transcript that was
still being written. The corrected rule (the rows are kept; the increment that follows an attach or a reconcile
upserts over them) is the one this note's step 3 classifies against.

**A regression check on that behaviour reaching the product end to end**, and labelled as one rather than as a first
execution: six well-formed transcript publications numbered far above the surface's expectation were delivered to
the window in one burst. The result was exactly what consequence 2 and REQ-UIBENCH-083 require —

    before  { noop: 0, insert: 1000, remove: 0, update: 0, refused: 0, reset: 1 }
    after   { noop: 1, insert: 1000, remove: 0, update: 0, refused: 1, reset: 2 }

— **one `refused`, one `reset`, five publications dropped by the subscription handler without reaching the stage,
and one `noop`**: the reconcile's increment re-delivered the same 1000 rows, and step 3 correctly classified an
application that changed nothing as a single `noop` with no row counters. The count of `refused` did not depend on
how many publications arrived inside the recovery window, which is the whole of the determinism claim.

### Step 3 — the row-level classification (`replica.ts`, `classifyRows`)

The six counters `REQ-UIBENCH-064` fixes now exist and are **separate from the seven publication classes** the
replica already had. Getting that apart mattered: the existing `counters` classify *publications* — `applied`,
`superseded`, `dropped`, `foreign`, `declined` — and the benchmark reads *rows*. `classifyRows` is pure and total:
one `insert` per row added, one `remove` per row removed, one `update` per retained row whose content changed, and
**one `noop` and no row counters** when nothing changed at all. `refused` covers both entrances — the sequence gap
and the inapplicable increment — because both are applications the view declined, and `noop` is distinguished from
it by whether the application was *valid*, never by whether pixels changed. Content equality reads the row's own
fields in **sorted key order**, so object key order cannot leak into the result.

### Step 4 — the projection (`transcript/project.ts`)

`projectDisplay` is one pure function of (resident rows, run state, grouping, caps, expansion, pending state). It
carries REQ-CHAT-047's role-to-kind mapping over the **open** role vocabulary, REQ-CHAT-048's duplicate-reasoning
hygiene, REQ-CHAT-049's dead-session hygiene, REQ-CHAT-050's edit-diff placement and its 50-line cap,
REQ-CHAT-064/065/066's folding, REQ-CHAT-166's display caps, and REQ-CHAT-051's trailer rows appended last. It is
**bounded by what changed from the first line of code**, as consequence 4 requires: `projectDisplay` takes the
previous displayed array and an earliest-changed index, walks back to the nearest group boundary at or before it,
and re-projects only the suffix; a unit test asserts the bounded result equals the whole one, including for a
change *inside* a fold. The search index is updated over the same changed suffix (`indexSuffix`) rather than rebuilt.

**REQ-CHAT-051 is met for approvals and pending for questions**, exactly as the plan predicted and for the reason it
gave: the requirement reads "N step(s) — <title of the first step>" and `SessionRecord.pendingQuestions` carries
`{requestId, prompt}` with no steps and no titles. REQ-CHAT-094 allows one pending prompt per conversation, so the
only reading the shape supports is that the **list is that prompt's steps**: N is the list's length and the title is
the first entry's prompt. Part AC widens the field; the trailer must then read the widened shape.

**REQ-CHAT-168 is asserted at zero, one and many** wherever a count is written — the trailer ("1 step", "2 steps"),
the group summary ("reading ×1 · 1 ok", "reading ×4 · 1 failed · 3 ok"), "N new update(s)" and the truncation
marker ("1 more line", "20 more lines"). No parenthetical plural is rendered anywhere.

### Step 5 — present (`transcript/TranscriptPane.tsx`)

The displayed array, the preserved anchor and the expansion map are handed to ADR-0045's recycler.

**Found — a defect the first execution caught and no reading had: showing a search match did not survive the
tail-follow pin.** REQ-CHAT-074's "showing a match disables tail-follow, selects the row, scrolls it to center"
was implemented as a scroll inside the effect that reacts to the match changing, with the state change omitted. The
first run of the proof read the count as **"1 of 1"** — the match inside a collapsed group was found correctly —
while `data-following` stayed `1`, the matched row was never bound to a slot, and every subsequent reader scroll was
dragged straight back to the tail, which also stopped REQ-CHAT-165's paging from ever triggering. Two causes, both
kept beside the fix: **the state change belongs in the handler**, where the reader's action is, not in an effect
reacting to it; and the pin effect depended on the freshly built offset table, which is a new object every render,
so it re-pinned continuously rather than when the displayed rows changed. Nothing in either record would have caught
it — the pipeline says what to compute, the recycler says what to paint, and the interaction between "the
application scrolls" and "the reader scrolls" is where they meet.

### The reading-question limbs, stated rather than reported as met

- **REQ-CHAT-073 is met in one clause of two.** Its second clause — "and the Clear action MUST be disabled" — names
  an action section 14 would have built. `clearTranscript` answers `false` and no Clear action exists anywhere in
  this build, so the clause has nothing to be true of. It is not a defect and not a waiver.
- **Three live-terminal clauses are implemented and left unexercised.** `CHANNEL.terminalFrames` exists in the
  contract, the relay and the preload, and **nothing publishes a frame**: ADR-0021 has no first execution.
  REQ-CHAT-063's 250 ms cadence "while a terminal stream is live" and REQ-CHAT-066's "an unsettled live terminal row
  never folds" are both written and both keyed on the `streamId` REQ-CHAT-046 puts on a row, which this part added
  to the contract for that reason. The fold exclusion is unit-tested against a synthetic row; the cadence has never
  run. Owed to the ADR-0021 part.
- **REQ-CHAT-164's detection has a window it cannot cover.** Ten seconds of provider silence marks the live row
  stalled and the next output of any kind clears the mark (`ProjectionOwner.markStalled`, published and never
  recorded, so "MUST NOT change what the transcript records" holds). But **before any output arrives there is no
  live row for the call**: this build appends the answer row on the first delta. Covering that window needs either a
  row the requirement forbids appending or a run-header indicator, which is Part AB's. Stated rather than met.
- **REQ-CHAT-002 is not met alone.** Its Ctrl+F limb lands here and closes Part W's owe; its Escape-priority limb —
  the slash suggestion popup dismissing ahead of the search panel — lands with Part AF.

### The upstream slice, which a renderer cannot repair (`engine`, `model`)

**Found — a defect no reading of the record had caught, and the plan's reading of it was wrong.** The plan said
`ai-sdk-client.ts` recognised one of REQ-CHAT-163's three reasoning shapes "so those providers' deliberation lands
in the answer body". The first half is right; the second is not, and the truth is worse. `run/turn.ts`'s stream sink
read `reasoning: () => undefined` — **every recognised reasoning delta was discarded**, so no streamed-reasoning row
has ever existed in this product, and REQ-CHAT-048's duplicate-reasoning hygiene and REQ-CHAT-062's summary had
nothing to act on. The sink now writes a `thinking` row, stamped with its start time because REQ-CHAT-059 keys
thinking rows by it, settled the moment the answer body starts. The two shapes the client did not recognise — a
thinking block inside the content and a list of reasoning items — are handled by a pure, incremental normaliser
(`model/src/reasoning.ts`) that routes thinking blocks to the reasoning channel *across delta boundaries*, separates
reasoning items by id, and **keeps a whitespace-only delta exactly as received**.

**REQ-CHAT-054 landed in the writer**, where it belongs: `SessionWriter.upsertMessageRow` keys a response segment by
a stable id, so a replayed event persists once, a cumulative committed-text snapshot updates the row in place, a
stream finalises in place, and a response after a tool boundary is a distinct row. The concrete case this repairs
was already reachable: **Part Q's ladder re-running a failed step on a fallback model appended a second `agent`
row**, because the step's row was created on the first delta of whichever attempt produced one.

`chars` and `streamId` were added to `TranscriptRowSchema` and are populated: `chars` is **derived** from the body
(the body of a thinking row is the concatenation of the deltas received, which REQ-CHAT-163 fixes character for
character) by one function called from the writer's append, the writer's settle, the owner's growth tick and the
store read — deriving it identically on both sides of the release boundary is what keeps a paged-in row identical to
the row released. `streamId` is carried and not persisted, and nothing sets it yet, for the reason above. A third
field the plan did not reserve was needed and is named here rather than slipped in: **`stalledSince`**, because
REQ-CHAT-164 splits its detection (this part) from its drawing (Part AA) and `DisplayRow` is the only channel
between them. It is published and never recorded.

### A third defect, found by the same measurement and fixed the same way

**The anchor was restored before the geometry it was restored against had settled.** REQ-CHAT-071 says "restore
that anchor after geometry settles", and a row that has just been paged in carries an *estimated* height until the
measurement pass reaches it. Restoring once, on arrival, restores against estimates, and the content then shifts
under the reader by the whole estimation error as the real heights land. The anchor is now **held** across the
settle — the effect re-runs whenever the measured total changes and re-applies it — and is released only by the
reader's own scroll or by a jump the application makes deliberately (a search match). Holding it exposed the third
part of the same fault at once: with the anchor held, jumping to a search match was pulled straight back, because
the held anchor was older than the jump. **All three are one mistake told three times** — "the application moved
the reader" and "the reader moved" had no single place where they were distinguished — and the fix is that they now
do: `programmatic`, the anchor's lifetime, and the follow state are decided in the handler that caused the movement.

### Measured

`pnpm transcript-proof`, five launches: REQ-CHAT-073's empty state word for word; ADR-0045's counts (its own note);
four consecutive same-agent `read_file` calls folding into ONE header of four whose copy reads
**"reading ×4 · 1 failed · 3 ok"** — REQ-CHAT-065's own example, with no raw tool output in it; expanding it keeping
the header on screen and revealing all four members beneath it; a search matching **inside** the collapsed group
through REQ-CHAT-065's capped member blob, landing on the visible header and turning tail-follow off ("1 of 1",
`data-following` `0`); REQ-CHAT-166's cap holding — a line past the tenth is **not displayed at all** (`0 results`
through the search index, which reads displayed rows), the truncation is marked with its size (`20 more lines`,
one match), the record still holds all thirty lines, and expanding the row shows every one of them with no marker;
REQ-CHAT-165's paging bringing 50 older rows back (1000 rows → 1050, oldest index 200 → 150) with the returned row
**identical to the row released** and the reader undisturbed to **0.25 px**; and the burst above.

REQ-CHAT-055's shown-update comparison is in ADR-0045's note. The scripted `think` step produced a
**streamed-reasoning row** in the store, which is REQ-CHAT-163 reaching a row rather than being discarded.

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

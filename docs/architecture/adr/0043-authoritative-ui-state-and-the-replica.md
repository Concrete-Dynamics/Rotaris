# ADR-0043 — Where authoritative interface state lives, and how a renderer stays in step

- **Status:** proposed
- **Date:** 2026-08-31
- **Revised:** 2026-08-31, to carry SR-3 (no polling; per-session sequence numbers with gap detection)
  and SR-4 (the durable anchor becomes the transaction commit).
- **Origin:** UI (ADR-UI-01), RUNTIME (ADR-RUNTIME-02)
- **Depends on:** ADR-0002, ADR-0008, ADR-0009, ADR-0010
- **Governed by:** `owner-decisions.md` SR-2, SR-3, SR-4
- **Contains an unresolved conflict between slices.**

## Context

`REQ-MONITOR-214` to `REQ-MONITOR-232` fix the whole synchronisation contract, restated in ADR-0010: two
payload shapes; **a sequence number on every publication, from one per-session counter shared by both
channels**; the whole-session update carrying **every field any surface can display**;
persist-before-publish; row stability, where a row already delivered may change only through a later
update whose earliest-changed index is at or below it; immediate publication of an unseen row with a
50 ms trailing coalesce for growth; the 250 ms p95 and the 2x-at-10,000-rows ceiling; decline-and-
re-render; and no view holding a run open or slowing it.

**`REQ-MONITOR-214` is the mechanism SR-3 puts in place of the withdrawn reconcile poll.** One counter
per session, shared by both channels, starting at 1 and raised by exactly one for each publication that
session makes. *"A surface begins from a whole-session update and counts on from the number that update
carried, so at every moment it knows the number the next publication must bear; a publication bearing
any other number means one was lost in delivery."* `REQ-MONITOR-226` says what the surface must then
do: record a diagnostic, stop consuming increments, and re-render from a whole read — *"on the
publication that reveals the gap rather than after any delay"*. `REQ-MONITOR-288`'s 2000 ms reconcile
poll is withdrawn, `REQ-MONITOR-287` fixes no poll cadence at all, and `REQ-SESSION-071`'s rule that
re-reading persisted state on a timer is not a supported way to follow a run now has **no exception
anywhere in the product**. `REQ-MONITOR-223` adds the other half: a session with nothing happening does
no work at all, and no timer anywhere runs to discover whether it has changed.

**`REQ-MONITOR-221`'s persist-before-publish is not a property this record establishes on its own.**
ADR-0010 states the rule and names its durable anchor. Under SR-4 that anchor is **the commit of the
transaction that recorded the change** in the workspace database (ADR-0003, ADR-0004). An increment is
published after the write that produced it has committed, not before. `REQ-SESSION-071` is why a
surface may not learn about the change any other way, and `REQ-MONITOR-292` is why the rule exists at
all: a view must never contradict what resuming the session would restore.

*What SR-4 removes from this record.* The previous draft had to reason around a 10.0 s debounced
whole-document rewrite of `state/ui_transcript.json`, and concluded that gating publication on it would
be the delay floor `REQ-MONITOR-218` forbids at any size. Rows are now written individually, so a
commit is per change and cheap, and **persist-before-publish no longer collides with
`REQ-MONITOR-218`**. The workaround goes with the collision; the rule stays exactly as strong.

`REQ-MONITOR-227` and `REQ-MONITOR-225`: on focus change the transcript on screen is the newly focused
session's, **in full, from the persisted record**; no row and no in-flight update from the previous
session may survive; and a stale read must never overwrite newer content however late it arrives —
**and `REQ-MONITOR-225` now names the sequence number as what makes a superseded result identifiable
as one.**

`REQ-MONITOR-243`: because displaying a session is a read of what is published to it and never a write,
**one live session may be displayed in as many windows as the user has open at once, no window
excluding another.** Under SR-1 several main windows are ordinary (`REQ-STARTUP-163`, `REQ-SHELL-017`),
so several replicas of one session are ordinary.

`REQ-NOTIFY-025` and `REQ-NOTIFY-027`: the persistent-notice store belongs to **the application
process**, not to a window — re-creating the main window neither resets the monotonic identifier
sequence nor discards the current notice, and identifiers are unique across every window of the
process.

`REQ-CHAT-038` and `REQ-CHAT-041`: the queued-prompt service is shared across every window and every run
"sharing the same process", with an atomic queued-to-triggered transition **exactly one caller may
win**.

`REQ-SHELL-017` to `REQ-SHELL-019`: a workspace switch **builds a new main window first**, shows it,
then closes the old one; if the old window vetoes its close, the replacement is discarded and nothing
changes — so **two main windows exist simultaneously during a switch**.

`REQ-SHELL-151`, `REQ-SHELL-084` and `REQ-SHELL-076`: a surface that is not on screen performs **zero
repaints and runs zero repaint or refresh timers**, however fast changes arrive; when it becomes visible
its *first painted frame already carries current state*, within the 100 ms gesture budget, with no
visible catch-up redraw. Closing a persona window **hides rather than destroys** it, so reopening is
instantaneous.

`REQ-CHAT-165` and `REQ-SESSION-192`, `REQ-SESSION-131`: resident rows are bounded and older spans are
paged in on demand, **off the interface thread**, with a re-loaded row identical to the row released.

## Alternatives considered

**A — Renderer-authoritative store.** Each renderer owns the source of truth for what it draws; the
process behind it forwards raw events and the renderer folds them in.

*For:* the simplest data flow; no serialisation on the read path; cheap selectors.
*Against:* it breaks `REQ-NOTIFY-025` outright — the notice store must survive window re-creation within
one process, and a renderer-owned store dies with its window. It breaks the workspace switch, where two
renderers would independently fold the same events. It makes persist-before-publish unenforceable from
the renderer's side, and turns decline-and-re-render into a renderer-initiated store read, which
conflicts with paging having to happen off the interface thread. Every auxiliary window would fold
events independently, so "identical visible cells at the same time" (`REQ-SHELL-102`) becomes a race
rather than a guarantee — and under `REQ-MONITOR-243`'s several-windows-one-session it would become a
race the product now encounters routinely.

**B — An authoritative projection outside the renderers; renderers hold a derived replica.** One
*session view model* per live session, fed by the session writer and gated on the commit that made each
change durable, published on the two channels with a per-session sequence number. Each renderer holds a
replica whose only writers are the two channel handlers and purely local interface state — scroll
anchor, expansion map, composer text, search query, drawer state.

*For:* the notice store and the queue live beside the projection and every window observes them;
persist-before-publish is discharged at **one point** — the writer's commit — instead of at every
producer; the stale-read rule is a single-writer concern rather than a distributed one; the workspace
switch works because two renderers subscribe to two view models from the same owner; several windows on
one session receive identical numbered publications and cannot diverge; and "no view may slow the run"
is enforceable because the publisher never awaits a renderer. **Chosen.**
*Against:* every update crosses a process boundary and is serialised; duplicated state in N renderers
costs memory; the replica can drift if a channel handler has a bug — which is exactly why the
decline-and-re-read path is mandatory rather than optional, and why the sequence number exists.

**C — Renderers read the persisted session record directly.** No push; each renderer polls and reads the
store itself.

*For:* one source of truth, no replica drift, paging is a local read.
*Against:* fails `REQ-MONITOR-218` — "published immediately, no delay floor of any size" cannot be met by
polling. Under SR-3 there is no cadence left to poll on: `REQ-MONITOR-287` fixes none and
`REQ-MONITOR-288` is withdrawn. Fails `REQ-MONITOR-223`'s "a session with nothing happening does no work
at all, and no timer anywhere runs to discover whether it has changed". Puts I/O on the interface thread
or forces a worker per window. Multiplies read amplification by the number of open windows — now by the
number of windows *and* the number showing the same session. And under ADR-0002 the renderer is
sandboxed and has neither filesystem nor store access.

**D — A per-publication acknowledgement from each surface, with the publisher retransmitting.**
Considered because it detects loss at the publisher rather than at the surface, and rejected on
`REQ-MONITOR-232` and `REQ-MONITOR-226`: no view may hold a run open, slow it down or change its
outcome, and a consumer that hangs or vanishes must leave the run untouched. A publisher that waits for
or retains state per acknowledgement is a publisher a broken view can stall. The sequence number gets
loss detection with none of that: it is one integer in a payload the publisher was sending anyway, it
costs nothing while nothing is lost, and the recovery obligation sits entirely on the surface.

## Decision

**Alternative B.** The specification's own shape — two channels, a per-session sequence number, an
earliest-changed index, persist-before-publish, a whole-session snapshot carrying every displayable
field, and a view that may *decline* an increment — describes a publisher/replica pair with a
gap-triggered re-read escape hatch.

### Where things live

- **The projection owner lives in the run host**, next to the session writer that produced the state,
  and **is fed by that writer rather than reading back what the writer saved.** A transcript increment
  is handed to it on the commit of the write that recorded the row, which is ADR-0010's durable anchor
  for `REQ-MONITOR-221`. It reads the session's stored state for the paths that genuinely want a whole
  read — the whole-session update of `REQ-MONITOR-216`, the focus change of `REQ-MONITOR-227`, the
  reconcile of `REQ-MONITOR-226`, the decline-and-re-render of `REQ-MONITOR-224`, and paging older spans
  — and **never as the transcript's delivery path**. It publishes on ADR-0010's two update channels;
  main relays to renderers (ADR-0044) and adds nothing of its own to the payloads.
- **The persistent-notice store lives in main**, because `REQ-NOTIFY-025` binds it to the application
  process across window re-creation and it must be current in a window created during a workspace
  switch (ADR-0049).
- **The renderer store's run-derived state has exactly two writers**, an increment handler and a
  snapshot handler, and local-only interface state lives in separate slices so it survives a reset
  without being republished. Any store with equality-checked selectors will do; nothing in the
  specification requires a particular one.
- **Renderers never read the session store.** Paging older rows is a request to the owner, which serves
  it from the resident window or the archive and returns a span; "off the interface thread" is satisfied
  because the read happens in another process entirely.

### The sequence number, and how a gap is caught

**This is not a new mechanism.** It is one field added to two payloads that already existed, and one
branch added in front of an apply stage that was already required to decline what it cannot correctly
apply and re-render from a whole read. Nothing else in the contract changes.

1. **The publisher owns the counter.** The projection owner holds one counter per live session, shared
   by both channels, starting at 1 and raised by exactly one per publication (`REQ-MONITOR-214`). It is
   the sole publisher for that session, so monotonicity is structural rather than coordinated. The
   number is assigned **at publication**, after the persist-before-publish anchor, so a number is never
   burned on a change that did not commit.
2. **Nothing between the publisher and the surface may renumber, reorder, coalesce or drop.** Main is a
   relay (ADR-0044). Because one counter is shared by *both* channels, the transport must preserve the
   publisher's per-session order **across channel names**, not merely within one. If a transport cannot
   guarantee that, the remedy is to carry both payload kinds on one lane discriminated by a kind tag —
   **not** to give each channel its own counter, which would forfeit `REQ-MONITOR-214`'s single-counter
   wording and let a snapshot and an increment cross without detection.
3. **A sequence expectation is created by a whole-session update and by nothing else.** This follows
   from `REQ-MONITOR-214`'s own wording — a surface *begins* from a whole-session update and counts on
   from the number that update carried. Consequences that must be stated because they are easy to get
   wrong:
   - A surface that has never received a whole-session update for a session holds no expectation and
     **cannot observe a gap**. That is the correct treatment of a surface fed only by session-aware
     notifications and by `REQ-MONITOR-250`'s background summary: it is not counting, so it is not
     missing anything.
   - Subscribing, re-subscribing after being hidden (`REQ-SHELL-151`), and changing focus
     (`REQ-MONITOR-227`) all **begin** rather than continue. Each starts with a whole-session update and
     adopts the number it carries. A resubscribe therefore reports **no gap and no diagnostic**, even
     though the counter has advanced by a large amount while the surface was not listening. Any design
     in which un-hiding a window logs a refusal is wrong.
   - Unsubscribing discards the expectation rather than parking it.
4. **On a gap, the surface reconciles at once and with no timer** (`REQ-MONITOR-226`): record the
   diagnostic, stop consuming increments, request a whole read, re-render from it. ADR-0046 places the
   check as step 0 of the apply stage and fixes how it is counted.
5. **Reconcile is single-flight per (surface, session).** While a reconcile is in flight the surface is
   not consuming increments, so further publications for that session are **dropped at the subscription
   handler and never reach the apply stage**. They are not queued and not classified. A second gap
   cannot therefore start a second reconcile, and a burst cannot produce a storm of re-reads: one gap,
   one read, however many publications the burst contains. ADR-0046 records why this also matters for
   determinism.
6. **The reconcile response carries the number it was taken at**, and the surface resumes expecting that
   number plus one. Publications numbered at or below it are superseded and discarded — which is
   exactly the mechanism `REQ-MONITOR-225` now names for "a stale read must never overwrite newer
   content, however long the earlier read took to arrive". The rule is one comparison rather than a
   timestamp or an arrival-order heuristic.
7. **The publisher never blocks on a subscriber**, so the one place a publication is designed to be lost
   is a subscriber whose outbound queue is full. That queue is bounded per subscriber, and every drop is
   counted in diagnostics (ADR-0052) alongside the reconcile count. A rising reconcile count is a
   defect signal, not normal operation.

### Why a reconcile stays rare, and why it is not a whole-transcript transfer

`REQ-MONITOR-223` caps a 10,000-row update at twice an empty-session update and requires an idle
session to do no work at all. A reconcile must not quietly become the routine path.

- **It is rare because loss is rare.** Every hop is in-process or same-machine IPC with ordered
  delivery; there is no lossy medium. The designed-in loss case is the bounded outbound queue of
  point 7, which a healthy renderer never fills. Subscription lifecycle — hide, show, focus change,
  window build — goes through the *begin* path of point 3 and never through the gap path. So a gap
  means either a bounded-queue overflow or a defect, and both are counted.
- **It is bounded because of what a whole read contains.** `REQ-MONITOR-216`'s whole-session update
  carries the session record with its **unbounded collections emptied** — transcript rows, edit diffs,
  report artifacts, checkpoints and seen-compression identifiers are omitted — and its bounded
  collections in full. `REQ-MONITOR-246` states the consequence directly: such a read *"costs what
  `REQ-MONITOR-216`'s bounded collections cost and never what the session's accumulated history
  costs"*. A reconcile of everything-but-the-transcript is therefore constant in the length of the
  session.
- **The transcript half is bounded by residency, not by the session.** `REQ-SESSION-192` fixes
  residency at the 5000 most recent rows and `REQ-CHAT-165` defers to it, so the transcript a reconcile
  restores is the resident window, whatever the session's length. Older spans are paged on demand and
  are not part of a reconcile.
- **A reconcile is not update content, so it is outside what `REQ-MONITOR-223` measures.**
  `REQ-MONITOR-223` compares *the same update content* delivered to a large session and to an empty
  one; a reconcile is a recovery from a lost publication, not a publication of new content. This is the
  same reading ADR-0046 already applies to a display-cap change, which re-projects the resident window
  once and is likewise outside the measurement. **The comparison is not a licence to make reconciles
  cheap by making them common**: the two bounds above are what keep the cost real, and the diagnostics
  counter is what keeps the frequency honest.

### Other specifics

- **Hidden windows unsubscribe.** `REQ-SHELL-151` requires zero repaints **and** zero timers while off
  screen. A hidden renderer tells the owner it is not observing; on becoming visible it requests a whole
  snapshot and applies it before its first paint, beginning a fresh sequence expectation. This is also
  what gives "closing hides rather than destroys" its meaning: the window and its content survive, its
  subscription does not.
- **Several windows on one session are several subscribers to one publication.** The owner publishes
  once and numbers once; the relay fans out. Two windows showing one session receive identical payloads
  with identical numbers and cannot diverge in content (`REQ-MONITOR-243`). If one of them misses a
  publication, only that one reconciles.
- **`REQ-EVENTS-166` is honoured by an export, not by the write path.** A stored history must yield
  every field to a stock parser on a machine carrying none of this product's code. Under SR-4 the
  runtime write path is rows in a workspace database, so that obligation is discharged by the export
  command (`REQ-SESSION-189`, `REQ-EVENTS-173`), which emits the plain line-delimited form. **No part of
  this record's delivery path depends on the history's byte format**, and nothing here may be read as
  making one.

## Unresolved conflict between slices

**UI placed the projection owner and the queued-prompt service in the main process; this record places
both in the run host.**

- **UI's position:** main is the application process, so `REQ-NOTIFY-025`'s and `REQ-CHAT-041`'s
  "the process" is main, and building the projection there from persisted state keeps
  persist-before-publish trivially true.
- **Adopted position:** `REQ-MONITOR-218` forbids any delay floor on an unseen row and `REQ-SESSION-071`
  forbids following a run by re-reading state on a timer, with no exception anywhere in the product, so
  a projection built in main from persisted state alone cannot meet the contract; it would need the run
  host to push to it anyway, at which point main is a relay. And `REQ-EVENTS-098` keeps the writing of a
  live session in the lock holder. The notice store is the one piece that genuinely belongs in main, and
  it stays there.

*One of UI's arguments got stronger under SR-4 and still does not carry.* Its "keeps
persist-before-publish trivially true" was true of a design that could not have met
`REQ-MONITOR-218`, because the anchor was a debounced whole-document save. With rows committed
individually the anchor is cheap, so a main-side projection would no longer be *slow* — but it would
still be learning about the change by reading back what another process wrote, which is what
`REQ-SESSION-071` forbids as a way of following a run, and it would still put a store reader in the
process that must answer a gesture in 100 ms. The objection was never only about cost.

The queued prompt queue is the sharper half. `REQ-CHAT-041` scopes visibility and consumption to windows
and runs "sharing the same process", and `REQ-CHAT-038` requires an **atomic queued-to-triggered
transition exactly one caller wins**. Placing the service in the run host makes the consuming side
in-process and the atomicity local; placing it in main makes the window side local and the consumption
cross-process. **Recommendation: the run host**, because `REQ-MONITOR-139` and `REQ-ORCH-071` make the
queue session-owned and a run may consume only its own session's prompts — and under SR-1, with several
main windows able to show one session, "the window side" is not a single place anyway. **This must be
confirmed**, because it decides whether `REQ-CHAT-041`'s phrase is satisfied or merely not violated.
See OQ-1.

## Consequences accepted

1. Serialisation cost on every update, which ADR-0044 must budget for against the 250 ms p95.
2. **Replica drift is possible in principle, so the decline-and-re-read path is load-bearing** and must
   be exercised by tests rather than treated as an error branch — in normal operation it never fires.
   The sequence number makes drift *detectable*; it does not make it impossible.
3. Main becomes a relay that must never do unbounded work synchronously on the update path, or a slow
   relay stalls every window. Under the sequence contract it acquires a second obligation: it must not
   reorder or coalesce, because either would manufacture a gap the surface would then reconcile from.
4. `REQ-MONITOR-217`'s "every field any surface can display" is enforced by deriving the snapshot type
   from the session record type (ADR-0010), so adding a field to the record changes the payload by
   definition.
5. **The projection holds live transcript rows in memory beside the writer's own copy.** The 5000-row
   residency bound of `REQ-SESSION-192` bounds it and the paging path already exists for anything older,
   so this is a second bounded copy rather than an unbounded one — but it is a second copy, and
   `REQ-MONITOR-242`'s equality is a property of two in-memory structures agreeing rather than of one
   being read twice. *The earlier consequence that the projection and every replica are legitimately
   ahead of `state/ui_transcript.json` by up to one debounce window is withdrawn with the debounce: a
   published row is a committed row.* What survives from it is the comparison rule —
   `REQ-MONITOR-292` and `REQ-MONITOR-242` compare the view against **what a reattach restores**
   (`REQ-SESSION-196`), not against an intermediate artifact of the write path.
6. **The counter is per session and lives only as long as the session is live.** It is not persisted and
   does not survive a run-host crash; a session recovered as stale and then reopened is opened from its
   record (`REQ-SESSION-196`) rather than resumed at a sequence number, and if it is continued the new
   run's counter starts at 1 again. Nothing may treat the number as a durable identity or compare
   numbers across runs.
7. **Diagnostics gain two counters that must be watched, not merely recorded** — publications dropped at
   a full subscriber queue, and reconciles triggered by a gap. They are the only signal that the
   no-polling design has degraded into an accidental polling design.

## Revisit if

The measured cost of two boundary crossings threatens `REQ-ORCH-155`'s 100 ms — in which case transfer a
message port from the run host directly to the renderer for the two update channels, keeping main for
control and notices only, which also removes the relay's ordering obligation in consequence 3. Or the
reconcile counter shows gaps occurring in normal operation — in which case the fault is a lossy hop or an
undersized subscriber queue, and the remedy is to fix that hop, **not** to soften the reconcile into
something cheaper or to reintroduce a timer.

## First execution — 2026-09-03, the projection owner and the replica end to end

*Recorded under GD-10.*

**Built and run:** `packages/engine/src/projection-owner.ts` — one per live session, fed by the
writer, holding the resident rows beside the writer's copy, owning the counter, the sole publisher;
and the replica's step-0 check extended with `REQ-SESSION-161`'s **decline**: an increment whose
earliest-changed index precedes the oldest row held is refused, costs one whole read, and leaves the
rows on display untouched (a genuine reset at index 0, `REQ-MONITOR-229`, is not a decline). Paging
older rows (`REQ-CHAT-165`) is a command answered from any page, placed above what is held. The
end-to-end test runs writer → owner → replica in one process against a real store with a controlled
clock, and the application ran the same path across three processes: a typed prompt, then
`applied 1 · reset 1 · refused 0` in the status strip.

**Found: one thing about this record's own shape, not a defect.** A whole-session update now
**clears the replica's transcript**, because the attach and the reconcile both re-deliver it on the
increment channel immediately after (`REQ-SESSION-161`) and a snapshot alone cannot say which rows
survived. The earlier replica kept rows across a snapshot; that was only safe while nothing published
one.

**Not exercised:** several windows on one session; a hidden window's unsubscribe (`REQ-SHELL-151`);
the subscriber-queue drop of point 7; the two diagnostics counters as instruments (ADR-0052).

## Corrected on first execution of the run loop — 2026-09-03: a whole-session update keeps the rows

*Recorded under GD-10. This corrects the note immediately above, which is kept as written.*

**The note above said** a whole-session update clears the replica's transcript, "because the attach and
the reconcile both re-deliver it … and a snapshot alone cannot say which rows survived", and that keeping
rows across a snapshot "was only safe while nothing published one". **That reasoning was wrong, and the
first run in the application showed it:** every status save the run loop makes publishes a whole-session
update (`starting`, `running`, once per iteration, `cancelling`, the terminal status), and the first
completed run painted its notice over a transcript reading "No rows yet". The rows had been cleared five
times while they were being written.

**The correction, and the reading that carries it.** `REQ-MONITOR-216` fixes that the whole-session update
carries the session record with its unbounded collections emptied — the transcript is not in it. A
snapshot therefore *cannot* speak for the rows, which is exactly why it must not clear them. The attach
and the reconcile still re-deliver the resident window on the increment channel immediately after, and
that increment **upserts by index** (`REQ-EVENTS-052`), so a surface that held rows keeps them and gains
what it lacked; rows never disappear from a session, so nothing a snapshot could have removed exists.
`packages/ui-core/src/replica.ts` keeps the rows and a test pins a status save mid-run leaving them on
display. **This is the sixth mechanism built for the first time to hold a defect no reading caught**, and
the count is kept in ADR-0058 consequence 17.

**What the earlier note got right and stands:** every attach begins with a whole-session update; the
increment that follows carries the number the surface counts on from; a genuine reset at index 0 is not
a decline.

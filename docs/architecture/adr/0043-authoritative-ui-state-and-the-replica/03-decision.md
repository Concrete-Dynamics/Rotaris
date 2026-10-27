# ADR-0043 — Where authoritative interface state lives, and how a renderer stays in step — Decision

Part 3 of 8 of [ADR-0043](../0043-authoritative-ui-state-and-the-replica.md), which indexes every part.

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

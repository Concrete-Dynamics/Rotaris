# ADR-0043 — Where authoritative interface state lives, and how a renderer stays in step — Context

Part 1 of 8 of [ADR-0043](../0043-authoritative-ui-state-and-the-replica.md), which indexes every part.

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

# ADR-0010 — Three channels between the run host and its surfaces — Context

Part 1 of 10 of [ADR-0010](../0010-three-channels-between-run-and-surfaces.md), which indexes every part.

## Context

Three delivery obligations exist and they have **incompatible failure contracts**.

**Control.** `REQ-MONITOR-013` has been amended and no longer needs the architecture to interpret it:
"a run does not execute inside the window that displays it: the surface issuing a control and the part
of the application that executes the run are separate processes of one running instance. That, and only
that, boundary is what this requirement means." It is never a boundary between two instances
(`REQ-STARTUP-161`) and never a boundary to a run this application does not own, because no such run
exists (`REQ-MONITOR-243`). Every operation `REQ-MONITOR-004` names must be issuable across that
boundary with the same arguments, result shape and acceptance semantics, and control arguments are
limited to text, numbers, booleans and simple collections of those "so that a request survives the
boundary without losing meaning". `REQ-MONITOR-005`: a boolean plus an optional string, populated for
exactly two operations and never on a `false`; a control answers `false` rather than raising and is
safe from concurrent callers.

**Wire events.** `REQ-EVENTS-165` and `REQ-EVENTS-031`: delivery of one event to one consumer must
complete before the run proceeds past the operation that raised it — "a slow consumer delays the run
rather than losing or reordering events" — bounded at **5 seconds**, after which that consumer is
detached permanently with a warning and the run proceeds. `REQ-EVENTS-164`: the asynchronous consumer
buffers up to **1024** pending events, discards rather than blocking beyond that, and exposes a discard
count readable during iteration that only ever rises. `REQ-EVENTS-178` fixes what these consumers are:
this application consuming its own runs in its own process, never a published programmatic surface.

**View updates.** `REQ-MONITOR-232`, `REQ-MONITOR-226`, `REQ-MONITOR-293`, `REQ-ORCH-138`: **no view
may hold a run open, slow it down, or change its outcome.** A run observed by nothing, by a healthy
view, or by a broken one must reach the same terminal result, the same persisted record, the same event
sequence and the same timing.

`REQ-MONITOR-214` and `REQ-MONITOR-216` fix the payload shapes: an **incremental transcript update**
carrying the lowest row index whose content may still change, the rows from there on, new diffs and the
persona set; and **one whole-session update** carrying the session record with unbounded collections
emptied and bounded collections carried in full, as a fixed snapshot of the moment it was taken.
`REQ-MONITOR-217` requires the whole update to carry **every field of the session record that any
surface is able to display**, not a curated subset. `REQ-MONITOR-218` to `REQ-MONITOR-220`: a row a
view has not yet seen is published **immediately — no minimum wait, debounce or delay floor of any
size, on any platform**; growth of an already-visible row is coalesced into a trailing **50 ms** tick;
coalescing loses nothing and pending publications flush at run end.

**`REQ-MONITOR-214` also fixes the sequence number**, which is SR-3 arriving in the specification, and
declares itself its single definition: every publication on either channel carries one, from one
counter per session shared by both channels, starting at 1 and raised by exactly one per publication. A
surface begins from a whole-session update and counts on from the number that update carried, so it
always knows the number the next publication must bear. `REQ-MONITOR-226` says what a gap obliges:
record a diagnostic, stop consuming increments, and re-render from a whole read — **on the publication
that reveals the gap rather than after any delay** — and calls that "the whole of how a lost update is
caught". `REQ-MONITOR-287` now fixes no polling cadence at all and `REQ-MONITOR-223` states that a
session with nothing happening does no work: "no timer anywhere runs to discover whether it has
changed".

### Persist before publish, and why the rule got simpler

`REQ-MONITOR-221` binds the view channel: every change is persisted before it is published to any view,
because a view "could otherwise display something a resume would not restore" (`REQ-MONITOR-292`).

**The collision this rule used to cause is gone, and the requirement now says so itself.**
`REQ-MONITOR-221` carries its own reconciliation: it is satisfiable alongside `REQ-MONITOR-218`'s
no-delay-floor rule "because persistence carries no delay of its own: a save is durable when it is
requested, with nothing deferred behind a timer (`REQ-SESSION-067`). The interval in which a change
could be published before it was recorded no longer exists." Under the file design a transcript row's
durable home was a whole document rewritten by a debounced save, so gating publication on that write
would have put a delay floor of up to ten seconds in front of an unseen row. SR-4 removed the reason for
the debounce and the amended specification withdrew it outright. There is no longer a slow durable
record and a fast one to choose between. The rule below is still needed — publication must still wait
for something — but it no longer has to pick a winner.

`REQ-MONITOR-239` adds an obligation this record must carry, because with the debounce gone the
temptation it forbids is newly cheap: **no host may treat persistence as a liveness signal, and none may
request saves in order to make a session appear live.** "Liveness comes from the publication path,
durability from the record." Publication is what tells a surface a session is alive; a save is what
makes the record true. This record owns the first half of that sentence.

`REQ-EVENTS-075`, `REQ-SESSION-146` and `REQ-SESSION-176` require delivery to be **addressed per
session** with no fallback across sessions, registration for an empty session id rejected, and
per-session bindings bound late and discarded at teardown so a straggling event cannot reach a later run
in the same process.

### What the measurement changed

`../spikes/ipc-hop-latency.md` built ADR-0002's four-process arrangement and measured 46 launches on
Windows 11 with Electron 44.1.0, calibrating the cross-process clock per run because
`performance.timeOrigin` is not shared. Four results bear on this record and are used below rather than
summarised here: the budgets pass with two orders of magnitude of margin on the relay; `REQ-ORCH-155`
passes at the percentile SR-8 ruled and fails only under the absolute reading SR-8 rejected; a distinct
Electron channel **name** does not create a distinct transport; and the relay's failure mode under
overload is **unbounded latency with nothing dropped and nothing reordered**.

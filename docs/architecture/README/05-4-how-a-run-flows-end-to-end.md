# Rotaris-crw — system architecture — 4. How a run flows, end to end

Part 5 of 13 of [the architecture README](../README.md), which indexes every part.

## 4. How a run flows, end to end

**Launch.** The user presses Start in a window. The renderer sends a command; main relays it to the run
host. The run host loads the workspace configuration itself — the loader is a library, not a service, and
`REQ-CONFIG-014` forbids a read cache — then copies it and layers the settings store's **current** values
on top, synthesising slot-level variants exactly as the loader does (`REQ-CONFIG-262`). What a run uses
is what is on screen at that moment, not what was last committed to the file.

**Admission.** The confinement mode is resolved and, if a mode is requested, the availability verdict is
read from the cache the run host has held since start-up. A session requiring confinement the host cannot
deliver **does not start**: no session, no lock, no snapshot, and the run's event stream carries that
refusal as its first and only entry (`REQ-SANDBOX-094` to `REQ-SANDBOX-097`). The worktree is bound.
Credentials for every provider behind every slot model, persona and configured model are primed in one
pass, with an **unconditional renew** inside the refresh margin rather than a fetch that would hand back a
nearly expired token (`REQ-PROVIDER-066`, `REQ-PROVIDER-067`).

**Session creation.** Initial state is persisted, **then** the lock is acquired (`REQ-SESSION-048`). The
lock is a **row** in the store it protects, in **one table with one kind of row, keyed by session id** —
the `kind` column this record used to carry is gone, because `REQ-GIT-128`'s integration lock is now a
**file** in the workspace and does not share the table. The row carries `pid`, `host` and `acquired_at`
as columns because `REQ-SESSION-046` makes those three names and types a machine-readable contract and
`REQ-SESSION-183` reads all three back to the user before it acts. Atomic exclusive create becomes a
primary-key insert. On collision at most one stale-reap attempt is made, and only when the row's content
parses, names this machine, and its process probes dead here — **no waiting, no retry loop, no second
reap** (`REQ-SESSION-047`). Acquisition and reap are **one transaction**: begin, insert, on constraint
failure read the row and apply the three conditions, delete-and-insert once if all hold, otherwise roll
back and leave the row exactly as it was found. That is strictly stronger than the file, where
read-check-delete-then-create was three operations with a window between each.

**A refusal must say what is actually wrong, and the two cases differ.** `REQ-SESSION-048` is now the
single definition of what a lock refusal conveys, and it requires this-machine and another-machine
distinguished: the first names the pid this application's own run holds; the second reports that **the
store is reachable from more than one machine** rather than reporting a lock conflict. Under
`REQ-SESSION-054` as amended a foreign-host lock is no longer an accepted limitation but "a state that
should not arise" — the `host` field is retained as a **fault detector**, which makes the case for a
durable lock stronger rather than weaker. The refusal is built from the row read inside the rolled-back
transaction, so a second read cannot disagree with it.

**The lock's purpose is unchanged, and SR-1 is not a reason to weaken it** — `REQ-SESSION-047` says so
itself. One instance runs at a time, but **the instance that crashed is exactly what the reap path exists
for**, and an in-memory registry would die with the process the reap path is for. Non-terminal children
read back are settled to cancelled **before the first iteration, without probing liveness**, because
holding the lock is itself proof the previous owner exited (`REQ-ORCH-053`). Release order is unchanged:
session-scoped subprocesses torn down first, the lock row deleted last (`REQ-SESSION-049`).

**The product now has one liveness predicate over two lock media, and that is a standing invariant rather
than a task.** `REQ-SESSION-171` and `REQ-GIT-093` both demand one verdict about one pid at one moment;
the media differ **deliberately**, because `REQ-GIT-128` protects the base repository, which is the
user's own material and travels with the workspace, so a second machine reaching the same checkout must
meet the same lock. A later sweep that "unifies the two locks" would erase exactly that guarantee.
`REQ-GIT-128` records why they are not unified; ADR-0005 records what would break (constraint W-20).

The store is opened read-write once, by the workspace service, at workspace open, **before any other
process is told the workspace is open and before any stale detection runs**, because a crashed process
can leave a write-ahead log needing recovery and that recovery is a write performed at open. The event
history and the event channel are established **before any part of start-up can fail**
(`REQ-EVENTS-035`). The launch audit is written exactly once, after the worktree bind and the sandbox
verdict, before the first iteration — and there is **no create-if-missing step anywhere in the writer**,
because `REQ-SESSION-132` requires a record kind a session never wrote to read as empty *without* a
placeholder being created for it.

**Iteration.** The engine asks the model layer for a turn. That layer is **two ports, not one**: a
streaming `ModelClient` for providers that are model endpoints, and an `AgentBackend` that owns a turn —
because one supported provider is a locally installed agent runtime with no base URL at all
(`REQ-PROVIDER-005`, `REQ-PROVIDER-049`, `REQ-ORCH-146`, `REQ-MCP-043`).

Text deltas become transcript rows. A row a view has not yet seen is published **immediately — no
minimum wait, debounce or delay floor of any size, on any platform**; growth of an already-visible row is
coalesced into a trailing fifty-millisecond tick (`REQ-MONITOR-218`, `REQ-MONITOR-219`). Every change is
**persisted before it is published** (`REQ-MONITOR-221`), and the durable record it is persisted to is
**the transaction that recorded it**. One event, one commit, before the event is observable on any
channel — so a run killed between the two leaves a record with no event and never an event with no record
(`REQ-EVENTS-029`, `REQ-EVENTS-072`, which now instructs the mechanism: where the store can make the
record and the event one indivisible step, it **must**). No group commit across events.
`REQ-MONITOR-221` states its own reconciliation with `REQ-MONITOR-218`: it is satisfiable alongside it
"because persistence carries no delay of its own".

**Every requested save is applied, and the debounce is gone.** This is a change of substance, not of
wording. `REQ-SESSION-067` now forbids a save being "deferred behind a timer, parked, or coalesced with a
later one"; `REQ-SESSION-071` withdraws the write-volume observable outright and states that "no bound on
write volume is stated and none is needed"; `REQ-SESSION-034` states the crash-loss budget **in saves** —
a crash loses only changes for which no save was ever requested. Two saves requested microseconds apart
produce two commits. The queue never drops, parks, merges or delays. `REQ-SESSION-139`'s metric
aggregates are therefore **maintained** rather than recomputed — adjusted inside the transaction that
inserts an evidence row and inside the one in which a ring displaces one — so the rebuild is O(1) and the
per-save copy copies figures rather than computing them.

**What the withdrawal cost, stated so it is not discovered later.** The window bounded exactly one thing
that is still a file: `summary.md`. `REQ-SESSION-028` rebuilds it on every save and calls it "the one
part written as a file"; `REQ-SESSION-033` gives it the corpus's only retry ladder, spending up to about
1.55 s of backoff; and it is the one write in the product where a foreign handle — anti-malware, or the
user's own editor reached through `REQ-SESSION-191` — can make a save-caused write take a second. ADR-0008
puts it **after** the commit, off the run's critical path, ordered by the save's generation so an older
rebuild cannot overwrite a newer one, with a failed replacement warning and leaving the previous summary
in force; the licence is `REQ-SESSION-006`'s "it is on no path a run waits for". `REQ-SESSION-028`'s
"rebuilt by the same save" admits a blocking reading too, and no requirement settles which. It is derived
and nothing a loader reads is at risk, but this is the ruling's price and it is on the same path as
persist-before-publish.

**Transcript residency is implemented, not dissolved.** A previous pass read `REQ-SESSION-192`'s stated
*reason* — every state save rewrites it whole — as the whole requirement, and withdrew the mechanism with
the reason. Both `REQ-SESSION-192` and `REQ-SESSION-131` survive with new stated purposes: a bounded
resident cost of 5,000 rows and an unbounded complete history, release in whole pages of 50 **before** the
append, index stability across release, and older rows served from released pages, with `REQ-CHAT-165`
depending on both by name. A row carries a nullable page column — no page means resident, a page means
released — and no path ever updates a row that carries one. Separately, the measurement says the same
thing from the other side: the renderer's idiomatic immutable store update costs **2.83 ns per resident
row**, so relaxing the bound spends `REQ-MONITOR-223`'s margin, and that margin is currently supplied by
the transport rather than by the store.

**A tool call.** The model asks for a tool. One gate decides it, and there is no ungated dispatch path.
The gate resolves session approvals first, then the policy, which is an immutable ordered value whose
matchers were compiled when it was built; **building can fail, evaluation cannot**. An `ask` suspends
**exactly that one call** while the session's other agents keep running; the request is published,
mirrored into session state, and presented by main in a per-window queue that main does not decide.

**Attendedness is now the specification's own capability test, not an architecture invention.**
`REQ-TOOLS-053` as amended reads: a session is interactive "exactly when an approval prompt for that
session can be put in front of a person". Registration absence is a *sufficient* condition, not the
definition. ADR-0019's channel-level liveness poll is therefore the implementation of that test rather
than a patch over a gap — a wedged presenter is not one an approval can be put in front of. One
narrowing follows and is easy to get wrong: `REQ-SANDBOX-101` fixes attendedness "at the moment its mode
is resolved", so a lapse governs where a **later** ask is routed and never revisits a mode resolution
already made. A lapse mid-run must not retroactively downgrade a run's permission mode.

**The liveness poll was measured, it works, and the exposure it protects against is not where this record
had put it.** `spikes/presenter-liveness-and-instance-claim.md` detected all nine blocked runs at +386 to
+468 ms on a 500 ms threshold, with **zero false lapses in 258 s** of unblocked running. Three corrections
follow and each is load-bearing. **(1) The check must be gap-based, not reply-based.** While main was
blocked the channel never closed, the process probed alive, every message was accepted, and when the block
ended **all 84 outstanding replies arrived** — the last at 7,885 ms round trip. A "did the reply for
sequence *N* arrive" check reports success eight seconds late and never fires. **(2) The approval dialog is
not the hazard; every other dialog is.** `REQ-TOOLS-063`'s own modal window costs the poll nothing —
266–267 ms maximum gap, indistinguishable from idle. But while a **synchronous** platform dialog is open,
**no main-process JavaScript runs at all** — 0 timer firings, 0 handled messages from a renderer, 0 replies
to the run host, over 6,489 ms and 7,339 ms. The folder chooser (`REQ-WORKSPACE-009`, `REQ-SHELL-011`,
`-021`, `-163`) and the "quit while a run is active" message box (`REQ-SHELL-119`) are raised by domains
that have never read an approvals record, and either of them held open for five seconds makes the
application declare itself unattended while the user is picking a folder. The asynchronous forms of the
same native dialogs measured 267–303 ms with the identical dialog on screen. **So the obligation is
application-wide and is now stated as one: no synchronous platform-dialog call may ever be made on main.**
It is written in full in ADR-0019 and carried in constraint T-31, because that is where its violators will
be standing. **(3) There is no platform signal for "main is unresponsive" a run host can use.** Electron's
own events are emitted by main; the operating-system signals detect the wrong case — the hung-window test
fired at +5.18/+5.41/+5.44 s for a busy loop and **never** for a native modal, with the modal's own window
reporting itself healthy on all 23 samples. Recorded so it is not re-proposed.

**The window is still not sized, and OQ-39 is explicitly not closed by any of that.** *(ruled 2026-10-06,
[R-071](../../product/requests.md#r-071): the poll and the window accepted as built)* The spike's main process
paints one heading; it has no framework, no transcript pipeline, no session writer and no version control,
and it does **not** reproduce the 22,777 ms of event-loop lag the IPC spike measured under frame load —
which is the state the window must survive. What exists is a floor (a false-lapse floor on an idle main and
a detection latency for a set of thresholds), not a size.

On `allow`, pre-execution hooks run — in declaration order, one after another, **even after one has
decided to stop the call**. Then the tool executes; if it is a command, it goes into the terminal
session's persistent pseudo-terminal shell, wrapped for confinement if a mode is active, **as a single
shell argument**, quoted, because quoting is a security boundary rather than a formatting nicety.

Every decision is recorded to the permission audit through one serialised writer, together with its
issue, its timeline event and its stream event, and **none of them may fail the dispatch**. The audit is
an append-only table whose rows carry the serialised entry **verbatim**, which discharges
`REQ-TOOLS-078`'s "byte-for-byte as it was written" literally rather than by paraphrase; there is no
update path in the data layer and a store-level trigger refuses one. `REQ-TOOLS-081` now uses
`REQ-EVENTS-056`'s `<record kind>#<record id>` locator rather than naming a file. The two durable side
effects and the audit entry commit in **one** transaction and the wire event is forwarded after it. Ring
displacement happens in that same transaction — `REQ-SESSION-133` now **requires** it, "the trim MUST
take effect in the same durable operation that records the entry" — and the cumulative per-kind dropped
count is a second maintained counter, because `REQ-SESSION-199`'s export consumes it.

**The event history's trim was the one place two ADRs disagreed. It is settled, in ADR-0009's favour, and
the argument that settles it is one neither record had made.** ADR-0009 puts `REQ-EVENTS-091`'s trim in
its **own** transaction on the serialised queue, immediately after the commit of the append that
overflowed and before the next event is recorded. ADR-0004's generalisation — that a trim is a delete
inside the transaction that made the insert — is **withdrawn**, and preserved there with the argument
that supported it.

**Both records were arguing about the wrong cost.** The obvious objection to a shared transaction is that
a failed trim would discard the overflowing event, and a reader can answer that: one event, on a failure
path, is a price worth paying for one rule instead of two. `REQ-EVENTS-088` is what makes it
unanswerable. A rolled-back trim is a failed transaction, a failed transaction is a failed recording
step, and `REQ-EVENTS-088` makes a failed recording **sticky** — the store is marked failed for the
remainder of that run and no further event may be recorded for it. So the shared transaction converts
`REQ-EVENTS-091`'s "bounded and visible cost" into the permanent end of that session's history. Those two
requirements prescribe deliberately different outcomes for deliberately different failures, and a shared
transaction is precisely the arrangement that cannot tell them apart. The price is not one event; it is
every event after it.

**The amendment does not decide it, and a reader who thinks it does will get the right answer for the
wrong reason.** `REQ-EVENTS-092` binds the truncation record to the **trim** — "the same indivisible step
as the trim that produced it", which closes a crash window the file design accepted. It says nothing
about binding the trim to the **append** and is satisfied identically under either arrangement. What it
settles is the older two-step-marker question, and it settles that in ADR-0009's favour too.

**They do not conflict as designs, and the rule that generalises is now in both records.** ADR-0004's
reading is *correct* for the seven ring-capped evidence kinds, where `REQ-SESSION-133` requires the trim
"in the same durable operation that records the entry"; it was wrong only where it generalised to a store
whose requirement says no such thing and states a failure mode that depends on its not being said. **Put
the trim inside the recording transaction exactly where a requirement says the trim and the record are
one durable operation, and nowhere else.** ADR-0024's retention section is annotated so a reader who
notices the asymmetry does not unify two behaviours the specification separated — and it states the price
of its own arrangement rather than hiding it: under the shared transaction a failed trim loses the entry
being recorded, where the event history's arrangement loses nothing.

**A second half of ADR-0004's claim was not in dispute and is wrong anyway.** It held that
`REQ-EVENTS-098`'s no-racing rule "is discharged by the transaction rather than by a queue discipline".
The amended requirement refuses that in terms: serialisation is required "even where the store's own
guarantees already make two writers unable to corrupt one another, because what is at stake is emission
order (`REQ-EVENTS-076`) as much as record integrity, and no store supplies that on its own." A
transaction gives atomicity and isolation; it does not give sequence. Withdrawn rather than quietly
amended, because a reader was entitled to conclude the queue was redundant on the strength of it.

**The reopening condition is named because it is three hops long.** `REQ-EVENTS-088` is not obviously
about trims — it is about recording failures — and an amendment to it made for unrelated reasons would
silently unmake this settlement. Both records say so. A reader of `REQ-EVENTS-088` alone has no signal
that an architecture decision hangs on it.

**Delegation.** A child is a **ledger record**, not a promise, and under SR-4 it is rows. Two mechanisms
got **stronger** rather than merely re-homed. The child row's update and the `child.transition` event
commit in one transaction, so `REQ-MONITOR-016`'s "leave the record untouched, deliver no state-change
event" stops being a discipline and becomes unviolatable, and `REQ-MONITOR-300`'s two settling paths
(`REQ-MONITOR-209`, `REQ-MONITOR-211`) are ordinary arguments to the same transition function rather than
a bypass of it — which is what keeps the sole-implementation claim true through later sweeps. And the
start claim becomes one conditional update whose affected-row count **is** the outcome, so
`REQ-ORCH-049`'s at-most-once holds by the store rather than by the scheduler's shape, and the
suppression record commits with the losing claim. A scheduling **pass** must not become one transaction:
starting a child is model and tool work. One thing got weaker and is recorded as an obligation with a
test rather than as an incidental: `REQ-ORCH-151`'s per-run isolation was a filesystem partition under
files and is a session-id query predicate now, so a missing predicate is a silent cross-run leak in the
one record whose whole point is that concurrent runs cannot influence each other.

**Watching.** A renderer holds a replica, written only by the two channel handlers. Its apply stage is an
explicit pure function of (displayed state, incoming state) returning either a refusal or a new view model
plus six classified operation counters. A stage that cannot correctly apply an increment **declines it and
re-renders from a whole read**. The transcript is painted by a **fixed pool of recycled row slots, sized
from a declared `H_max` and allocated at window construction**, because the count of live paintable
elements must be invariant after construction and a conventional list mounts and unmounts rows as the
visible set moves.

**ADR-0045 is no longer blocked, and it was a ruling that unblocked it.** ESC-13 is decided:
accessibility wins, the canvas is refused outright, and if OQ-28 resolves to the framework-neutral
reading then `REQ-UIBENCH-054` is **relaxed**. So the record survives either reading, and OQ-28 reverts to
what it should always have been — a definitional question about how a number is counted, whose answer
changes a benchmark field and nothing a user can see. The measurement arrived alongside and went the
other way, which is exactly why the ruling was needed: under reading 1 `widgets` was **629 at all 384
observations** across twelve runs, two scroll variants, onscreen and offscreen; under reading 2 it moves
**630 → 777** (reader at the top) or **630 → 715** (reader at the bottom) at the first post-construction
record, in every run — before any of the phases OQ-28 discusses, and by an amount padding cannot repair.
Under reading 2 the count also stops being a property of the transcript and becomes a property of where
the reader is scrolled — 777 at the top, 668 at the bottom, 747 at minimum window size, same product,
same fixture, same iteration.

**The specification-side action this paragraph called for has happened, and the sentence that called for
it is withdrawn.** It read: "`REQ-UIBENCH-050` and `REQ-UIBENCH-054` are **unamended**; the corpus
therefore still states an invariant that its own definition breaks on one live reading, and
`resolutions/21` withholds the drafted relaxation." **Both requirements are now amended and neither
statement is true.** `REQ-UIBENCH-050` states in bold that the framework-neutral counting rule "is the
operative one" — **reading 2 wins** — spells out that a rendered paragraph, code block or list item
inside a transcript row *is* a widget, and closes the escape route by saying the framework clause "does
not license a product to count only the elements its own layout declares and to leave out what it drew".
`REQ-UIBENCH-054` carries ESC-13's relaxation and states its ground exactly: the invariant is withdrawn
as **unsatisfiable by any admissible implementation**, not merely as unmet, because the only structure
that could hold it is a canvas and a canvas forfeits `REQ-CHAT-075`, `REQ-CHAT-077`, `REQ-CHAT-065` and
`REQ-SHELL-144`. **OQ-28 is closed.** The cost ESC-13 accepted is unchanged and is not softened by that:
the product ships a benchmark whose headline structural invariant is gone, in a domain whose whole point
is determinism — informational either way under `REQ-UIBENCH-088`.

**Two more of this record's benchmark complaints were answered in the same pass**, and both were answered
by the requirement rather than worked around. `REQ-UIBENCH-087` now states that where a
`tail_replacements_1000` record carries `settle_timed_out` true its samples "measure nothing", so the
memory tripwire reads **false** rather than reporting a pass on a figure that is not a measurement —
naming the exact failure this record had identified, "a second-half growth of minus a hundred million
bytes satisfies *strictly less than 64 MiB* exactly as a healthy figure does". And `REQ-UIBENCH-118`
withdraws its own "the only absolute threshold" claim "as untrue of this document", naming the 64 MiB of
`REQ-UIBENCH-087` and the one-thread delta of `REQ-UIBENCH-084` as two more.

Two other things the renderer measurement settled, the first of which the specification has since acted
on as described above. The memory tripwire passes with room —
`rss_second_half_growth_bytes` between 106,496 and 7,172,096 bytes against 64 MiB, a worst case of
**10.7 %** of the threshold — but on Windows `rss` is the working set and the operating system trims it,
so a phase whose settle expires produces a *negative* growth figure that satisfies the tripwire while
measuring nothing; one run produced −109,273,088. And **"the largest viewport the window can reach" has
no referent**: a 20,000 px content height was requested, granted, and reported as a real laid-out viewport
on a machine whose tallest display is 1,080 px, calling for 671 slots against a pool of 80. ADR-0045's
replacement of that formulation with a declared constant is not tidier, it is the only thing available to
write down — and somebody must still choose the number (**OQ-40**).

**There is no viewer of a session another process owns, because there is no such session.** A session is
in exactly one of two conditions and no third (`REQ-SESSION-159`, `REQ-MONITOR-243`): live and executed by
this instance, published to over the two channels and by no other route; or not running, existing as a
persisted record, put back on screen by being opened from that record and continued (`REQ-SESSION-196`).
One live session may be displayed in as many windows as the user has open. A session left behind by a
crash or a force-quit is **stale, not foreign**.

`REQ-SESSION-196` is simpler than this record used to describe: the snapshot read's completion step from
stored `transcript.row` events is **withdrawn**, because "a row the session recorded is a row its
persisted state already holds and there is nothing left to complete". `REQ-SESSION-159`'s closing
guarantee — that following a session and reopening it produce identical transcripts — is true by
construction, because only one derivation remains.

**The decline-and-re-read path has two entrances and neither fires in normal operation**, so both must be
exercised deliberately by tests: an increment the stage cannot apply, and a sequence gap. It is the
product's only loss-detection mechanism, and a rising reconcile count in diagnostics is a defect signal
rather than normal traffic. It is also the one path nothing has measured — `refused = 0` in every run of
the IPC spike, so the cost of a reconcile has never been taken.

**Stopping.** A cancel **first releases anything blocked on a person** — questions, then approvals,
resolving each as **denied** — and only then stops the run. Graceful first, hard after thirty seconds,
with a second sweep for work created during the first. The stop request is **sticky**.

Teardown is an ordered eight-step pipeline that runs **even on any exception**: timeline entry, logging
cleanup, **lock release** — which first tears down the session-scoped tool-server subprocesses — one run
result, `session.end` then exactly one `result` over the bus while the sink is still attached, the
disabled-hooks notice, and the removal of every per-session binding.

**Taking a copy out, and putting one back.** Two things a user does to a *workspace* rather than to a
session sit beside all of the above, and both are new since the last pass. **Exports** are per record
kind and per artifact: the trajectory document, the timeline, the issues record, the metrics document,
the permission audit, the verification-gate record, the improvement store and the delivery store, each
written to a file the user chooses, each readable by a stock parser on a machine with none of this
product's code present, and none of them a channel. **The backup** is one artifact holding the whole
store. It is taken in the **workspace service**, with main contributing only the save dialog, by an
engine-level consistent-snapshot copy inside a read transaction — never a file copy, because a file copy
of a live store is not a state any reader could have observed. It runs **while runs are live**, which is
the requirement's hardest clause and the one that shapes the mechanism: `REQ-SESSION-201` forbids
refusing it because a session is live, so every run-host commit at `REQ-MONITOR-219`'s tick is a write
concurrent with the copy. The artifact is a container of exactly three things — a manifest, the store
snapshot, and the per-session files the snapshot references — taken in a fixed order, with **the snapshot
as the authority for what the artifact contains**: snapshot first, then enumerate *from the snapshot* and
copy only what it references, then seal, then rename onto the destination. Files-first would let the
snapshot name a body the artifact lacks. One stated cost: the session log is carried as a **prefix**
truncated at its last complete line, because it is being appended to; the summary is unaffected because
`REQ-SESSION-033` replaces it atomically.

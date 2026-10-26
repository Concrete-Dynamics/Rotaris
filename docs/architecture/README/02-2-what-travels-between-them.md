# Rotaris-crw — system architecture — 2. What travels between them

Part 2 of 13 of [the architecture README](../README.md), which indexes every part.

## 2. What travels between them

Three channels leave the run engine, and they have **incompatible failure contracts**. That is why there
are three rather than one, and it is the single most important thing to understand before touching any of
them.

**Control** is request and response. Every one of the twenty-one control operations must be issuable
against a run in a different process, with arguments limited to text, numbers, booleans and simple
collections "so that a request survives a process boundary without losing meaning" (`REQ-MONITOR-013`).
The result is a boolean plus an optional string populated for exactly two operations; a control answers
`false` rather than raising, and is safe from concurrent callers (`REQ-MONITOR-005` to
`REQ-MONITOR-011`). Since SR-1 that boundary is unambiguously **the run host against the window**;
`REQ-MONITOR-013` now says in terms that it "is never the boundary between two instances".

**Wire events** are the ordered, **bounded-blocking** bus. Delivery of one event to one consumer must
complete before the run proceeds past the operation that raised it — "a slow consumer delays the run
rather than losing or reordering events" — bounded at five seconds, after which that consumer is detached
permanently (`REQ-EVENTS-165`). Every event is **committed to the durable record before it is forwarded**,
so an event a failing consumer never receives is nevertheless recorded.

**View updates** are **non-blocking** and best-effort. No view may hold a run open, slow it down, or
change its outcome: a run observed by nothing, by a healthy view, or by a broken one must reach the same
terminal result, the same persisted record, the same event sequence and the same timing
(`REQ-MONITOR-232`). They carry two payload shapes — an incremental transcript update carrying the lowest
row index whose content may still change, and one whole-session update carrying **every field any surface
can display** (`REQ-MONITOR-214`, `REQ-MONITOR-216`, `REQ-MONITOR-217`).

**Nothing polls, and loss is detected rather than waited for.** Every publication on either view channel
carries a **monotonic per-session sequence number**, from **one counter shared by both channels**,
starting at 1 and raised by exactly one per publication (`REQ-MONITOR-214`). A surface begins from a
whole-session update and counts on from the number that update carried; a publication bearing any other
number means one was lost, and the surface must record a diagnostic, stop consuming increments and
re-render from a whole read **on the publication that reveals the gap, with no delay and no timer**
(`REQ-MONITOR-226`). A number at or *below* the expectation is a superseded publication rather than a
gap, which is also what discharges `REQ-MONITOR-225`'s "a stale read must never overwrite newer content".
The number is stamped **in the run host at the moment of publication**, by the same per-session owner that
gates on the durable commit; neither main nor the preload may generate, renumber or re-derive one. Three
consequences are easy to get wrong and are stated in ADR-0043: an expectation is created **by a
whole-session update and by nothing else**; subscribing, un-hiding a window and changing focus all
**begin** rather than continue; and a surface that is reconciling **drops** publications for that session
rather than queueing them, which is what keeps the apply-stage counters byte-identical across processes.

This replaces the 2000 ms local reconcile poll and the 750 ms foreign poll, both withdrawn.
`REQ-MONITOR-288` survives only as a withdrawal, naming what replaced it, and `REQ-MONITOR-287` now
states that this domain **fixes no cadence for polling a session's own state at all** — the timing
constants it does still fix are unrelated to following a run and are cited where each is used.

The event bus and the view channel look like they should be one thing. They cannot be: one says a slow
consumer delays the run, the other says no view may slow it at all.

Across the process boundary these become five named, typed IPC channels — transcript increment, session
snapshot, terminal frames, notices, and commands — with the two update channels relayed by main and every
payload carrying the session id it belongs to, so that a focus-change race is structurally impossible
rather than timing-dependent. The two update channels additionally carry the sequence number, and main
**relays it unchanged**. No sixth channel is added for reconciliation: the request is a command on the
existing command channel, and the response is a whole-session update plus a transcript increment with an
earliest-changed index of zero over the resident window.

### What the measurement changed here

`spikes/ipc-hop-latency.md` is the first measurement of the double hop, and it settles three questions
and overturns one claim.

**The relay meets every budget, with room.** Run host to renderer, measured p95: **1.133 ms at zero rows
and 1.291 ms at 10,000 rows**, against `REQ-MONITOR-222`'s 250 ms — roughly two orders of magnitude. The
`REQ-MONITOR-223` ratio is **1.14** against a ceiling of 2, and 1.19 at `REQ-SESSION-192`'s actual
5,000-row residency cap. The whole-session update, which is what `REQ-ORCH-155`'s surfaces travel on, is
p95 **5.951 ms** unloaded and 7.807 ms under 65.5 MB/s of terminal frames, against the 100 ms that
requirement now states **explicitly as a 95th percentile** — SR-8's amendment has landed, and read as an
absolute bound the same data fails (24 of 9,000 samples over 100 ms). ADR-0002's Revisit-if clause is
discharged; ADR-0044's structured-clone trigger is discharged (quadrupling the payload multiplied p95 by
2.05, not by 4).

**"Terminal frames on their own channel" does not do what the record said it did.** A distinct Electron
channel *name* is not a distinct transport: every `webContents.send` for one `webContents` is multiplexed
onto one pipe, dispatched by one main-process event loop and one renderer main thread. Transcript p95
rose **6×** at 65.5 MB/s and **97.8×**, to 126.207 ms, at 12,000 frames per second. The relay's cost is
**per message, not per byte** (33–37 µs per 4 KiB send against 163–195 µs per 64 KiB). ADR-0044 was wrong
about the mechanism and right about the outcome, and it now says so; the argument it was chosen on is
preserved there as the withdrawn claim it is.

**What actually supplies the isolation is ADR-0021's coalescing cap, and that cap is now load-bearing for
a conformance budget in another domain.** At the rate the architecture licenses — a 20 ms coalescing
floor, so ≤50 frames/s per stream, ≈1,000 frames/s across `REQ-MONITOR-285`'s 20 agents — no topology
showed a problem (p95 1.514 ms). ADR-0021 carries that statement now, because a reader asking "what
protects the 250 ms p95" would otherwise open ADR-0044 and find a channel list. **The second factor in
that arithmetic is bounded by no requirement**: `REQ-TOOLS-108`'s `runtime.shell_max_background_sessions`
has a default of 20, a minimum of 1 and **no maximum**, and each background session publishes its own
stream (`REQ-TOOLS-127`). That is a new escalation, not an architecture choice.

**The relay's real failure mode is invisible to the mechanism installed to catch failures.** In the
collapse, **nothing was dropped and nothing was reordered** — every one of 586,960 frames arrived, in
order, `refused = 0` — while main's event-loop lag reached 22,777 ms. `REQ-MONITOR-226`'s sequence-gap
counter catches a *lost* update; this failure loses nothing and presents only as a stale interface.
ADR-0010 puts two instruments on ADR-0052 for it — a publish-to-apply latency stamp and a relay
message-rate counter — on the strength of a measured failure mode rather than a requirement, and says so.

**The direct `MessagePort` is measurably better and is not adopted.** It is 1.9×–2.1× on an increment,
3.7× on a whole-session update, 26.9× on that update's worst sample and 113× under 12,000 frames/s, and
it was verified to work with `sandbox`, `contextIsolation` and `nodeIntegration` intact. It was the
difference between passing and failing **only** on `REQ-ORCH-155` read as an absolute bound, and SR-8
ruled that reading incoherent. It is therefore recorded as a lever held in reserve, which is where
ADR-0044 consequence 3 puts it, rather than as a second transport with no requirement behind it.

**The commit is now measured, and the margin survives at two thirds of its old size.**
`spikes/commit-on-the-publish-path.md` closed the one link every transport figure in this record was a
lower bound on. Commit **then** publish, end to end over the relay: **p95 1.774 ms at zero rows and
1.723 ms at 10,000**, against `REQ-MONITOR-222`'s 250 ms — so the margin the record had been quoting falls
from ~221× to **~141×** and holds. `REQ-MONITOR-223`'s ratio is **0.971** against a ceiling of 2; a 10,000-row
session was consistently a shade *faster* than an empty one, because the insert goes into a primary key
whose depth barely moves. Zero of 20,000 publications exceeded 250 ms. The commit alone is **0.28 %** of
the budget at p95 and the whole interval **0.71 %**. `REQ-MONITOR-221`'s own argument — that
persist-before-publish is satisfiable alongside `REQ-MONITOR-218` "because persistence carries no delay of
its own" — is upheld at a measured price of **0.396 ms p50 / 0.700 ms p95**: it is work, not a wait.

**What the commit changed is the shape of the distribution, not the percentile, and the shape is what a
threshold will trip over.** The write-ahead log's automatic checkpoint fires **every 135–136 commits** —
arithmetic, not chance: the publish-path transaction writes **7.44 log frames** against a default
checkpoint threshold of 1,000 — and costs **9–11 ms at p50, worst observed 53 ms**, while the other 99.27 %
of commits cost 179–220 µs. Nothing about that threatens 250 ms. It does mean **any diagnostic or
conformance threshold built on "an update takes about a millisecond" will see routine fifty-fold
excursions on a fixed period and must not treat them as faults** — and it makes the checkpoint period a
**design input**: widening the publish-path transaction, by a second index or a wider update, shortens the
period proportionally. Turning the autocheckpoint off was measured and is worse in every direction (31 %
slower p50, 87 % slower p95, a 91 MB log in 3,000 commits, one 155 ms stall).

**One floor the requirements forbid can still be manufactured from outside this record, and one rule is
what prevents it.** `REQ-MONITOR-218` says no delay floor **of any size**. A second process holding a write
transaction turns the commit into a wait of exactly that transaction's length: **205.4 ms measured for a
200 ms hold** — 82 % of `REQ-MONITOR-222`'s entire budget in one commit, before the transport has done
anything — and held back to back the writer starved indefinitely, 3,000 commits not completing in 300 s. A
*compliant* heavy reader costs 163.6 → 345.9 µs p50 and 271.7 → 898.9 µs p95 with zero errors and zero
lock contention. So ADR-0058's prohibition on long write transactions is **load-bearing rather than
hygiene**, and it is the thing that keeps `REQ-MONITOR-218` true.

**One bound remains, and it is the one this record keeps being surprised by.** The harness's renderer was
empty — no framework, no state store, no Markdown renderer, no real recycler, one window, one session,
development mode — and the commit harness ran against three tables with two primary keys and one listing
index, no migrations, no checkpoint index, no delivery store, no traceability tables. **Every additional
index on the transcript table adds log frames per insert and therefore moves both the commit cost and the
checkpoint period.** A reader who takes 1.774 ms as the product's number will be surprised.

**One obligation here is invisible in the payload types and no type check will catch it.** Because one
counter is shared by two channel names, per-session order must be preserved **across** them. A snapshot
overtaking an increment presents as a gap that nothing was lost from, and the surface reconciles anyway —
a self-inflicted reconcile rate on the one path the design needs to keep rare (constraint U-20).
`REQ-SHELL-104`'s per-stream terminal sequence is a **different** counter with a different scope.

**And one rule about the transcript increment is a correctness rule, not an optimisation.** Publishing an
earliest-changed index of zero for anything but a genuine reset silently converts every update into a
whole-transcript transfer (`REQ-MONITOR-223`). The sender asserts against it and diagnostics counts it.
Any cross-process test of `REQ-MONITOR-222`, `REQ-MONITOR-223` or `REQ-ORCH-155` must **calibrate its
clocks**: `performance.timeOrigin` is not a shared epoch, and the measured offset ranged over 1.43 ms —
larger than a whole one-way latency on the direct port.

---

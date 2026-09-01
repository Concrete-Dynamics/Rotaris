# ADR-0011 — Following a session this process does not own

- **Status:** **withdrawn.** The mechanism this record decided no longer has a case to decide. The
  identifier is permanent and the record is kept, superseded in place, because other records cite it
  and because its analysis is evidence.
- **Date:** 2026-08-31
- **Withdrawn:** 2026-08-31, by `owner-decisions.md` SR-2, with the store consequences of SR-4.
- **Origin:** RUNTIME (ADR-RUNTIME-05), DATA (ADR-DATA-02, held-descriptor rule)
- **Depends on:** ADR-0004, ADR-0005, ADR-0009, ADR-0010
- **Superseded by:** ADR-0010 and ADR-0043 for how a live session reaches a surface; ADR-0002 and
  ADR-0055 for why no session can be foreign.

## Context

**What this record was decided against.** `REQ-SESSION-159` used to hold that when a session runs in
a process other than the one displaying it — a second window of this application, another instance
opened on the same workspace, or a run detached into the background — **the only channel to it is the
filesystem**, and that the live transcript is followed by tailing the session's event history and
turning `transcript.row` events back into the same deltas a local run yields. The follow protocol was
fixed in detail: a resumable byte offset landing immediately after a fully written line, a partial
trailing line held without warning and delivered once whole, a restart flag raised when the file is
shorter than the offset, when the byte before the offset is not a newline, or when the truncation
marker's dropped count had risen, a corrupt line skipped with a warning while the offset still
advanced, and a follower reproducing the run's own row numbering with gaps filled by a placeholder
row and a re-seed applied in one step so the view was never observed empty. Two cadences were fixed:
a 750 ms foreign poll and a 2000 ms local reconcile poll.

**Why none of that has anything left to decide.** SR-1 rules that a second launch of the application
surfaces the running instance rather than starting a rival process (`REQ-STARTUP-161`,
`REQ-STARTUP-162`). SR-2 rules that a session is therefore in exactly one of two conditions and no
third: **live**, owned and executed by the one running instance, which publishes its progress to
every surface that instance shows; or **not running**, existing as a persisted record which is opened
and continued (`REQ-SESSION-159`, `REQ-MONITOR-243`, `REQ-SESSION-196`).

Of the three cases `REQ-SESSION-159` used to name, the first and third — another window of this
application, and a run detached into the background — were always inside one process tree under
ADR-0002 and always reachable over the internal channels. Only the second, a second instance opened
on the same workspace, needed the filesystem, and it no longer occurs. **There is no process this
application does not own whose run a surface might want to watch.**

A session left behind by a crash or a force-quit is not the missing third case. It is **stale, not
foreign**: `REQ-MONITOR-027` states there is no third reading of such a session, and the existing
reap and repair path (`REQ-SESSION-047`, `REQ-SESSION-056`, `REQ-SESSION-060`, `REQ-SESSION-183`)
settles it, after which it opens like any other persisted session. The only session this instance can
neither view nor continue is one whose lock it cannot *prove* unheld — a lock naming another machine,
or one that cannot be read — and `REQ-SESSION-159` requires such a session to be **refused rather
than watched**, with `REQ-SESSION-183`'s explicit release as the remedy. Unreachable only while
something else may still be running it, and never permanently.

The specification has been amended to match. `REQ-SESSION-149` and `REQ-SESSION-160` are withdrawn,
as are `REQ-MONITOR-244`, `REQ-MONITOR-247`, `REQ-MONITOR-287`'s foreign cadence and
`REQ-MONITOR-288`. `REQ-SESSION-071`'s rule that re-reading persisted state on a timer is not a
supported way to follow a run now has **no exception anywhere in the product**.

## Alternatives considered

**These are preserved as history.** They were a real analysis of a real problem and they are the
evidence for why the withdrawn design was the right one *given its premise*. The premise is what
went, not the reasoning. Nothing below is a live option.

**A — Interval-driven resumable reads.** *(Chosen at the time; now withdrawn with the case.)* Each
read seeks to the stored offset, reads what was appended, and **also reads the history's metadata
sidecar** to compare the cumulative dropped count — `REQ-EVENTS-116` made that comparison the thing
that turned trim detection from incidental into guaranteed. Non-transcript state came from a
whole-state read on the same 750 ms tick.

**B — Filesystem watching driving the tail.** *(Rejected at the time; the rejection was correct and
is now moot.)* Genuinely tempting: lower latency than 750 ms and less idle work. Two things weighed
against it. The restart detection required reading the truncation marker on **every read**, so a
change notification could not replace a read; and `REQ-MONITOR-288` fixed 750 ms as the *observed
latency* for a foreign session, so lower latency was not a requirement being missed. Platform watcher
semantics around atomic renames are also the case watchers handle worst, and the journal was replaced
by rename on every trim. A defensible middle position — keep the interval as the contract and allow a
watcher purely as an extra wake-up that never replaces a scheduled read — was permitted but bought
little.

*This analysis is worth keeping for a reason beyond its subject.* It is the record's clearest
statement of why filesystem watching is a poor transport for a live protocol: the rename semantics
that watchers handle worst are exactly the semantics an atomically replaced file has, so a watcher
buys latency and costs correctness. Anything that later proposes a watcher as a channel between two
parts of this product should be measured against it. Under SR-3 there is no such channel to build, so
the finding is now a guard rail rather than a design input.

**C — Push over IPC from the writing process.** *(Rejected at the time; **this is what the product
now does**, because SR-1 removed the objection to it.)* It was rejected on `REQ-SESSION-161` as then
worded, and more importantly because it did not serve the case that motivated the requirement: a
session owned by a **second instance of the application**, which had no IPC path to this one at all.
That case is gone. `REQ-SESSION-161` has been rewritten and no longer forbids it: a live session's
whole-session read is now "the whole-session update the application publishes on request".

**The one argument in this record that survives its own withdrawal** is `REQ-SESSION-159`'s reason for
insisting that following and reopening share a derivation: *following a session and reopening it
afterwards must produce identical transcripts.* That requirement is not withdrawn. It is now true by
construction rather than by discipline, because **only one derivation remains** — `REQ-SESSION-196`'s
snapshot read completed from the session's own stored `transcript.row` events, applied at their own
index under `REQ-EVENTS-052`'s replace-at-index semantics. The equality `REQ-MONITOR-242` demands can
no longer be broken by two paths disagreeing, because there is no second path to disagree.

## Decision

**The mechanism is withdrawn.** No part of this product follows a session by reading its files, on a
timer or otherwise. What replaces it is not a new mechanism but two that already existed:

1. **A live session is published to.** The run host publishes on the two update channels of
   `REQ-MONITOR-214` and `REQ-MONITOR-216`, per session, and by no other route
   (`REQ-MONITOR-243`, `REQ-MONITOR-246`). ADR-0010 owns the channels, ADR-0043 owns the projection
   and the replica, ADR-0044 owns the payload contract. Which window started the run, whether any
   window is still watching it, and whether it was detached into the background make no difference to
   what a surface receives, because all of those are the one instance (`REQ-SESSION-159`,
   `REQ-SESSION-106`).
2. **A session that is not running is opened from its record.** `REQ-SESSION-196`'s reattach, from
   `REQ-SESSION-040`'s read-only snapshot read completed from the session's stored `transcript.row`
   events. That is the same derivation for a session left by a crash, a session whose window was
   closed, and a session opened after a restart.

**What used to be lost by delivery, and is now caught by sequence rather than by re-reading.** The
follow protocol's restart flag existed to detect that the follower had fallen behind a file that had
moved under it. Its replacement is `REQ-MONITOR-214`'s per-session sequence number and
`REQ-MONITOR-226`'s obligation to reconcile from a whole read on the publication that reveals a gap —
immediately, with no timer. ADR-0043 designs it; ADR-0046 places the check in the apply stage.

### Withdrawn together with the follow protocol

Recorded individually so that a reader of the git history can see each removal was deliberate:

- The resumable byte-offset read and the offset returned to a caller.
- The restart flag and its three trigger conditions.
- The truncation marker's dropped-count comparison.
- Placeholder-row gap filling, and the rule that a re-seed replaces displayed rows in one step so the
  view is never observed empty. Its purpose — that a view is never blanked while recovering — is
  **not** lost: `REQ-MONITOR-224` requires declining an increment not to interrupt the user or blank
  the transcript, `REQ-SESSION-161` requires the rows on display to be unchanged by the increment that
  was declined, and ADR-0046 step 1 states it as a rule of the apply stage.
- The 750 ms foreign poll and the 2000 ms local reconcile poll.
- The per-viewer offset, last-seen dropped count and derived row set, and the rule that they are
  discarded and re-seeded atomically.
- The rule that a handle executing its own run refuses to follow another session. What it protected
  is held by the exclusive session lock instead — see ADR-0013.
- **The held-descriptor rule.** This record made ADR-0004's open-and-close-within-the-call discipline
  load-bearing rather than hygienic, on the strength of DATA's Windows spike showing an ordinary open
  reader making a concurrent writer's rename fail with `EPERM`. Under SR-4 there is no rename to
  fail: session data is rows in a workspace database whose readers do not block its writers. The rule
  is dissolved **for this record's stores**, not relocated. It is **not** dissolved generally — ADR-0004
  keeps rule 1 for the five stores that remain files, and OQ-41 stays open over the traceability
  artifacts, which stay files and never reach the store. `REQ-TRACE-502` is narrowed by SR-1 rather than
  reached by SR-4; see ADR-0004, ADR-0040 and ESC-14.

### What must not be lost with it

- **The stored history is still written, still readable, still exportable.** SR-2 is explicit that the
  event journal is unaffected by the withdrawal of the protocol for following it, and SR-4 is explicit
  that `REQ-EVENTS-166`'s obligation — a stored history yielding every field to a stock parser on a
  machine carrying none of this product's code — is honoured by an **export command**, not by the
  runtime write path. Wherever this record leaned on the file's byte format to make a history
  readable elsewhere, that job is the export's. Reading a session's history within the product —
  `REQ-EVENTS-126`'s listing summary, the history surface, replay — is unaffected: what is withdrawn
  is following it live, and only that.
- **The single-writer discipline.** `REQ-EVENTS-098` still holds: a session's store has at most one
  writer and the right to write is exactly the right to hold that session's lock. A transaction makes
  it cheaper to enforce; it does not excuse stating it. Under SR-1 the writer is always this
  application's own run host, so the rule now defends a state that should not arise rather than
  arbitrating between rivals.
- **Ordering.** `REQ-EVENTS-052`'s one-or-two-events-per-index contract, contiguous indices from `0`,
  and replace-at-index rather than append, are unchanged and are what make the reattach derivation
  idempotent.
- **The session lock's purpose.** Under SR-1 there is one instance — but the instance that *crashed*
  is exactly what the reap path exists for. Whatever ADR-0005 makes of the lock under SR-4, it must
  still settle a session whose owner is gone and must still carry the pid and host vocabulary
  `REQ-SESSION-183` requires the explicit release to state.

## Consequences accepted

1. **The specification's foreign-session vocabulary is retired, and citations to it must be
   re-pointed.** Any record still citing `REQ-SESSION-149`, `REQ-SESSION-160`, `REQ-MONITOR-244`,
   `REQ-MONITOR-247` or `REQ-MONITOR-288` as live behaviour is stale.
2. **Two transports collapse to one, and the exercise argument that justified sharing a projector is
   spent.** This record argued that the local and foreign transports must share one projector partly
   for *exercise* — the foreign path was rare and carried the trickiest logic, so routing local
   traffic through it kept it tested. With one transport there is nothing to keep exercised. The
   general form of the argument survives and is applied elsewhere: ADR-0043 and ADR-0046 both record
   that the decline-and-re-read path never fires in normal operation and must therefore be exercised
   by tests deliberately rather than treated as an error branch.
3. **OQ-3 is answered.** "Is a second application instance on one workspace a supported
   configuration?" — no. SR-1 and `REQ-STARTUP-161` settle it, and the requirements that pointed
   toward yes have been re-read: `REQ-MONITOR-013` now says the boundary is never between two
   instances, `REQ-GIT-124`'s lock-holding predicate now covers this instance's runs and unreaped
   stale locks, and `REQ-PROVIDER-152`'s lock survives on the narrower rationale ADR-0002 consequence
   8 gives.
4. **ESC-10 is dissolved.** There is no second instance whose control must be refused. The refusal
   remains as a defence against a state that should not arise, not as routine user-visible behaviour.
5. **Latency improves and no requirement notices.** A foreign session's observed latency was 750 ms
   by specification. Nothing is now observed at 750 ms; every surface is on the published path with
   `REQ-MONITOR-222`'s 250 ms p95. No requirement asked for the improvement, so it is recorded here
   rather than claimed as a feature.

## Revisit if

A future requirement genuinely re-introduces a run this application does not own — a remote or
shared-host execution model, say. That is a product change, not an architecture change, and it would
need a channel of its own; **it would not be served by reinstating this record.** The analysis in
alternative B would be the first thing to re-read, because its finding about watchers and atomic
renames is about the filesystem rather than about this product.

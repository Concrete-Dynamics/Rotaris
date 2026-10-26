# ADR-0058 — The workspace store: machine-local, found by a workspace identifier, and how it is backed up — Durability, and what it costs

Part 9 of 22 of [ADR-0058](../0058-the-workspace-database.md), which indexes every part.

### Durability, and what it costs

Two classes, because one setting cannot serve both a twenty-per-second publish path and a terminal-status
guarantee.

**Ordinary commits run at `synchronous = NORMAL`.** In WAL mode a commit at `NORMAL` writes the transaction
to the write-ahead log without an `fsync`; it survives a process crash, because the frame is in the log and
in the operating system's page cache, and it is immediately visible to any other process that opens the
store. It does not survive a power loss or an operating-system crash. That is exactly enough for
`REQ-MONITOR-221`, whose stated reason is that a view must not display what a resume would not restore — and
a resume reads this same store, in this or a later process — and for `REQ-SESSION-060`'s repair correction,
which must survive "the process dying again at once".

**`synchronous = FULL` is forced for two writes**, both named by the specification: a save carrying a
**terminal status** (`REQ-SESSION-070`), and an **explicit flush** (`REQ-SESSION-068`, `REQ-SESSION-072`,
including `REQ-SESSION-060`'s repair flush). The pragma is raised for the transaction and lowered after it.
Both are rare per session, so the `fsync` cost lands where a user is already waiting for a run to finish and
never on the row-publish path.

**The ground for forcing it is corrected, and the decision is unchanged.** This record justified `FULL` on
the terminal save partly by `REQ-SESSION-070`'s clause that such a save "MUST NOT return before that status
can be read back by any other reader of the store". **That justification was tested and it is false.** A
terminal status committed at the ordinary `synchronous = NORMAL` setting, by a process that then kept its
connection open and did not checkpoint, was read back immediately by a **separate operating-system process
using a different SQLite binding**, opening the store read-only. A committed write-ahead-log frame is
visible to any other opener at once — which is the same reasoning this record already gives, correctly, two
paragraphs later for `REQ-EVENTS-029`. **The readability clause does not need `FULL`, and never did.**

**Why the decision stands anyway, on the ground that actually holds.** `FULL` buys the terminal save
survival of a **power loss or an operating-system crash** — the one property `NORMAL` in write-ahead
logging explicitly does not have, and which this record's own paragraph above names. The terminal status is
exactly the record a user is told they can rely on, and the measured price is **812.1 µs at p50 and
1,434.4 µs at p95, once per terminal save** (829.8 / 1,372.4 µs with the pragma raised and lowered around
the transaction, so the raise-and-lower shape this record specifies is free — the pragma itself measures
2.1–2.2 µs and the device's `fsync` is ~560 µs at p50, which is the whole bill).

**This correction is the reason the paragraph exists rather than a footnote.** Someone optimising later
will test the *stated* ground, find that `NORMAL` satisfies it, and drop `FULL` — and will be right about
the reason and wrong about the decision. Re-grounding it on power-loss durability is what stops that.

**The ground now has an instrument and awaits its measurement (2026-09-04, `spikes/power-loss.md`).** A writer
commits at the publish path's setting with every fiftieth commit through the raise-and-lower shape above; a
process death — ten of ten — lost nothing at `NORMAL`, which is the property this paragraph claims for it, and
the verifier's dry run (a truncated WAL tail) shows the loss it is built to see. **What decides this paragraph
is the fault half, which only the owner can inject**: a returned `FULL` commit absent after a real cut would
mean the device does not honour a flush and the ~560 µs per terminal save buys nothing on that hardware —
reopened for the owner, not repaired here. Until the report's table is filled, the ground is stated, not
measured, and this paragraph should be read that way.

**`REQ-EVENTS-029` is honoured, not weakened.** One event, one commit, before the event is observable on any
channel; `NORMAL` in WAL keeps that true against the failure the requirement names — a run killed, a crash,
a force-quit — because a committed WAL frame is recovered on the next open. The requirement's own reason is a
readability property ("the durable record REQ-EVENTS-072 binds the event to is already written and readable
the moment the event can be observed"), and a committed WAL frame is readable by any other opener at once.

**One carve-out is carried across intact and must not be re-broadened.** Persist-before-publish binds
*changes*, and `REQ-MONITOR-219`'s 50 ms intra-row growth ticks are not changes with an event of their own:
`REQ-EVENTS-052` gives a row exactly two events and "none for any state in between". A growth tick therefore
publishes a row whose final form has not yet been recorded, deliberately. Cheap commits are not a reason to
start committing per tick, and per-token or per-tick commits are forbidden for the same reason
`REQ-MONITOR-219` forbids per-token publication.

**The cost, measured. This record's open item — "the commit is not yet measured on this path and the record
should not pretend otherwise" — is closed.** The publish path pays one write-ahead-log append and no
`fsync` per commit; at `REQ-MONITOR-219`'s coalescing tick that is at most twenty commits per second per
live session, plus one immediate commit per newly appearing row under `REQ-MONITOR-218`. The teardown path
pays one `fsync` per terminal status and per explicit flush, which must sit inside `REQ-MONITOR-255`'s quit
choreography rather than after it.

| What | Measured |
|---|---|
| One publish-path commit — a transcript row, its event and the aggregate update, in one `IMMEDIATE` transaction at `NORMAL` | p50 **185.4 µs**, p95 **362.8 µs** at zero pre-existing rows; p50 182.2 µs, p95 329.0 µs at 10,000 |
| Commit **then** publish, run host → main → renderer, end to end | p95 **1.774 ms** at zero rows, **1.723 ms** at 10,000 — 141× and 145× inside `REQ-MONITOR-222`'s 250 ms |
| `REQ-MONITOR-223`'s growth ratio, 10,000 rows against none, end to end | **0.971** against a ceiling of 2. The store contributes no growth term |
| Publications exceeding 250 ms | **0 of 20,000.** The two samples over 100 ms were transport excursions, not store |
| Share of `REQ-MONITOR-222`'s budget | commit alone **0.28 %** at p95; the whole end-to-end interval **0.71 %** |
| The commit's share of the end-to-end interval | **39 %** on the relay path, **54 %** on a direct port |
| `NORMAL` against `OFF` | indistinguishable — 185.4 vs 177.5 µs p50 — which is the evidence that `NORMAL` is genuinely paying no `fsync` per commit |

Two readings follow, and the second is the one that matters. **The margin this record has been quoting
falls from ~221× to ~141× and survives with two orders of magnitude to spare, so nothing reopens.** But the
commit is now the **largest single component** of the interval on a direct port and roughly the whole of
the transport on the relay path, so anyone reopening ADR-0002's direct-port remedy on latency grounds must
compare 1.774 ms against 1.257 ms and not the old transport-only 1.133 against 0.583: the port still wins
and now removes 29 % of the interval rather than 49 %, because the commit is not removable by changing
transport.

**Checkpointing is not a smooth background cost, and it must be stated as two numbers because a p95 hides
it entirely.** WAL checkpointing is left on SQLite's automatic schedule — confirmed as the right choice
below — and the automatic checkpoint puts a large commit into the publish path on a fixed period:

> **About 0.73 % of commits — one in every 136 — cost 9–11 ms at p50, with a worst observation of 53 ms.
> The other 99.27 % cost 179–220 µs at p50 and 301–386 µs at p95.**

The period is arithmetic rather than luck: the publish-path transaction writes a measured **7.44
write-ahead-log frames**, against the default `wal_autocheckpoint = 1000`, giving 134.4 — and the observed
period was 135–136 commits in every run. **That is a design input, not an implementation detail.** Any
later decision that widens the publish-path transaction — a second index on the transcript table, a wider
`UPDATE`, a blob — shortens the period proportionally and the tail follows. At `REQ-MONITOR-219`'s ceiling
of twenty publications per second a checkpoint lands every 6.8 s. None of this threatens 250 ms; what it
does mean is that any conformance test or diagnostic threshold built on "an update takes about a
millisecond" will see routine excursions of ten times that, deterministically, and must not treat them as
faults.

**Leaving the automatic schedule alone is confirmed by the alternative being measured.** Disabling
`wal_autocheckpoint` removes the periodic spike and buys nothing: the ordinary commit gets **31 % slower at
p50 and 87 % slower at p95** because every commit searches a log that never resets, the log grew to **91 MB
in 3,000 commits**, and the deferred work reappears as a single **155 ms** stall the moment anything
checkpoints. Do not make it configurable and do not turn it off.

**Two of this record's smaller claims about cost, checked.** "At `REQ-MONITOR-219`'s coalescing tick, at
most twenty commits per second per live session" puts the store at **0.37 % duty at p50**; even the ≈64
publications per second the harness actually ran reached 1.2 %. The publish path is nowhere near the
store's capacity, which means the carve-out below forbidding per-tick commits is protecting the *transport*
and not the store, and should be argued on that ground. And the named fallback binding **B** was
cross-checked on the same schema and rows and is not slower — slightly faster on these samples — so
alternative B's swap costs nothing in commit latency, only the durability-default difference noted under
alternative A.

### The whole-store backup (`REQ-SESSION-201`)

**What the artifact is.** One file at a destination the user chose through the platform's save dialog
(`REQ-SESSION-189`: no implicit destination, nothing written until a destination is chosen), holding
exactly three things:

```
manifest                     artifact format version; the workspace identifier (REQ-SESSION-197);
                             the UTC instant of the snapshot; the store's user_version; session,
                             artifact and body counts; the last-seen workspace path as a human label
                             only; and any referenced body that was not present on disk
store.db                     the VACUUM INTO snapshot
sessions/<session-id>/…      the per-session files of REQ-SESSION-002 for the sessions store.db holds
```

It is an ordinary archive container, and that a stock archiver can open it is a **free property, not a
feature**. `REQ-SESSION-201` forbids the backup being offered as a way to read a record; the product
therefore ships no reader for it, no listing of its contents, and no extraction action. Reading is what an
export is for, and ESC-20 fixes which records get one.

**Taken in one order, and the order is what makes it consistent.**

1. The save dialog first, from main (ADR-0002 consequence 7). Work begins only after a destination exists,
   and everything is written to a sibling temporary of that destination and renamed onto it at the end, so
   a cancelled or failed backup leaves nothing at the path the user chose.
2. `VACUUM INTO` the staging file, in the workspace service, off any write transaction.
3. **From the snapshot**, enumerate the sessions it holds and exactly the artifact, attachment and image
   bodies its rows reference. The snapshot is the authority for what the artifact contains.
4. Copy those bodies and those sessions' logs and summaries. A file on disk the snapshot does not
   reference is **not** copied. A body the snapshot references that is not on disk is recorded in the
   manifest as absent rather than failing the backup — `REQ-SESSION-002` already forbids a reader assuming
   a per-session file is present, and failing a whole backup over one missing body would be its own defect.
5. Seal and rename onto the destination.

**Why that order and not the other.** Files first, then the snapshot, would let the snapshot name a body
written after the file copy — a record pointing at something the artifact does not hold. Snapshot first,
filtered by reference, gives the artifact exactly the snapshot's own closure: every row's body present or
declared absent, and nothing extra. `REQ-SESSION-201` requires the *store* to be a single-instant state and
requires the per-session files to be carried, but does not say how to make the second consistent with the
first; this is that answer, and it is the reason the enumeration reads the snapshot rather than the store.

**The one thing that cannot be point-in-time, stated rather than glossed.** The session log
(`REQ-SESSION-142`) is an append-only file a live run is writing. What the artifact holds is a **prefix**
of it, truncated at the last complete line. That is the honest outcome and the right trade: a log is a
diagnostic a person opens, not a record, `REQ-SESSION-002` tells a reader not to assume it exists at all,
and no requirement makes a log's completeness a property of anything. The summary (`REQ-SESSION-140`) is
unaffected, being replaced whole under `REQ-SESSION-033`, so a copy catches the old one or the new one.

**What is not in it.** `REQ-SESSION-201`: "It MUST NOT reach outside that store." So: not the repository;
not `.rotaris/`'s configuration, personas or model slots; not the requirement documents, baselines,
generated artifact or retired-identifier log; not provider credentials; not the global configuration, the
discovery snapshot or desktop preferences; not checkpoint refs, which are objects in the user's own
repository. **And not the workspace identifier *file*.** The artifact carries the identifier's **value**,
which the requirement demands of it, and not the file, which is the workspace's own material. That
distinction is thin and it is load-bearing for the restore below, so it is stated here — the restore's one
write outside the store is then visibly an exception with a reason, rather than a drift nobody noticed.

**Where it is offered, and this one is not owed.** `REQ-SESSION-182` already places both actions — "the
whole-store backup and restore of `REQ-SESSION-201`, which are workspace-scoped rather than per-session" —
on the session-management surface, alongside repair, delete and the exports, and requires
`REQ-SESSION-200`'s disclosure to be reachable from the same place. So unlike the reclamation surface this
record has to ask for (OQ-48), the backup needs no new surface and no amendment: the requirement put it
where a user already goes to manage sessions, which is also where they will be standing when they wonder
what a workspace backup does and does not carry.

**Where it runs and what it costs.** The workspace service, which is the only process that resolves an
identifier and opens the store; main contributes the dialog and nothing else. `VACUUM INTO` holds a read
transaction for the duration, which under write-ahead logging neither blocks the run host's writes nor is
blocked by them — that is what makes it legal while runs are live — **but it pins the log**: the
write-ahead log cannot be checkpointed past the snapshot's start, so it grows by everything committed
during the copy and is checkpointed after. The action is therefore O(store) in time, in destination space,
and in transient log growth.

**None of that is measured, and the field gives a reason to care.** A second workflow's measurements are
not available to this record. What is available is ESC-19's survey, which records one comparable product's
session logs reaching 700 MB to 2 GB in a filed issue — and ESC-9 left this product's retention unbounded,
so a multi-gigabyte store is a state this design permits. Whether the copy needs progress reporting, and
whether the log growth needs a mid-copy checkpoint strategy, both turn on a number nobody has. Cancellation
is safe by construction whether or not a control is offered — the read transaction rolls back, the staging
file is deleted, and the destination was never touched — so offering one is a later choice and not a
design change.

**It is not a channel, and the prohibitions are worth listing because each is a feature somebody will
propose.** No schedule, no timer, no watcher, no backup on quit, no automatic backup before a migration or
before a restore. Nothing enumerates, indexes or searches for artifacts. The product never looks for one.
`REQ-SESSION-201` and `REQ-SESSION-071`. The pre-migration copy is a different object with a different
lifetime and is not this artifact.

**The product must say what the file contains, and where it says it matters.** `REQ-SESSION-201`'s closing
clause: because the artifact is the store whole, it necessarily carries records that deliberately have no
export because they hold unredacted user and tool content — `REQ-SESSION-136`'s tool-call arguments above
all, which ESC-20 rules must never gain an export under any later widening. The artifact is not a widening
of that boundary, because it is not readable material handed to other software; but the user must be told
it carries the store in full. **That statement belongs beside the save dialog**, because the decision it
informs is *where the file goes*: this is the one file the product hands the user to put wherever they
like, including a synchronised folder the product elsewhere warns them about (`REQ-STARTUP-166`), and a
user who does that has replicated unredacted tool arguments to another machine. Putting the disclosure in
a help page would be putting it where the decision is not being made.

**Encryption is not applied.** Considered and refused: a passphrase would protect the copy while the store
it was copied from sits unprotected on the same machine, so it defends the wrong artifact; and a forgotten
passphrase converts a user's only durable copy of their history into nothing, which is the failure mode
this whole action exists to prevent. `REQ-SESSION-201` asks for disclosure, not protection. If protection
is later wanted, the place for it is the store *and* the artifact, and it is a different decision.

### The restore, and the identifier question that is the sharp edge

**Three gates first, all read-only, none of them touching the target.** `REQ-SESSION-201`: "A restore that
fails for any reason MUST leave the store exactly as it was — there is no partly restored store, and no
reader may observe one." That is met by doing every check before the first mutation, not by unwinding one.

1. **The artifact opens and passes `quick_check`.** Its snapshot is opened read-only and checked before the
   target is touched at all. Restoring a corrupt artifact over a healthy store is the worst outcome
   reachable on this path and it is the one gate that must never be skipped for speed.
2. **The artifact's `user_version` is not newer than this build supports.** Refused for the same reason the
   ordinary open refuses such a store: this build does not migrate downward, does not guess which columns it
   still understands, and writes nothing. Checking it here rather than at the next open is the difference
   between a refusal and a workspace that will not open *after* a restore. An **older** version is not a
   refusal — the restored store migrates at its next open, taking the pre-migration copy the migration path
   already takes.
3. **No session in the target store is live.** Required by `REQ-SESSION-201`, on the same reasoning
   `REQ-SESSION-164` gives for refusing a checkpoint restore on a session that claims to be running.
   Liveness is `REQ-SESSION-056` through ADR-0005's single predicate; a second implementation here is the
   `REQ-SESSION-171` defect.

**Gate 3 has a position as well as a predicate, and it was the position that was wrong. Corrected
2026-09-02, and the correction cost a live session to find.** The predicate is right and is unchanged:
measured 30 of 30, it refuses a lock naming this machine whose pid is alive, refuses a lock naming another
machine, and admits a lock this machine can prove dead. What the record had wrong is *where* it ran. As
written, gate 3 was evaluated here, in the read-only phase, and the run host was told to refuse runs only
afterwards, as part of the close request. **Measured: a run launched in the window between the two was
admitted, took the lock, began writing at `REQ-MONITOR-219`'s twenty rows a second, was asked to close
mid-write, complied — and had its session and every row it had written destroyed by the swap.** Nothing
re-checked. That is the state ADR-0002 consequence 11's own closing sentence says cannot arise — "the run
host is never asked to give up a store it is actively writing" — and it is exactly what `REQ-SESSION-201`
forbids.

**So this evaluation is kept and demoted, and the evaluations the swap relies on move into the swap.** It is
kept because it is cheap — 3.1 to 3.8 ms measured at every store size, against gate 1's 52 ms to 1.2 s — and
because refusing here means a restore that cannot proceed is refused before a user is asked to confirm
anything, and before the identifier question below is put to them. It is demoted because **a gate evaluated
while launches are still being admitted is a statement about the past**, and by the time anything moves it
has expired. It must never be cited as the check that makes the swap safe. Steps 1, 2 and 4 of the swap
below carry that, and the reason each of them sits where it does is written there.

**Then the identifier. Three cases, decided by what the workspace carries and never by what the artifact
would prefer.**

**(a) The open workspace carries the artifact's identifier.** The ordinary case — a restore onto the
machine the backup came from, or onto one that already holds that workspace. Straight to the target-store
question.

**(b) The workspace carries no identifier file at all.** This is the disaster-recovery case, and it is why
`REQ-SESSION-201` makes the artifact name its workspace. A machine died; the user has a new one; they clone
the repository, and `.rotaris/` is gitignored by default (`REQ-CONFIG-013`, `REQ-CONFIG-010`) so no
identifier arrives with it; they hold a backup. **The restore establishes the workspace's identifier from
the artifact, by the same exclusive create this record mints with.**

That is consistent with `REQ-SESSION-197` rather than an exception to it. The requirement forbids minting a
*replacement* over an identifier the product can read, and forbids an existing identifier *changing*. Here
there is nothing to replace and nothing changes. Nor is the value arbitrary: it is the identity the
restored sessions were recorded under, so the operation prevents the orphaning the requirement names rather
than causing it. Two guards keep it narrow. An identifier file that is **present but unreadable is not this
case** — `REQ-SESSION-197` requires that be reported as a condition to be resolved rather than overwritten,
so the restore refuses and says so. And the write is an exclusive create, so a file appearing between the
check and the write wins and the restore falls through to case (c).

**The restore writes outside the store in exactly two places — here, and case (c)'s confirmed
establishment — and the record states the reading it is taking rather than assuming it is obvious.**
`REQ-SESSION-201`'s "MUST NOT reach outside that store" is a clause about what the **backup** covers; the
restore's obligations are stated separately in the same requirement and none of them forbids this. If the
product owner reads that clause as binding the restore as well, the conservative alternative is available
and costs one thing: case (b) collapses into case (c), where ESC-26 now supplies a confirmed action, so the
recovery path no longer ends in a text editor either way. **Recorded as reversible. The argument for
writing it here without a confirmation is that case (b) replaces nothing — there is no value to detach, so
there is nothing for a user to confirm the loss of, and a confirmation that states no consequence is
ceremony.**

**(c) The workspace carries a different, readable identifier. Rewritten 2026-09-02 against ESC-26, which
answers the escalation the previous version of this section raised.** The previous version left the user
with "close the workspace, replace the identifier file by hand, and reopen", because `REQ-SESSION-197`
forbade the only action that would help. **ESC-26 grants that requirement one narrow exception — a restore
MAY establish the workspace identifier when the user explicitly confirms it, and no other action ever may
— so case (c) now has a product action.** `REQ-SESSION-201` still requires the case be "reported as what
it is rather than performed silently"; establishing on confirmation is the opposite of silently.

The product reports the condition and offers three outcomes, with **cancel as the default**. Nothing is
preselected and nothing happens on a keystroke.

1. **Cancel.** Unchanged, and it stays the default because two of the three outcomes are hard to undo and
   the third is a no-op.
2. **Restore into the artifact's own store**, which is a real store on this machine that the open
   workspace will not resolve to. Unchanged, and still not useless: the history exists and a workspace
   carrying that identifier finds it. The product must say plainly that the restored sessions will not
   appear in the workspace that is open.
3. **Establish the artifact's identifier for this workspace, and restore.** New, per ESC-26. This is the
   only path in the product that writes an identifier over one it can read.

**What outcome 3 shows before it is confirmed, because the shape of the confirmation is what makes the
exception safe.** All of it, in one place, before anything is written:

- **Both identifier values, named as such** — the one the artifact carries and the one this workspace
  currently carries. ESC-26 requires both to be named. They are the only things a user can act on, and a
  user who later wants to undo the operation needs the second value written down.
- **That this workspace's existing sessions become unreachable from this workspace.** In the requirement's
  own vocabulary: they are recorded under the identifier being replaced, and after the operation this
  workspace resolves to a different store. How many sessions that is, counted from the store this machine
  holds for the current identifier.
- **That nothing is deleted, and where everything goes.** The store recorded under the current identifier
  is **not** touched, not renamed and not removed; it is simply no longer referenced, and it appears on the
  reclamation surface as a store nothing points at (consequence 5). **This makes outcome 3 reversible by
  hand:** restoring the previous value to the identifier file re-resolves the workspace to that store, with
  its sessions intact. That reversibility is what the confirmation is buying, and the product should say
  so.
- **The ordinary pre-restore summary as well**, which case (a) already requires: when the artifact was
  taken, how many sessions it holds, how many the target store holds, that a target store already present
  for the artifact's identifier is set aside rather than deleted and where it goes, and how many sessions
  will arrive needing repair.

**The write itself, and why it is a different write from case (b)'s.** Case (b) mints by exclusive create
and replaces nothing. Case (c) replaces a file that exists, so it goes through ADR-0004's replace shape —
staged in `.rotaris/` itself, `fsync`ed, renamed over the target — and it is the only replace of that file
in the product. It happens **after** the three read-only gates pass and **before** the store swap, so a
failure to write it aborts the restore with nothing moved; if the file cannot be replaced, the restore is
refused and reports which file it could not write, leaving the workspace exactly as it was.

**Two guards that are not consequences of the ruling but of the requirement it excepts, and both survive
intact.** A present-but-**unreadable** identifier is not case (c) at all — `REQ-SESSION-197` requires that
reported as a condition to be resolved rather than overwritten, and outcome 3 is not offered for it,
because the product cannot name the value it would be detaching and the confirmation would therefore be
uninformed. And the exception is confined to the identity write: it does not license the restore to touch
anything else in `.rotaris/`.

**Status of the amendment, stated so a reader does not mistake authority for text.** ESC-26 is a ruling and
authorises the amendment; `REQ-SESSION-197` as it stands still says the product "MUST NOT mint a
replacement over an identifier it can read", with no exception. The amendment is owed. Until it lands,
outcome 3 is authorised by the ruling and not yet by the requirement, and an implementation that shipped it
against the unamended text would be non-conformant to the letter of a requirement the owner has already
excepted. This record builds it because the ruling is the authority; the specification pass must catch up.

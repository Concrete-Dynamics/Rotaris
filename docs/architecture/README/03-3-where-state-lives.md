# Rotaris-crw — system architecture — 3. Where state lives

Part 3 of 13 of [the architecture README](../README.md), which indexes every part.

## 3. Where state lives

**A file when a human or another tool is meant to read or edit it, or when version control must track it.
A store record when only the application reads it and it is high-volume, queried, or transactional.**

That is SR-4's principle, and it is stated as a principle rather than as a table because the table cannot
list everything and a reader has to be able to place something nobody listed. It replaces this record's
previous verdict — *files are the system of record; there is no database anywhere in the product* — which
four slices reached independently and which is preserved in ADR-0003 as the alternative it now is, with
all five of its objections, because a reader must be able to see why the record changed its mind.

**The specification did not adopt the mechanism; it adopted the observables.** This is the single most
important thing to understand about the amendment pass, and it is easy to read past. No live requirement
anywhere names a database, a table, an index, a query or a schema migration. What the requirements now
name is a **store** and what must be true of it: one workspace plus one session id resolves one record
(`REQ-SESSION-001`); a save is all-or-nothing (`REQ-SESSION-028`); a reader may not delay the writer
(`REQ-EVENTS-098`); a listing's cost grows with the number of sessions "and with nothing else"
(`REQ-SESSION-042`); the store is machine-local (`REQ-SESSION-198`). Engine, schema and indexes are
therefore architecture's to choose and architecture's to be wrong about — and `REQ-MONITOR-299`, which
this record once called "a conformance-test methodology encoded as a product requirement, a fossil", now
says so itself: it compares record **kinds**, not directory entries. Constraint D-22 records the
re-derivation.

### The store is machine-local, and it is found by an identifier rather than by a path

**This reverses what a previous pass wrote here**, and the reversal is a ruling (ESC-15) rather than a
preference. The store does **not** live at `<workspace>/.rotaris/workspace.db`. It lives in the machine's
own per-user **local** data directories for `rotaris` (`REQ-STARTUP-145`), at
`workspaces/<identifier>/workspace.db`, with the closed set of per-session files `REQ-SESSION-002` fixes
— the log, the human-readable summary, and artifact, attachment and image **bodies** — under
`sessions/<session-id>/` beside it, because `REQ-SESSION-198` requires them held *with* the store so that
one session's record is never split across storage a synchronising client reaches and storage it does not.

**Why, and it is not performance — and the reason this record gave for two passes was tested and is
false.** The record said: write-ahead logging is unsupported on network filesystems, so a store inside a
workspace on a share opens **read-only**; acquiring a session lock is a write (`REQ-SESSION-046`); so
`REQ-SESSION-089` refuses the run and no session in that workspace can start at all.
`spikes/remote-and-synchronised-storage.md` measured that chain link by link. **Link 1 is false as
stated**: write-ahead logging enabled and worked over a UNC path in 320 process-trials — 0 open failures,
0 write errors, 0 rows lost, integrity check clean throughout, the shared-memory companion created at its
expected size — while failing 30 times out of 30 on a **mapped drive letter to the same share**. The
behaviour depends on the *path spelling*, which no version of this record considered. **Link 2 was never
observed at all**: the store reported itself writable in every network configuration measured, and the
state the record was describing does not exist — the genuine no-shared-memory condition opens
**read-write** and then fails **reads as well as writes**, which is larger than read-only, not smaller.

**The conclusion is unchanged and now rests on three measured failures, every one of them worse than the
one it used to rest on.** (1) Where one store file is reached through **two path spellings**, two writers
each reported full success while up to **95 % of committed rows vanished** — 20 of 20 trials wrong, final
counts as low as 32 against an expected 600, **integrity check clean on every one**. (2) A store can
report the log enabled, read the setting back as enabled, own its shared-memory companion at the right
size, report itself writable — and throw on the next statement, every time. (3) A synchronisation client
writing a replica back destroyed the store outright in 4 of 4 variants, unopenable, **while the writing
process reported zero errors across 43,120–58,273 commits**; overwriting only the log file was enough.
**A loud outage would have been the good version.** ESC-15's ruling is supported on stronger evidence than
the reasoning it was issued on — but `owner-decisions.md` still carries the disproved chain in ESC-15's own
text, so **cite ADR-0058's per-link verdict table rather than the ruling's mechanism** (section 6).

`REQ-SESSION-198` requires the opposite outcome in terms: a workspace on a network share or in a
synchronising folder **MUST be fully usable**, and it is, because the store is not there. The old
decision is preserved in ADR-0058 as alternative J with its whole case intact — self-contained
workspace, no indirection, nothing to reclaim — and consequence 3 is marked **withdrawn and not to be
cited**.

**One same-machine hazard follows from the same measurement and it is a correctness rule, not a
performance one.** The two-spellings failure needs no network at all: two processes reaching one store by
two different spellings of one path silently destroy each other's writes, and nothing detects it, because
there is no error and the integrity check passes on a store that is merely short. The architecture already
prevents it — the workspace service is the only process that resolves an identifier and it hands the
**resolved store path** to the run host (constraint W-18) — but it prevented it by accident until this
pass. **ADR-0058 now states it as intent and constraint W-27 carries it**: one store, one canonical path
spelling, resolved once and handed on, and no other process derives a store path.

**The identifier is the only thing binding a workspace to its sessions**, which is why
`REQ-SESSION-197` is written as absolutely as it is. ADR-0058 fixes its form — `v1-` followed by 32
lowercase hex characters carrying 128 bits of randomness, matching `^v1-[0-9a-f]{32}$`, in one commented
file in `<workspace>/.rotaris/`, read as the first non-blank non-comment line — because the requirement
fixes the identifier's properties and consequences but not its shape, and the shape is load-bearing: it
becomes a directory name on three filesystems, two of them case-insensitive. It is minted by **exclusive
create**, once, and never rewritten; a create that finds the file present reads it and is not an error.

| It must survive | It must **not** survive |
|---|---|
| moving and renaming the workspace folder | a fresh clone — the product's own **best-effort** ignore rule keeps `.rotaris/` out of version control (`REQ-CONFIG-013`, `REQ-CONFIG-456`), so a clone mints its own and starts empty |
| copying the folder, and carriage through a synchronising client | |
| a second machine — two stores, one per machine, **intended** (`REQ-SESSION-197`, `REQ-SESSION-198`) | |
| a different version of this product | |

**One edge of that table is softer than it looks and is worth naming.** `REQ-CONFIG-013`'s ignore rule is
**best-effort**, and `REQ-CONFIG-477` ground 3 says *deciding otherwise* is deliberately the user's
choice. A user who commits `.rotaris/` therefore ships the identifier with their repository, and every
clone of it presents the same identifier — which on one machine is the concurrent-duplicate case below,
and on another machine is simply an empty store, exactly as a second machine is meant to be. Neither is a
new failure; both are consequences the table already licenses, and neither is stated anywhere in the
specification.

An identifier the product cannot read is reported as a condition on `REQ-SESSION-089`'s terms — the
workspace opens, there is no store, there are no sessions and no runs — naming why the product will not
replace it. **That remedy is still the user's, and it is now the only one that is.**

**The absolute rule has exactly one exception, and it is worth reading before assuming either too much or
too little of it.** This section previously said `REQ-SESSION-197` forbids re-minting over a readable
identifier "absolutely, with no user-confirmed exception". **That sentence is withdrawn.** ESC-26 was
ruled on 2026-09-01 and the amendment has landed: **the restore of `REQ-SESSION-201` MAY establish this
workspace's identifier as the artifact's, and no other action ever may.** Five conditions bind it and it
is unavailable unless every one holds — it exists **only** inside the restore action, and the requirement
names the paths that do *not* gain it (opening or preparing a workspace, `REQ-SESSION-060`'s explicit
repair, a migration, an update, a later convenience); it requires **explicit confirmation naming both
identifiers** and stating that this workspace's own sessions become unreachable from it, never automatic,
never the default or pre-selected, with report-and-do-nothing kept as a correct outcome; the
**absent**-identifier case is unchanged and explicitly *not* this exception, being a create that replaces
nothing and orphans nothing; a present-but-**unreadable** identifier is still reported and never
overwritten, by this action as by every other; and the **displaced store is moved aside and kept**, never
deleted, with the confirmation saying where it went. ADR-0058 additionally makes outcome 3 reversible by
hand and says so in the confirmation — the store recorded under the workspace's existing identifier is
left untouched and merely unreferenced, so restoring the old value to the identifier file is a complete
undo.

**The exception does not reach the copied-folder case and must not be widened to it.** A user who copies a
workspace folder and wants the copy to have an identity of its own still has no product action, and that
half of **OQ-47** stays open *(ruled 2026-10-06, [R-071](../../product/requests.md#r-071): ADR-0058's behaviour
ratified, the hand edit accepted for the first release)*. The requirement states why the exception is drawn
this narrowly: the rule protects against a folder moved, renamed, copied or merely spelled differently,
which is constant, while the recovery arises once in a workspace's life if it arises at all — so relaxing it
generally would trade a constant protection for a rare recovery. **An implementation that finds this
exception useful anywhere else has drawn the wrong lesson from it.**

Two further decisions ADR-0058 takes here are **architecture-invented behaviour on specification
silence**, and both are flagged for ratification rather than presented as settled. Two concurrently open
workspaces presenting one identifier: the identifier is claimed once per instance, and the second opens
**without a store**, reporting the condition in `REQ-SESSION-089`'s vocabulary. Sequentially — open one,
close, open the other — **nothing** may happen, because that case is indistinguishable from a move and
any detection there would break `REQ-SESSION-197`. The hazard being avoided is not corruption: it is a
resume in one window starting an agent that writes files into the folder the user does not have open
(`REQ-SESSION-014`'s `workspace_root`). See **OQ-47**. And reclaiming a store whose workspace no longer
exists is **user-initiated only**, from a surface listing this machine's stores with last-seen paths,
size, session count and last-open time, offering the exports first. Automatic reclamation is **refused**:
the only available signal is a last-seen path that no longer resolves, and a path stops resolving when a
drive is unmounted, when a share is down, and above all **when the folder has been moved** — precisely
the case the identifier exists to survive. See **OQ-48**. `origin.txt` records last-seen paths for
diagnostics and reclamation and **must not be consulted to resolve a store**, stated so that
path-as-identity cannot re-enter by the back door.

### The cost of that location is now owned, by two requirements and one action

**This reverses what a previous pass wrote here, and the reversal is the largest single change in this
record since the store moved.** That pass said a user's session history, permission audit, improvement
library and artifact bodies live outside anything they back up when they back up their project "**and the
specification does not tell them**", that SR-9(b)'s requirement was "**not in the specification**", and
that this was a gate item. **All three sentences are withdrawn and must not be cited.** ESC-19 ruled the
disclosure *and* half of the structural option, and both have landed.

**`REQ-SESSION-200` is the disclosure**, and it is more than a warning. It names what sits outside a
workspace backup — every session record the store holds, the workspace-scoped improvement library, and
`REQ-SESSION-002`'s per-session files. It requires what *is* carried to be named alongside it, "because
the statement is otherwise alarming rather than informative": the repository, the requirement documents,
the configuration, personas and model slots travel exactly as the user left them; the identifier travels
with the workspace, so a workspace moved, renamed or restored on this machine finds its own sessions
again; and checkpoints are objects in the user's own repository. It requires both remedies named, "since
naming a gap without naming its fix is not a disclosure". And it must be reachable in the ordinary course
of managing sessions and **must not be delivered only inside a failure message** — "a user who has
already restored a workspace and found no history in it has been told too late, which is the precise
failure this requirement exists to prevent."

**`REQ-SESSION-201` is the remedy**: one user-initiated action producing one artifact holding the whole
store plus its per-session files and nothing outside it, to a destination the user chooses, **valid while
runs are live** — it may not require a session to be stopped, may not pause, delay, throttle or disturb a
run, and may not be refused because a session is live — producing "a state of the store that a reader
could have observed at one moment"; and a second action that restores it, explicitly, never
automatically, never as a repair, never silently merging, refused while any session in the target is
live, and leaving the store exactly as it was where it fails. The artifact carries the workspace
identifier so it cannot be poured into the wrong workspace by accident. `REQ-SESSION-182` places both
actions, and the disclosure, on the surface where a workspace's sessions are managed.

**It is not an export and the specification insists on that in both directions.** An export is a record
rendered so software knowing nothing about this product can read it; a backup is the store rendered so
this product can put it back. Neither may be collapsed into the other, the backup may not be offered as a
way to read a record, and no export may be offered as a way to restore one. Nor is either a channel.

**One of the two things this used to not fix is fixed, one is half measured, and the split matters at the
gate.** This paragraph said the mechanism "has not been measured in any part" and that the recovery path
"ends in a manual file edit". **The second sentence is withdrawn — ESC-26 is ruled and landed** (above).
The first is now **half true and no longer a guess in either half**. The *backup* half is measured:
`spikes/remote-and-synchronised-storage.md` §7 established that a naive file copy of a live store is
unopenable **625 times in 627** (150/152 under write-ahead logging, **475/475** under a rollback journal —
the rollback case is worse, not better), while the engine-level snapshot ADR-0058 chose produced **8 valid
snapshots out of 8** during 108,525 concurrent commits, integrity-clean, checksum-clean and monotonic, at a
median **1,077 ms per 41 MB**. That is the mechanism `REQ-SESSION-201`'s "valid while runs are live" needs
and it now has a number. **It also records the trap**: the gentle version of that experiment — a realistic
20 commits per second against a small store — returns **0 bad copies in 40**, so the obvious test gives a
false all-clear and the choice would look arbitrary to anyone who ran it.

***The restore half has now been run (spike 22, `spikes/backup-restore-mechanism.md`, 2026-09-02), and the
sentence this paragraph used to carry — "the restore half is untouched and is still the single largest
unmeasured mechanism in the record" — is withdrawn.*** **What replaced it is worse than what it said. The
restore as ADR-0058 wrote it fails on this platform in 30 of 30 attempts.** Step 2 opened the expanded
staging store read-write, no step closed it, step 4 renamed that directory, and Windows refuses to rename a
directory holding an open handle; closing that connection first makes it succeed 30 of 30. **Two further
defects were measured and both destroy something.** The live-session gate is evaluated *before* the run host
is told to refuse runs and nothing re-checks, so a run launched in that window took the lock, began writing
at twenty rows a second, was asked to close mid-write, complied, **and had its session and all its rows
destroyed by the swap** — which is the state ADR-0002 consequence 11's own closing sentence says cannot
arise. And the reversal **fails in exactly the case it exists for**: where the install rename fails because
the target name is occupied, the reversal is a rename onto that same occupied name and fails identically,
leaving a store directory holding no database, the real store under a timestamped name, and the workspace
service throwing on re-open. All three are corrected — in ADR-0058, in an amended `REQ-SESSION-201`, and in
a new `REQ-SESSION-202` — and **eight further defects the spike found are not corrected**; they are
enumerated in the gate verdict in section 6. **What the measurement confirmed is as load-bearing as what it
broke** and is recorded there too, chiefly that ADR-0005's lock-row correction is vindicated against its own
counterfactual, that all three refusal gates behave including the older-schema case that must *not* refuse,
and that the one-rename installation was never observed mixed in 20 of 20 attempts. **Three inputs it needs
are still missing**: how far the write-ahead log grows while the snapshot's read transaction pins it on a
large store under a live run (the snapshot's *correctness* is settled; its *log growth* is not, and it is
the only input the mid-copy checkpoint and progress-reporting questions turn on); the two renames against
the destinations the user may actually choose — removable media, a directory open in another application,
and a real synchronisation client's tree, none of which any spike has written to; and what a restore killed
between the two renames leaves behind, with no process left to reverse anything.

**The configurable store location is refused**, not deferred. ESC-19 split SR-9(b)'s structural option
and found the halves have opposite evidence: no surveyed product offers a relocatable session *data*
store, and the `*_HOME` / `*_CONFIG_DIR` variables that come closest are flagged as a hazard precisely
because they silently relocate stores into synchronised folders — which hands the user ESC-15's total
outage. ADR-0058's alternative N moves from "not foreclosed" to "refused by ruling", and its
corresponding *Revisit if* is retired with the reason preserved.

### The table

| Where | What | Written by | Discipline |
|---|---|---|---|
| per-user **local** data dir → `workspaces/<identifier>/workspace.db` — **one store per workspace, per machine** | session records and listing records, transcript rows and released pages, the event history, the timeline, the issues record, evidence, the permission audit, the verification-gate record, the delegated-child ledger, the checkpoint index, the session **lock rows**, delivery records, the improvement library, saved prompts | **run host** (session-scoped rows, under that session's lock row) and **workspace service** (workspace-scoped rows); no other process opens it | one transaction per unit of work; write-ahead logging read back at open **and then exercised by a write probe**, because the read-back was measured necessary but **not sufficient** — a store can return the setting exactly as applied and throw on the next statement — and a failure at either step is a **fault**, not a degraded mode (`REQ-EVENTS-179`); one canonical path spelling, resolved once (W-27); migrations forward-only, in the workspace service, before the run host is told the workspace is open |
| `workspaces/<identifier>/sessions/<session-id>/` | `summary.md`, `debug.log`, artifact/attachment/image **bodies** — `REQ-SESSION-002`'s closed set of three kinds and nothing else | run host | atomic replace for `summary.md`, with `REQ-SESSION-033`'s ladder; append for the log, which nothing compacts; a revised artifact writes a **new** body and the row is re-pointed, so a body file is never replaced over itself |
| `<workspace>/.rotaris/` | **the workspace identifier**; `REQ-GIT-128`'s `integration.lock`; configuration, secrets, personas, model slots, worktree bindings | workspace service | exclusive create for the identifier and the integration lock, never replaced over themselves; atomic replace for the rest, per-store policy; comments and layout **preserved** — **ESC-2 has landed**: `REQ-CONFIG-252` now states preservation in terms, states it once for all four writers of `agents.yaml`, and records that "the earlier statement that comments and formatting are lost is withdrawn" |
| the user's own repository | requirement documents, the generated symbol artifact, baselines, the tombstone log | **workspace service**, under two named actions only, through **one I/O owner** | atomic replace; reading never writes; worker threads receive bytes and never open these paths |
| per-user configuration directory | `agents.yaml`, `models.yml`, `secrets.yaml`, the discovery snapshot | workspace service and main | atomic replace; an adjacent lock file **per target**, serialising read-modify-write inside this one instance; **reads take no lock** |
| per-user **data** directory (a different directory) | provider credentials, setup state | **main only** | atomic replace, **explicit protection applied and read back**, adjacent lock |
| per-user preference store | the closed key table — panes, drafts, theme, board view state | **main only** | typed registry; theme committed synchronously |

The last four rows are unchanged, and two of them are now **conformance surfaces rather than architecture
positions**. `REQ-CONFIG-477` and `REQ-TRACE-513` were minted in the amendment pass and each states the
file/row line as a *boundary* with four independently sufficient grounds: configuration must be held as
files and must not be moved into a store only this application can read, and the four traceability
artifacts stay plain files in the user's own repository. Moving either is therefore a **specification
amendment**, not a decision available here. Credentials cannot be rows for a different reason —
`REQ-PROVIDER-016` requires `0600` plus an explicit Windows access-control list with inheritance
disabled, read back, and requires that the credential not be written at all when the protection cannot be
applied, which is a filesystem guarantee no row makes. Desktop preferences cannot be rows for a simpler
one: the store is per **user** and must be resolved and read **before the first window exists**
(`REQ-SHELL-006`), while this store is per **workspace** and no workspace is open yet.

`REQ-TRACE-513` also closes ESC-14's correction with a requirement rather than an argument: because the
four artifacts never enter any store, no store's concurrency properties reach them, which is exactly why
**OQ-41 did not dissolve** and is narrowed by SR-1 instead.

### What a user can still read for themselves

`REQ-EVENTS-166` is now written as an export obligation and declares itself **the single definition of
what an export of a session record must guarantee**, for that document and every other, in two forms
(`REQ-EVENTS-172`, `REQ-EVENTS-132`) with three attached obligations. `REQ-EVENTS-090` follows it: a
single line feed terminates a record in any line-delimited **rendering**, and "a store that does not
separate its records by newlines does not violate it". `REQ-SESSION-199` extends the same guarantee to
the timeline, the issues record, the metrics document and the permission audit, and `REQ-SESSION-191`'s
reveal action now names all three actions explicitly. That discharges SR-6 and ESC-17.

Three things about that list are worth stating rather than discovering.

- **The audit's export must be checkable, not merely present.** `REQ-SESSION-199` requires a statement
  that entries were dropped "and how many"; ADR-0024 makes that statement arithmetic a reader can perform
  — each entry carries its ordinal, ordinals are never reused, and the export carries the cap in force,
  the cumulative dropped count and the oldest retained ordinal, so *oldest minus one equals dropped* and
  retained ordinals must be contiguous. An unfalsifiable statement is exactly the decorative export
  `REQ-EVENTS-166`'s third obligation names.
- **The tool-call evidence record must never gain an export.** `REQ-SESSION-136` deliberately holds
  **unredacted** arguments; the audit exports safely only because `REQ-TOOLS-079` gives an entry no
  argument values at all. Any future extension must not sweep it in.
- **The list is no longer drawn case by case; the boundary is stated once, as a test.** This bullet used
  to say SR-9(a)'s two exports were "**neither minted**" and that `REQ-TOOLS-190`'s verification-gate
  record was excluded by a positive readership sentence in its own text. **Both halves are withdrawn.**
  `REQ-LIBRARY-176` mints the improvement store's export and `REQ-TRACE-514` the delivery store's, each
  applying `REQ-EVENTS-166`'s guarantee "on the same terms `REQ-SESSION-199` applies it" to the four.
  `REQ-TOOLS-190` **gains** one, and the readership sentence is gone — replaced by the test ESC-20
  supplies, which that requirement now calls "the product's single statement of that test": **a record
  gains an export when it carries no unredacted user or tool content, and does not gain one when it
  does.** It adds, in terms, that "that only this application reads a record is *not* a reason to
  withhold an export and never was — a record only this application can read is exactly the record a user
  needs their own copy of." The permission audit qualifies for a stated property rather than by
  precedent: `REQ-TOOLS-079` gives an entry no argument values at all.
- **The one prohibition is absolute and the record now carries mechanisms rather than a rule.**
  `REQ-SESSION-136`'s tool-call evidence "MUST NEVER gain an export — not under this rule, and not under
  any later widening of it", and a future requirement proposing one "MUST be refused rather than
  reconciled". ADR-0024 makes that structural rather than declarative: write-path field validation,
  structural unreachability of the tool-call table from any exporter, no dereferencing of record
  locators, and four documents rather than one. **The accident to defend against is not someone exporting
  that record** — that is a refusal. It is someone adding an argument field to an **audit** entry for
  debugging, after which the audit's existing, blameless, already-shipped export becomes a disclosure
  surface with no change to any export code. `REQ-TOOLS-079` states that consequence itself; a validation
  that fails loudly is what turns its "would" into something a build notices.
- **The backup carries what the exports may not, and that is disclosed rather than hidden.**
  `REQ-SESSION-201`'s artifact is the store whole, so it necessarily carries the tool-call evidence. The
  requirement says so and obliges the product to convey it where the action is offered. That is not a
  widening — the artifact is not readable material handed to other software — but omitting it would leave
  the next reader to discover it and conclude the prohibition is porous, which is precisely the argument
  for widening one.

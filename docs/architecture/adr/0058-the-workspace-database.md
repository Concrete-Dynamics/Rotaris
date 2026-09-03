# ADR-0058 — The workspace store: machine-local, found by a workspace identifier, and how it is backed up

- **Status:** proposed
- **Date:** 2026-09-01
- **Supersedes:** its own earlier scope-and-location decision, *"one database per workspace, at
  `<workspace>/.rotaris/workspace.db`"*, recorded under this number on 2026-08-31 and reversed by ESC-15.
  The superseded argument is preserved below as alternative **J**.
- **Revised:** 2026-09-02, to build **ESC-19**'s whole-store backup and restore, to fold in the
  comparative evidence ESC-19 to ESC-21 were decided against, and to correct three statements this record
  made that the specification has since overtaken.
- **Revised again:** 2026-09-02, against two measurements — `../spikes/remote-and-synchronised-storage.md`
  and `../spikes/commit-on-the-publish-path.md` — and against **ESC-26**. **Every decision this record had
  taken survives. Four of the reasons it gave for them do not**, and each is corrected in place rather than
  quietly rewritten, because a decision resting on a falsified reason is a decision the next reader
  simplifies away. The four: that write-ahead logging is unsupported on network filesystems; that the store
  therefore opens read-only; that reading the journal-mode pragma back is a sufficient guard; and that the
  strongest durability setting is what makes a terminal status readable by another process. One new hazard
  is recorded that no version of this record considered — a store reached through two path spellings — and
  ESC-26's confirmed-establishment path is built.
- **Revised a third time:** 2026-09-02, against `../spikes/backup-restore-mechanism.md`, which ran the
  restore end to end for the first time. **Every decision the restore section takes survives. Three defects
  in its mechanism do not, and each is corrected in place below with the measurement that found it**, because
  all three are the kind a later simplification would put back. The three: the staging store was opened and
  no step closed it, so the install rename could not run at all (0 of 30); the live-session gate was
  evaluated before the run host was told to refuse runs and nothing re-checked, which destroyed a live
  session and every row it had written; and the reversal was a single rename onto a name whose occupancy is
  the commonest reason the step it reverses had just failed. Consequence 17 records what three such findings
  in a row imply about the parts of this record nobody has run.
- **Revised a fourth time:** 2026-09-02, against the three build-wrong defects spike 22 left open in this
  record. **D3** the unbounded close handshake: bounded at 2,000 ms with **expiry taking the abandonment
  path**, since an unanswered close is indistinguishable from a run host still writing, and step 1's refusal
  made a **lease the run host expires itself**, because the measured dual failure leaves no workspace service
  alive to release it. **D6** the displaced-store stamp: milliseconds, claimed by an exclusive create with a
  counter on collision — granularity is not uniqueness. **D7** the container layout becoming the store
  layout: the conversion is now a step rather than an assumption, and `origin.txt` is written by the restore,
  having been absent from every restored store. **None of the three corrections has been run**; that is IC-1
  in `../implementation-conditions.md`, and consequence 17 is why it exists.
- **Re-measured:** 2026-09-02, `../spikes/corrected-restore-rerun.md`, discharging **IC-1**. All three
  corrections above were run for the first time and **all five experiments pass, with every counterfactual
  reproducing the original defect**. Two wording refinements were owed and are applied in place: the
  aside-name's claim is the rename rather than a create, and the D6 correction's load-bearing half is the
  counter rather than the granularity. **The corrections are now measured rather than argued**; consequence
  17 stands unchanged, and its estimate now rests on three mechanisms rather than being tested by a fourth.
- **Authority:** `owner-decisions.md` SR-4 (the store), **ESC-15** (machine-local, keyed by a workspace
  identifier), ESC-16 (a store that will not open means no run), ESC-18, SR-9(b), **ESC-19** (the backup
  and restore action; the configurable store location refused), **ESC-20** (the export boundary is
  redaction safety), **ESC-26** (a restore may establish the workspace identifier on explicit
  confirmation, and no other path ever may). All decided, not proposed.
- **Evidence:** `../spikes/remote-and-synchronised-storage.md` (2026-09-02),
  `../spikes/commit-on-the-publish-path.md` (2026-09-02) and `../spikes/backup-restore-mechanism.md`
  (2026-09-02). Every figure quoted below is from one of those three and is a measurement; none is
  estimated.
- **Depends on:** ADR-0001, ADR-0002, ADR-0003
- **Constrains:** ADR-0004, ADR-0005, ADR-0008, ADR-0009, ADR-0024, ADR-0039, ADR-0041, ADR-0042, ADR-0046

## Context

ADR-0003 draws the line between a file and a row. This ADR decides the store on the row side of it: what
engine, **where**, located **how**, opened by which of ADR-0002's processes, with what durability, and —
the question the file design never had to answer — what happens to schema when it changes.

**What changed since the previous version of this record, and why.** The previous version put the store at
`<workspace>/.rotaris/workspace.db` and recorded, as consequence 3, that "a workspace on a network share or
in a cloud-sync folder is degraded, not merely slow". That consequence was correct and it was fatal. ESC-15
ruled that this is the single most likely way a real user meets an SR-4 regression, that a corporate user
may be in that position without knowing it, and that the store is therefore **machine-local and always**,
located by a stable identifier that travels with the workspace. This is not a preference; it is the removal
of a total failure.

**The ruling stands. The three-link chain this record printed under it has been measured and two of its
three links are false.** The argument was: write-ahead logging is unsupported on network filesystems → the
store therefore opens read-only → therefore no session can start. Link 1 is false as stated and link 2 was
never observed at all. The full correction is in alternative **J**, where the argument lives; what belongs
here is the shape of it, because a reader who takes the old chain to another decision will take a falsehood
with them.

- **Write-ahead logging worked over a UNC path**, in 320 process-trials, with zero open failures, zero
  write errors, zero rows lost and `integrity_check` clean throughout. It failed on a **mapped network
  drive letter to the same share, 30 of 30**. The behaviour depends on the **path spelling**, which no
  version of this record considered.
- **The store never opened read-only** in any measured network configuration. The real
  shared-memory-unavailable state opens **read-write** and then fails **reads as well as writes** — a
  larger failure than read-only, which by contrast reads perfectly and fails only writes.
- The conclusion holds anyway, and holds harder, by three worse failures than the one ESC-15 named. They
  are set out in **J**.

**Acquiring a session lock is still a write** (`REQ-SESSION-046`, and ADR-0005), and `REQ-SESSION-089` and
`REQ-EVENTS-084` as amended still make a store that cannot be opened refuse the run rather than degrade it.
Those two links were never in doubt and are unaffected.

**The specification has since been amended for this and it now constrains the decision rather than
following it.** `REQ-SESSION-197` mints the workspace identifier: written into the workspace's `.rotaris/`,
human-readable, version-control-trackable, minted once, never changing "for any reason — not when the
workspace is moved, renamed, copied, or carried through a synchronising folder". `REQ-SESSION-198` makes the
store machine-local, unconditionally, and forbids making it conditional on detecting shared storage; it
requires that a workspace on a share or in a synchronising folder be **fully usable**, that the user's own
material stay exactly where they put it, that a session recorded on one machine not appear on another, and
that the per-session files of `REQ-SESSION-002` be held **with the store** rather than inside the workspace.
`REQ-SESSION-001` no longer anchors the record to a path: it requires one workspace plus one session id to
resolve to one record, and says the record lives in the workspace's machine-local store, "found through the
workspace identifier rather than through a path".

Five further edges are fixed before any alternative is weighed. Four survive from the previous version
unchanged; the fifth is new.

**A synchronous, durable flush with no asynchronous runtime.** `REQ-SESSION-068` requires the flush entry
point to be usable "from any caller's context, including one where no asynchronous runtime is active", and
`REQ-SESSION-070` requires a save carrying a terminal status not to return before that status "can be read
back by any other reader of the store". `REQ-SESSION-072` repeats it. **A binding whose only interface is a
promise cannot satisfy them.** The caller is a teardown path and there is no loop left to turn.

**Persist before publish, with no delay floor.** `REQ-MONITOR-221` requires every change to be persisted
before it is published to any view, and states in terms that this is satisfiable alongside
`REQ-MONITOR-218`'s ban on "any minimum wait, debounce, or delay floor of any size" only because
`REQ-SESSION-067` withdrew the ten-second debounce. Rows are written individually, so the collision is gone
— but persist-before-publish now rests on **a transaction commit**, and a commit's cost is therefore on the
publish path.

**One writer per session, and the ordering that follows.** `REQ-EVENTS-098` requires a session's history to
have at most one writer and makes the right to write it exactly the right to hold that session's lock; it
also requires that "a reader MUST NOT be able to delay or block the writer, and the writer MUST NOT be able
to make a reader fail; a store in which one blocks the other does not satisfy this requirement" — which
selects write-ahead logging as a conformance property and not as a tuning choice. `REQ-EVENTS-029` requires
each event to be made durable individually "at the moment it is raised and never in accumulated batches".

**The blast radius must be stated.** SR-4's own words: "a database file is a single corruption domain where
per-session directories lost one session at a time; scoping the database per workspace bounds the blast
radius, and that must be **stated in the decision record rather than assumed**."

**New: the store is not in the user's backup of their workspace.** SR-9(b). Under the file design, backing
up or synchronising a workspace backed up its session history. It no longer does: the workspace travels and
the sessions stay. Everything in the recovery section below has to be written for a store the user may never
have copied anywhere.

**Newer: that gap now has two named answers in the specification, and this record has to build one of
them.** SR-9(b) offered a minimum fix (a disclosure) and named a larger, structural one it deliberately did
not foreclose. ESC-19 took **half** the structural option and refused the other half. Both halves have
landed as requirements and both bind this record.

- `REQ-SESSION-200` is the disclosure. It fixes what must be named as outside a workspace backup — every
  session record the store holds, the workspace-scoped improvement library, and the per-session files —
  what *is* carried, that both remedies must be named, that it is reachable from the ordinary session
  management surface (`REQ-SESSION-182`), and that it "MUST NOT be delivered only as part of a failure or
  a remediation message". Consequence 4 of the previous version said this requirement was "not in the
  specification"; that is now wrong and is corrected below.
- `REQ-SESSION-201` is the whole-store backup and restore. It is the substantial new mechanism in this
  pass and it has a section of its own.
- **A user-configurable store location is refused**, by ESC-19 and on comparative evidence: no surveyed
  product offers one, and the ones that let a user move a whole configuration directory are flagged as a
  hazard for silently relocating stores into synchronised folders — which is ESC-15's total outage,
  reintroduced by a setting. Alternative N below moves from *not foreclosed* to *refused by ruling*.

### What the comparison established, and what it protects

ESC-19 to ESC-21 were decided by surveying seven coding harnesses rather than from first principles.
Three of its findings bear on decisions already taken here, and they are recorded because a record that
only states its own reasoning invites a later reader to reopen it from theirs.

**Machine-local is universal.** Not one of the seven stores session history inside the user's project.
ESC-15 is not this product's deviation; it is what the field does. One of them (`opencode`) uses
`%LOCALAPPDATA%` on Windows — the same **non-roaming** location alternative L below argues for, reached
independently and for the same reason.

**The store kind is the field's direction of travel.** Four of the seven use SQLite and three of those
*migrated to it* from JSON or per-session line-delimited files. One runs write-ahead logging "with
fallback behaviour for filesystems that cannot support WAL coordination" — the precise hazard ESC-15
identified and this record removes by relocating rather than by falling back. SR-4 is the consensus
position.

**The identifier is not a nicety, and this is the finding to protect.** The two surveyed harnesses that
key session history by an encoded absolute path have a documented, filed, reproduced defect: sessions
orphaned when a project directory is moved or renamed, one report losing 63 sessions across 10 projects
after reorganising repositories, and *even changing a folder name's case* orphaning everything. A third
product has the identical defect, and the fix its users ask for is a stable per-project identifier file.
`REQ-SESSION-197` is that file, decided before shipping rather than after the bug reports.
**Alternative P below — "by the workspace's resolved path, or a hash of it" — is therefore not merely
rejected on argument; it is the field's most-complained-of storage defect, and it must not later be
adopted as a simplification.** It will look like one: it removes a file, a minting step, a resolution
step and a whole class of two-folders-one-identifier edge cases. It buys those by orphaning a user's
history the first time they rename a folder.

**One negative finding is carried as an obligation rather than a reassurance.** The same survey records
`better-sqlite3` failing silently under an Electron runtime through a native-module ABI mismatch, with
the error swallowed. This record chooses `better-sqlite3`. The build must rebuild it against the Electron
ABI (ADR-0056, and ADR-0002 consequence 4), and a store that cannot load must fail **loudly** on
`REQ-SESSION-089` and `REQ-EVENTS-084`'s terms — naming the store and carrying the engine's own reason
unaltered — and must never be caught and degraded. A swallowed load error would present as a workspace
with no sessions, which `REQ-SESSION-043` makes an *ordinary state*, so the failure would be invisible
by construction. That is the worst shape a fault can have in this record and it is designed against here.

**Measured, the ABI mismatch is loud on this toolchain, and the obligation is kept for a different
reason.** Both directions abort the load with a specific message naming the two `NODE_MODULE_VERSION`
values — the host build inside Electron and the Electron build inside host Node — so no detector has to be
written for it. **The silent-failure shape survives one step further along, where this record did not
expect it**, and that is the reason the loud-failure rule stays: the mapped-drive result below is a store
that opens cleanly and throws on its **first statement**, and an implementation that catches that throw
and retries runs fine and never reports the condition. The obligation is therefore restated as rule 3
below in terms of what must not be swallowed rather than in terms of the load.

## Alternatives considered — the engine

**Unchanged by ESC-15, and preserved because the ruling changed the store's location, not its kind.** Each
candidate was checked against published documentation rather than recalled, at the date of the previous
version; nothing in this pass re-opened them.

**A — `better-sqlite3`.** Chosen. A synchronous SQLite binding for Node, published on the 12.x line and
maintained under `wiselibs/better-sqlite3`. Its entire API is synchronous by design, which is what
`REQ-SESSION-068`, `REQ-SESSION-070` and `REQ-SESSION-072` need. It exposes `db.pragma(...)` for
`journal_mode` and `synchronous`, and a `transaction()` wrapper with explicit `deferred`, `immediate` and
`exclusive` modes, which the writer-ordering rule below depends on. Its Electron cost is real and specific:
a native module must be rebuilt against the Electron ABI and, inside an `app.asar` bundle, unpacked, or it
fails at run time. Two facts decide it against the alternative with no such cost. ADR-0020 already takes
`node-pty` as a native module and calls ADR-0002's rebuild-and-unpack obligation load-bearing, so this adds
an entry to a matrix the build already maintains. And it pins the SQLite version the product ships, which a
system of record wants.

One compiled default must be overridden deliberately: the package is built with
`SQLITE_DEFAULT_WAL_SYNCHRONOUS=1`, so `synchronous` defaults to `NORMAL` in WAL mode. The durability
section below depends on setting the pragma rather than inheriting it.

**That compile option is present, and its consequence as stated here is only half true.** Measured: the
compiled WAL default applies to a connection that opens a database **already in WAL mode**. The connection
that *creates* the store and switches it to WAL keeps `synchronous = FULL`. So the first session in a new
workspace would run every publish-path commit at `FULL` — measured 4.4× the `NORMAL` p50 — unless the
pragma is set explicitly. The decision was already right for the reason stated; what the measurement adds
is that setting the pragma is not belt-and-braces, and that the named fallback **B** carries the *opposite*
inherited default (`SQLITE_DEFAULT_WAL_SYNCHRONOUS=2` in the Electron build measured), so a swap that
relies on inheritance changes every publish-path commit from ~160 µs to ~667 µs.

**Two defects in the chosen binding were measured and belong on this record rather than in a spike alone.**
Neither reverses the choice; both are things an implementation must be built to avoid rather than
discover. First, `PRAGMA synchronous` set through a *prepared statement* is applied at prepare time and
the first step of that statement is a no-op — which silently ran an entire measurement pass at `NORMAL`
while it reported `FULL`. The pragma raise-and-lower this record specifies for terminal saves must
therefore go through the binding's direct-execution entry point, not through a prepared statement.
Second, and more serious: under Electron the binding **aborts its own process** when a `Statement` object
is garbage-collected, at a measured 3 of 30 launches (10 %) when statements are left to the collector,
and 0 of 30 when every statement is retained. It reproduces both under `ELECTRON_RUN_AS_NODE` and inside
a real `utilityProcess`, which is where ADR-0002 puts the run host — the one process that writes a
session's rows. The data-access module must retain every prepared statement for the life of the
connection and must route result-less pragmas through direct execution rather than the convenience
accessor that creates a transient statement per call. Recorded here because the module this record makes
"thin and statement-shaped" is exactly the module that has to hold them.

**B — `node:sqlite` (`DatabaseSync`).** Genuinely close to being chosen: synchronous by construction, no
native build, no ABI rebuild, no asar unpacking. Rejected on two published facts. It is documented at
**Stability 1.2 — release candidate**, and this store is the product's system of record. More decisively,
its presence in Electron is not contractual — a shipped Electron release omitted the binding and
`require('node:sqlite')` failed, fixed only in a later release. A patch release of the shell removing the
module all of the product's state lives in is a supply risk with no fallback. Kept as the named fallback:
the data-access layer is thin and statement-shaped precisely so that swapping the binding is one module.

**C — `sqlite3` (`node-sqlite3`).** Rejected: an asynchronous callback interface fails `REQ-SESSION-068` and
`REQ-SESSION-070` directly, and the package is marked deprecated by its stewards.

**D — An embedded server-shaped engine.** Rejected. It contradicts `REQ-STARTUP-002`'s single-executable
rule and ADR-0002's "four process kinds, and no others", adds a second signing, update and lifecycle
surface, and buys concurrency the product does not need: at most two processes write one store.

## Alternatives considered — scope

**E — One store per session.** Preserves the file design's blast radius exactly. Rejected: it reinstates the
O(sessions) open-and-read that `REQ-SESSION-042` exists to avoid — that requirement now requires listing to
read "nothing but those listing records ... so the cost of listing grows with the number of sessions and
with nothing else" — a workspace-wide question (the improvement library of `REQ-LIBRARY-042`, delivery
records, the checkpoint index) has no store to live in, and it multiplies migration by the number of
sessions a user has ever run.

**F — One store for the whole installation.** Rejected, and the grounds have **shifted** under ESC-15 rather
than survived intact, which is worth showing. The previous version rejected it partly because "a workspace
copied, moved or deleted must take its sessions with it" — that clause is now **false and must not be
cited**: under `REQ-SESSION-198` a deleted workspace leaves its sessions on the machine, and a copied one
shares them. What survives is stronger than what was lost. First, blast radius: one store for every
workspace is one corruption domain for a user's entire history, and there is now no copy of it in the user's
own backup (SR-9(b)) to fall back on. Second, and new: **reclamation**. Machine-local storage accumulates
records for workspaces that no longer exist, and per-workspace scope makes reclaiming one workspace's whole
record a directory deletion the user can be shown and can confirm, where an installation-wide store would
make it row surgery.

**G — Two stores per workspace**, one written only by the run host and one only by the workspace service.
Better on two axes — no cross-process write contention, half the blast radius each. Not chosen, because SR-4
rules "database, one per workspace" and this record follows rulings. Recorded rather than discarded; it is
the first thing to reach for under *Revisit if*, and the split is invisible to every requirement, since
nothing joins a session row to a delivery record.

**H — One store per workspace.** Chosen, per SR-4.

## Alternatives considered — where "machine-local" is

**J — Inside the workspace, at `<workspace>/.rotaris/workspace.db`.** *This record's own superseded
decision, preserved in full because it was not a weak argument.* It put the store beside the configuration
the workspace already owns; it made a workspace self-contained, so copying, moving, backing up or deleting a
folder did the obvious thing to its sessions with no indirection and nothing to reclaim; it needed no
identifier, no resolution step and no second location to explain to a user; and it kept one session's record
whole in one place. It also had a stated, honest consequence: on a network share or inside a cloud-sync
folder the store is degraded.

**What killed it was not slowness. What killed it is now measured, and it is not what this record said it
was.** The argument printed here until 2026-09-02 was a three-link chain: write-ahead logging is
unsupported on network filesystems → the store therefore opens read-only → `REQ-SESSION-046` makes lock
acquisition a write → therefore no session can start. **The conclusion is right. Links 1 and 2 were tested
and found false, and the record states that rather than keeping a chain a reader can falsify in ten
minutes with a UNC path.**

| Link, as this record stated it | Verdict | What was measured |
|---|---|---|
| 1. "Write-ahead logging requires shared memory and is unsupported on network filesystems" | **False as stated; true only for one spelling** | WAL enabled and worked over a UNC path in **320 process-trials** — 0 open failures, 0 write errors, 0 rows lost, `integrity_check` clean, `-shm` created at 32,768 B. On a **mapped drive letter to the same share**: **30 of 30** opens threw `SQLITE_IOERR_IN_PAGE` on the first statement |
| 2. "so the store there opens read-only" | **False. Never observed** | The store reported itself writable in every network configuration measured. A genuinely read-only store is a *different animal*: it opens, **reads perfectly**, and fails only writes. The real shared-memory-unavailable state opens **read-write** and then fails **reads as well as writes** |
| 3. "therefore no session in that workspace can start at all" | **Holds on the mapped-drive and shared-memory-unavailable paths, by a different mechanism. Inconclusive on a UNC path**, where nothing failed and a session would start and run | — |

**The correction does not weaken ESC-15; the measurements found three failures worse than the one ESC-15
named, and they are the argument now.**

1. **Silent, undetected data loss where one file is reached through two spellings.** Two writer processes,
   one database file, WAL, 300 commits each, differing only in how each spelled the path. **Not one of
   twenty trials was correct**: eleven lost rows silently while both writers reported full success with
   zero errors, and nine failed loudly. Final counts against an expected 600 included **87, 32 and 226**.
   Every survivor passed `integrity_check` and every surviving row's checksum verified — the store is not
   corrupt, it is **short**, and nothing anywhere reports an error. Rollback-journal mode was clean in
   every mixed pairing, so this is the write-ahead log's index specifically, exactly as SQLite's own
   documentation predicts of two openers that do not share one wal-index. Two machines reaching one share
   is two mappings by construction.
2. **A store that reports success and then throws.** On the mapped drive the pragma returns `wal`, the
   read-back returns `wal`, the 32 KiB shared-memory file exists at the expected size, and the next write
   throws a disk I/O error. See rule 3 — this is also what destroyed the guard this record prescribed.
3. **Total destruction from a replica written back.** A synchronisation client that decides the remote
   copy wins overwrites the local file. Modelled on one machine with a *valid, quiescent* snapshot of the
   same store: **4 of 4 variants left the store `SQLITE_CORRUPT` and unopenable** — overwriting the
   database alone was enough, and overwriting only the write-ahead log was enough — while the writing
   process reported **zero errors** across 43,120 to 58,273 commits. Under this record's scope that is one
   workspace's entire session history, and under SR-9(b) there is no copy of it in the user's own backup.

**And J's own stated corruption vector is confirmed in the other direction too.** "A store a
synchronisation client writes to while the application has it open is a documented corruption vector" was
read from documentation; it is now measured from both ends. Reading a live store file-by-file, the way a
client's directory walk does, produced **625 unopenable copies out of 627** across both journal modes —
and rollback-journal mode was *worse*, 475 of 475, because the main database file is written on every
commit. The live store itself was never damaged by the reading; what is worthless is the replica, which is
what the other machine receives and what a restore would restore.

**One secondary property of J is also worth recording as lost.** Under `REQ-CONFIG-013` the whole of
`.rotaris/` is gitignored by default, so the store J placed there was never in the user's version control
anyway — J's apparent "it travels with your project" benefit was already partial.

**What J's death does *not* license, stated because the measurement invites it.** Nothing here says the
other residents of `<workspace>/.rotaris/` are unsafe on a share, and they are not: exclusive create was a
flawless mutual-exclusion primitive over SMB (2,500 races, exactly one winner in every one), and
read-after-write through a second spelling was coherent in 900 documents with 0 mismatches. The failure is
confined to the store, and the store is no longer there. That split is ESC-15's, and it is the measured
shape of it.

**K — Detect shared or synchronised storage and relocate only then.** Rejected, and `REQ-SESSION-198`
now forbids it in terms: "MUST NOT be made conditional on detecting that a particular workspace is on shared
storage: such detection is unreliable, and a second storage layout would be a second thing to get right on a
path where being wrong costs a user their history". OneDrive and Dropbox trees look like ordinary
directories; detection would have to be maintained against every client, and a conditional path is two
layouts to build, test and support. Note that the product *does* detect the condition — `REQ-STARTUP-166`
requires it, directly and not from a failure — but that detection drives **a warning about the user's own
files**, never a storage decision.

**One distinction has to be held or rule 6 below will look like K readmitted.** `REQ-SESSION-198` and this
alternative are about the **workspace's** location: whatever it is, the store is not there, and no layout
is chosen from it. Rule 6 classifies the **store's own** resolved path, which the product chose and which
is supposed to be machine-local, and refuses it if it turns out not to be. That is not a conditional
layout — there is still exactly one — it is a check that the single layout's premise holds. K asks
"where shall I put the store?" and is answered without looking; rule 6 asks "is where I put it actually
local?" and is answered by looking. The classification's measured blind spot is why rule 6 is a floor and
canonicalisation is the real defence.

**L — The per-user roaming application-data directory.** Rejected, and this is the trap in "platform
conventional". `REQ-STARTUP-145` fixes per-user directories as the platform-conventional configuration and
data directories under the name `rotaris`, and on Windows the Electron default for user data is the
**roaming** `AppData` tree. A roaming profile is replicated between machines by the platform. Putting the
store there would re-create, through the operating system, exactly the multi-machine store ESC-15 removed —
and it would resurrect the condition `REQ-SESSION-054` now calls "evidence that the store itself is
reachable from more than one machine — a state that should not arise". The default must therefore be
overridden deliberately rather than inherited.

**M — Beside the artifact, or in the running image's directory.** Rejected outright, and now on measured
grounds rather than by taste. The packaged-first-paint spike established that the Windows onefile portable's
stub **deletes its extraction directory when the application exits**, so state cached there is destroyed on
every run; and a portable artifact must be able to run from read-only or removable media, which is its
purpose. SR-7 reached the same conclusion for the launch-preparation cache and put it in per-user local
storage "never beside the executable". The store follows the same rule for the same reason.

**N — A user-configurable store location.** *The previous version of this record called this "not chosen
for the first release, and explicitly **not foreclosed**", and listed it as a Revisit if. **That status is
withdrawn: ESC-19 refuses it.*** The argument for it was SR-9(b)'s, which named "a configurable store
location, or an explicit backup action covering the whole store" as the structural answer to the backup
problem. ESC-19 split that pair and found the two halves have opposite evidence.

The backup action is taken (see the section on it below). The configurable location is refused, and the
grounds are comparative rather than architectural: **no surveyed product lets a user relocate the session
data store.** What several offer — a `*_HOME` or `*_CONFIG_DIR` variable — relocates the whole
configuration directory, and the survey flags exactly these as a hazard because they "silently relocate
stores" into synchronised folders. A user pointing this store at a share reproduces the failure ESC-15
exists to prevent — **and the measurement has made that failure worse than the version of it this
paragraph used to state.** It said "write-ahead logging unsupported, store read-only, lock acquisition a
write, no session starts"; that chain is corrected in alternative **J** and two of its links are false. The
outcome a user would actually get from this setting is one of three measured ones, and none is a clean
refusal: a store that works today and throws on its first statement tomorrow, a store two machines write
through two mappings while **silently losing up to 95 % of committed rows with a clean
`integrity_check`**, or a store a synchronisation client destroys outright by writing a replica back over
it, with **zero errors reported** across tens of thousands of commits. A loud outage would have been the
*good* version of this. The setting would be the product handing the user a failure it just removed, in a
form that does not announce itself.

What survives of the original rejection is the same argument that rejects K — a second layout is a second
thing to get right on the path where being wrong costs a user their history — and it is now the weaker of
the two reasons rather than the only one. **ESC-19 states in terms that "ADR-0058's location decision does
NOT reopen"**, because the condition the reopening was attached to was taking the structural option, and
the half worth taking does not move the store.

**O — The per-user local (non-roaming) data directory.** Chosen.

## Alternatives considered — how a store is located

**P — By the workspace's resolved path, or a hash of it.** Rejected. It fails the first thing
`REQ-SESSION-197` requires: moving or renaming a workspace folder must preserve its sessions. It also
encodes a user's directory layout into a value that may end up in a bug report or a commit.

**It is also the one alternative in this record with field evidence against it rather than argument**, and
ESC-19's survey supplies it: three comparable products key by path and all three carry the same filed
defect — history orphaned by a move, a rename, or a change of case — with one user reporting 63 sessions
lost across 10 projects. The remedy their users ask for is the file `REQ-SESSION-197` already mints. This
alternative is kept here, and kept explicit, because it is what a later simplification pass will propose:
it deletes a file, a mint, a resolution step and the whole two-folders-one-identifier class of edge cases
below. Everything it deletes is what stops a rename destroying a user's history.

**Q — By something derived from the repository** (the initial commit id, a remote URL). Rejected on two
counts. It would make a **fresh clone resolve to the same identity**, which the reconciliation of
`REQ-SESSION-197` with `REQ-CONFIG-013` deliberately rules out — a clone mints its own identifier and starts
with an empty local history, "which is what `REQ-SESSION-198` requires of a machine that has not run the
workspace before" (`REQ-CONFIG-010`). And `REQ-GIT-044` allows a workspace Git cannot manage at all, which
would then have no identity.

**R — A stored identifier, minted once, read thereafter.** Chosen, per `REQ-SESSION-197`.

## Alternatives considered — how one artifact is taken from a store while runs are live

New with ESC-19. `REQ-SESSION-201` fixes the hard part before any candidate is weighed: the action must
not require a session to be stopped, must not pause, delay, throttle or disturb a run, must not be refused
because a session is live, and what it produces must be "a state of the store that a reader could have
observed at one moment: never a mixture of parts taken before and after a write".

**S — Copy the store's files while the application runs.** Refused, and ESC-19 refuses it in one line: *a
file copy of a live store is not a backup.* Under write-ahead logging the store is three files whose
consistency is a relationship between them at an instant; copying them one after another captures three
instants, and `-shm` is shared-memory bookkeeping that must not be copied at all. Even a copy that
happened to be consistent could not be shown to be, which fails the requirement's wording as much as its
intent. Recorded rather than assumed away because it is what an implementer reaches for first, and because
the Windows writer-handle spike is a standing warning against reasoning about a live file by intuition —
it found `renameSync` over a file with a held descriptor failing outright, 0 of 115 attempts succeeding,
where theory had predicted otherwise.

**Measured, and the refusal is vindicated rather than merely reasoned.** Against a 41 MB store under a
live writer, **625 of 627 naive file copies were unopenable** — `SQLITE_CORRUPT :: database disk image is
malformed` or `SQLITE_NOTADB :: file is not a database` — 150 of 152 under write-ahead logging and **475
of 475** under rollback journal, which is *worse* because the main database file is written on every
commit. Two warnings ride on that. Anyone reaching for `journal_mode=DELETE` as a fallback for awkward
storage should know it trades one hazard for a worse one here. And a gentler first pass at
`REQ-MONITOR-219`'s realistic 20-commits-per-second cadence against a small store produced **0 bad copies
in 40** — so the obvious experiment returns a false all-clear, and an implementer who runs it and believes
it will ship S.

**T — The engine's own online backup facility** (`sqlite3_backup_*`, exposed by the binding as a stepped
copy that yields between steps). **This is the shape the working precedent uses and ESC-19 names it
approvingly**: built for exactly this, correct while the application is running and safe under
write-ahead logging. Not chosen, on one documented property that this record's own topology turns from
rare into routine: the copy is **restarted** when the source is written through a connection other than
the one driving the backup. ADR-0002 puts two writer processes on this store, the backup runs in the
workspace service, and every commit the run host makes during the copy is therefore an external write —
at `REQ-MONITOR-219`'s coalescing tick, up to twenty a second per live session. A mechanism that restarts
on each of those has no obvious termination on the exact configuration `REQ-SESSION-201` requires it to
work in.

Two honesty notes. **That restart property is read from the engine's documented behaviour and has not
been measured here**, and it is the single fact that decides between T and U; it must be confirmed
against the binding's own documentation before implementation rather than taken from this record. And T
remains available in a shape that avoids the restart entirely — driving the backup from the *same*
connection the writes go through, which updates the copy instead of restarting it — at the cost of moving
an O(store) copy into the run host, which is the process that must not be given long work. That is the
fallback if U's cost proves the worse one.

**U — `VACUUM INTO`, run in a read transaction.** Chosen for the store half of the artifact. One
statement, synchronous, producing a new self-contained database that is a transactionally consistent
snapshot — which is `REQ-SESSION-201`'s "a state a reader could have observed at one moment" literally
rather than approximately. Under write-ahead logging the reader neither blocks the writer nor is blocked
by it, which `REQ-EVENTS-098` already states as a **conformance property of this store** rather than a
tuning choice, so "must not disturb a run" is satisfied structurally rather than by care. It is not a new
primitive here: the pre-migration copy already uses it, so the backup reuses a mechanism the record has
already committed to and already has to get right. Its cost is real and is stated in the Decision.

**The choice between S and U is now measured, and U passed the exact test `REQ-SESSION-201` sets.** In the
same run in which 625 of 627 naive copies were garbage, `VACUUM INTO` produced **8 valid snapshots out of
8** while **108,525 commits landed**, every one passing `integrity_check`, every row's checksum verifying,
and the snapshots' row counts rising monotonically from 22,070 to 118,878. That is "valid while runs are
live" and "never a mixture of parts taken before and after a write" demonstrated rather than argued. The
cost is a **median 1,077 ms per 41 MB snapshot** on a local NVMe volume (min 403 ms, max 2,107 ms), which
is the first real number this record has for consequence 6.

**V — Let the per-record exports be the backup.** Refused, and `REQ-SESSION-201` refuses it in terms: an
export "is a record rendered so that software knowing nothing about this product can read it", a backup
"is the store rendered so that this product can put it back", and neither substitutes for the other. Two
further failures make it not merely different but wrong. Exports cannot carry `REQ-SESSION-136`'s
tool-call evidence — ESC-20 fixes the export boundary at redaction safety and that record never gains an
export, under any later widening — so an export-shaped backup would silently omit a record class.
And `REQ-SESSION-199` forbids building a surface on repeating an export, which is exactly what a backup
story assembled from exports would be. SR-9(b) was right that per-record exports were never a backup.

**W — Quiesce first: stop or pause every run, then copy.** Refused by requirement, and recorded because
it is the cheap way to make S correct. `REQ-SESSION-201` closes it deliberately, and the reason is a
product one rather than a technical one: a backup a user can only take when nothing is happening is a
backup taken rarely, and the machine most worth backing up is the one that is busy.

## Alternatives considered — what a restore does about the identifier

Also new with ESC-19, and the sharp edge of it. `REQ-SESSION-201` fixes that the artifact carries the
workspace identifier it was taken from and that "a restore into a store belonging to a different
identifier MUST be reported as what it is rather than performed silently". What it does not fix is what
the restore does when the *workspace* in front of the user carries a different identifier, or none.

**X — Restore into the store of whichever workspace is open, ignoring what the artifact says.** Refused.
It is precisely the "poured into the wrong workspace by accident" outcome the requirement exists to
prevent, and it destroys in two directions at once: the open workspace's history is overwritten by an
unrelated one, and the artifact's own workspace is left as empty as it was.

**Y — Restore, and write the artifact's identifier over the identifier the open workspace carries.**
*Refused when this record was written, on the grounds that `REQ-SESSION-197` forbids the identifier
changing "for any reason", forbids minting a replacement over one the product can read, and names the harm
— silently orphaning every session recorded under the old value. The refusal was recorded with the note
that it "would make disaster recovery frictionless" and that its cost was paid by the user.* **ESC-26 has
since ruled, and the escalation this record raised is answered: `REQ-SESSION-197` gains one narrow
exception and Y is adopted in a confirmed form only.** The unconditional shape of Y — the product doing
this because it is convenient, or by default, or anywhere but inside a restore — remains refused and is
refused in the ruling's own terms. What is adopted is **Y′**, below.

**Y′ — Restore, and establish the artifact's identifier over the workspace's, only on explicit
confirmation.** Chosen for case (c), per ESC-26. The exception exists **only inside the restore action**;
it is never automatic and never a default; it names both identifier values and states what becomes
unreachable; the absent-identifier case is unchanged and is not an exception at all; a present-but-
**unreadable** identifier is still reported and never overwritten; and the displaced store is kept. ESC-26
draws it this narrowly because the absolute rule is this record's best-evidenced decision — three surveyed
products carry the filed history-loss bug `REQ-SESSION-197` prevents — so the protection is kept
everywhere it earns its place and the recovery path is paid for only where a user has asked for it in as
many words.

**Z — The restore is keyed by the identifier the artifact carries, and it never writes over an identifier
it can read.** Chosen.

**AA — Restore, and rewrite the *artifact's* identifier to the open workspace's, adopting the history.**
Refused, and it is worse than Y rather than safer. It makes a workspace's recorded history one it never
produced, which the product can never afterwards distinguish from history it did produce, and it lets one
identifier name two unrelated histories on two machines — breaking the one property `REQ-SESSION-197`
exists to give. `REQ-SESSION-201` makes the artifact name its workspace so this cannot happen by
accident; doing it on purpose is not an improvement on doing it by accident.

## Decision

### Engine, location and layout

**`better-sqlite3`, one store per workspace, held machine-locally in the per-user *local* (non-roaming) data
directory for `rotaris` (`REQ-STARTUP-145`), and located by the workspace identifier of `REQ-SESSION-197`
and never by path.** All access goes through one thin, statement-shaped data-access module so that
alternative B remains a one-module swap.

```
<per-user local data dir>/rotaris/workspaces/
    <identifier>/                            the live store for one workspace
        workspace.db                         the store; -wal and -shm beside it
        workspace.db.pre-<n>.bak             a pre-migration copy, transient (see schema evolution)
        sessions/<session-id>/               the per-session files of REQ-SESSION-002, held with the store
            debug.log                        REQ-SESSION-142
            summary.md                       REQ-SESSION-140, replaced under REQ-SESSION-033
            artifacts/…                      artifact, attachment and image bodies (REQ-LIBRARY-087)
        origin.txt                           diagnostic only — see below
    <identifier>.restoring-<n>/              a restore staging directory, transient
    <identifier>.displaced-<UTC timestamp>/  a store set aside by a restore or by the recovery ladder;
                                             never deleted by the product (see the restore, and recovery)
```

The three siblings are all one directory level up from the store deliberately: a displaced store is a
whole store, it must be reclaimable by the same surface that reclaims any other, and it must not sit
inside the store that replaced it where a later reclamation would take both.

Three notes bind that layout.

1. **The per-session files sit under the store's directory because `REQ-SESSION-198` requires it**, "so that
   one session's record is never split across storage a synchronising client may reach and storage it may
   not". `REQ-SESSION-191`'s reveal action therefore opens a machine-local directory, and `REQ-SESSION-166`
   removes the session's record and this directory together.
2. **`origin.txt` records the workspace paths this store has been opened from, and the time of the last
   open. It is diagnostic and MUST NOT be consulted to resolve a store.** It exists so a user looking at
   this directory, or a reclamation surface listing it, can say which project it belongs to. Making it
   authoritative would reintroduce path-as-identity through the back door and would give two answers where
   `REQ-SESSION-197` fixes one.
3. **One directory is one workspace's whole record**, which is what makes reclamation a deletion the user
   can be shown rather than row surgery. This is alternative F's replacement argument and it is load-bearing.

The store directory is created on first open of an identifier. **An empty store is an ordinary state, not an
error** (`REQ-SESSION-043`: a workspace for which this machine holds no store at all produces an empty
list), and `REQ-SESSION-197` says the same from the other side.

### The workspace identifier

**Form.** A single plain-text token, `v1-` followed by 32 lowercase hexadecimal characters carrying 128 bits
from a cryptographic random source, matching `^v1-[0-9a-f]{32}$`. It is held in one small file in
`<workspace>/.rotaris/`, alongside `#`-prefixed comment lines stating what it is and that removing it
detaches the workspace from its recorded sessions; reading takes the first line that is neither blank nor a
comment, trimmed. Anything that does not match the pattern is **unreadable**, which is a defined condition
and not a licence to re-mint.

The form is chosen against `REQ-SESSION-197`'s own adjectives and against `REQ-CONFIG-477` ground 3, which
values these files being "diffable, mergeable, reviewable, copyable between machines, and quotable in a bug
report": it is short, it is legible, it is case-insensitively unique on the case-insensitive filesystems the
product supports, it is safe as a directory name on all three platforms, and it carries no information about
the user's machine or directory layout. The `v1-` tag exists so that a later change of form is a readable
distinction rather than an ambiguity. A hyphenated random value was preferred to a folder-name-derived one
because a name minted from a folder becomes a lie the first time the folder is renamed, and `REQ-SESSION-197`
guarantees renames.

**Minting.** Exactly once, when the product first prepares the workspace, by **exclusive create**. A create
that finds the file already present is not an error: the existing value is read and used. This is the same
primitive ADR-0004 gives the integration lock, and it is the mechanism form of `REQ-SESSION-197`'s "MUST NOT
mint a replacement over an identifier it can read".

**Never rewritten.** The product writes this file once and never again — not to normalise it, not to add a
field, not when opened by a different version. `REQ-SESSION-197` forbids the change and forward tolerance
follows: unknown extra lines are ignored and left in place.

**What it must survive, and what it must not.**

| Event | Identifier | Store | Why |
|---|---|---|---|
| Folder moved or renamed | travels | same store | the file moves with the folder; resolution is by identifier, not path (`REQ-SESSION-197`) |
| Folder copied | travels | **same store** | a copy is byte-identical; the identifier cannot distinguish itself from a move, and `REQ-SESSION-197` forbids re-minting over it. See the next section |
| Carried through a synchronising folder | travels | per-machine | a small text file syncs safely; each machine resolves its own store (`REQ-SESSION-198`) |
| Same workspace opened on a second machine | travels | **a second, separate store** | intended: "each machine keeps its own session history" (`REQ-SESSION-197`) |
| **Fresh clone** | **does not travel** | new, empty | `.rotaris/` is gitignored by default (`REQ-CONFIG-013`, `REQ-CONFIG-010`), so a clone mints its own and starts empty — deliberately |
| Opened by a different product version | unchanged | same store | `REQ-SESSION-197` forbids change for any reason |
| User commits the identifier themselves | travels through clones | shared identity | their choice; `REQ-CONFIG-010` states the ignore rule is "a default about what is staged by accident, not a prohibition" |

**An identifier that cannot be read.** The workspace opens; configuration, personas, model slots, the
requirement documents, Git and every file-backed capability work normally (`REQ-CONFIG-477`,
`REQ-TRACE-513`). No store is resolved, so no session lists and no run starts, refused on
`REQ-SESSION-089`'s terms with the reason naming the file, what it must contain, and **why the product will
not replace it** — replacing it would silently orphan every session recorded under the old value, which is
the harm `REQ-SESSION-197` names. The remedies offered are the user's: restore the file, or remove it and
accept a fresh history. Neither is taken automatically. This is the same instinct as `REQ-SESSION-183`'s
explicit, user-confirmed release.

### Two workspaces presenting the same identifier

A user copies a folder. Both copies carry the identifier, deliberately, and both resolve to one store. The
specification requires that outcome; what it does not settle is what happens when **both are open at once**,
and that is decided here.

**Sequentially — open one, close it, open the other — nothing happens and nothing may.** That case is
indistinguishable from a move, and `REQ-SESSION-197` requires a move to preserve the sessions. Any detection
that fired here would break the requirement it was written to serve.

**Concurrently, the identifier is claimed once per instance and the second workspace opens without a
store.** The instance keeps one claim per identifier — in main, beside the instance claim and the window
registry it already holds (ADR-0002) — and the workspace service that resolves an identifier takes that
claim before opening. A second workspace at a different path presenting a claimed identifier is admitted as
a workspace and refused a store, reporting the condition on `REQ-SESSION-089`'s terms: that this folder and
the already-open folder are, by the identifier both carry, one workspace; naming both paths and the
identifier; and stating that only the user may give one of them an identity of its own.

Three things decide this against simply sharing the store between the two windows.

1. **The hazard is not corruption, it is a run against the wrong tree.** Sessions record `workspace_root`
   (`REQ-SESSION-014`) and resume against it. Sharing the store would list, in the copy's window, sessions
   whose resume starts an agent writing files into the *other* folder. Silently doing work in a directory
   the user does not have open is a materially worse outcome than a window that lists no sessions and says
   why.
2. **It is the only shape that keeps the ownership rule structural.** Rule 1 below says no table has two
   writer processes. Two workspace services on one store are two writers of the workspace-scoped tables;
   the store's own transactions would keep them from corrupting each other, but "no two writers" would
   become a claim about SQLite rather than a property of the topology, and `REQ-EVENTS-098`'s single-writer
   discipline is exactly the thing SR-4 promised to keep structural.
3. **It is detectable at all only because of SR-1.** One instance per machine (`REQ-STARTUP-161`) is what
   makes a per-instance claim total. Across machines there is nothing to detect and nothing to do: the
   stores are separate by construction.

### Concurrency across ADR-0002's topology

| Process | Opens the store | Mode | Writes |
|---|---|---|---|
| **Run host** (one, all sessions) | yes | read-write | **session-scoped tables only**, and only for a session whose lock row it holds |
| **Workspace service** (one per open workspace) | yes | read-write | **workspace-scoped tables only** — delivery records, the improvement library, saved prompts |
| **Main** | no | — | — |
| **Renderers** | no | — | — |

**The workspace service is the only process that resolves an identifier.** It reads `.rotaris/`, takes the
instance claim, opens the store read-write once at workspace open — which performs any write-ahead-log
recovery a crash left, and which ADR-0005 depends on happening before any `query_only` read — runs
migrations, and then hands the **resolved store path** to the run host. The run host never reads the
identifier file. One resolver means the two processes cannot disagree about which store a workspace is.

**`REQ-GIT-128`'s workspace integration lock is not in this table and is not in the store.** It stays the
file `<workspace>/.rotaris/integration.lock`, by the requirement's own ruling, because what it protects is
the base repository — the user's material, which does travel with the workspace — so a second machine
reaching the same checkout must meet the same lock. It is the one lock in the product that is not
machine-local. ADR-0005 owns it, and under ESC-21 it now also owns what happens where the workspace sits
inside a file-synchronisation agent's tree and exclusive create stops being exclusive — a hazard that
reaches that lock and, because of `REQ-SESSION-198`, reaches nothing in this store.

Six rules make the table binding. Rules 5 and 6 were added on 2026-09-02 against measurement — 5 was
carried inside rule 4 and is promoted because it turned out to be the load-bearing one, and 6 is new.

1. **No table has two writer processes.** Ownership is by table and it is structural rather than
   disciplinary: this is how `REQ-EVENTS-098`'s single-writer discipline survives the move. Holding the
   session's lock row is exactly the right to write that session's rows, and the run host is the only
   process that holds one. **Main never writes a session's record**, which is what ADR-0002 relies on.
2. **Ordering within a session is unchanged.** The run host serialises its own writes per session on the
   ordered queue ADR-0008 describes. A transaction makes several previously hand-enforced orderings free —
   `REQ-EVENTS-072`'s durable-record-before-wire-event and `REQ-TRACE-133`'s tombstone-before-artifact become
   "same transaction", `REQ-SESSION-028`'s all-or-nothing save becomes one commit, and `REQ-SESSION-133`'s
   "trim MUST take effect in the same durable operation that records the entry" becomes a `DELETE` in the
   inserting transaction — but **the obligations are still stated and still owned**. `REQ-EVENTS-072` says as
   much itself: where the store can make the record and the event one indivisible step it must, and where it
   cannot the ordering still binds.
3. **`journal_mode = WAL`, set at open, read back, and then *proved with a write*.** Readers never block
   the writer and the writer never blocks readers, which `REQ-EVENTS-098` states as a conformance property
   of the store and not as a preference. **Under this decision a failure to enable WAL is no longer an
   expected condition**: the store is on local per-user storage. It is therefore treated as a fault — the
   store is reported unopenable with the engine's own reason, on `REQ-SESSION-089`'s terms — rather than as
   the degraded read-only mode the superseded version specified. The read-only path is gone with the case
   that produced it.

   **The read-back stays, and this record's claim that it is sufficient is withdrawn as measured false.**
   The stated reason for it is real and confirmed: SQLite does silently keep the previous journal mode when
   WAL cannot be enabled, and the read-back catches that. It is **necessary and not sufficient**.
   Counter-examples were measured in which `PRAGMA journal_mode = WAL` **returns `wal`**, the read-back
   **returns `wal`**, the shared-memory file **exists at the expected 32,768 B**, the connection reports
   itself writable — and the next statement throws (`SQLITE_IOERR_IN_PAGE` on a mapped network drive;
   `SQLITE_CANTOPEN_ISDIR` where the shared-memory name is unavailable). **No pragma read can catch that.
   Only a write can.**

   So the open sequence is: set the pragma, read it back, then execute a **write probe** — one trivial
   statement that dirties a page, inside a `BEGIN IMMEDIATE` transaction that is rolled back. It leaves no
   row. Its cost is one short transaction on a path that already runs after first paint
   (`REQ-STARTUP-043`), bounded by the ordinary commit figures measured below (p50 179–220 µs). A store
   that fails the probe is unopenable and is reported as such.

   **The first thrown statement after a successful open is fatal and is never retried, and that is the
   whole point of the rule.** Measured: a WAL store opened over a mapped drive threw on the first
   `PRAGMA` in **30 of 30 opens**, and if the throw was swallowed, **6,000 of 6,000 subsequent commits
   succeeded with zero rows lost**. That is a 100 %-reproducible loud failure sitting in front of a store
   that appears to work, and the natural implementation — probe, catch, retry — runs fine and never reports
   it. That is the silent degradation `REQ-EVENTS-084` exists to forbid, reached by a route the load-error
   obligation above does not cover.

   **Where that failure belongs, decided here because nothing else draws the line.** `REQ-EVENTS-084`
   governs "opening the store only"; `REQ-EVENTS-088` governs a write that fails *during* a run. A
   first-statement failure after a clean open falls between them as written. **This record draws it at the
   probe:** the open, the pragma, the read-back and the write probe are one indivisible *opening* for
   `REQ-EVENTS-084`'s purposes, and its result is what `REQ-SESSION-089` reports. `REQ-EVENTS-088` begins
   only after the workspace service has declared the store open and handed the resolved path to the run
   host. The boundary is architecture-invented on a specification silence and is flagged as such in
   consequence 14.

   **`locking_mode = EXCLUSIVE` is refused, explicitly, so it is not re-derived as a fix.** It is the
   obvious remedy for an awkward filesystem, it is documented, and it was measured to make WAL work with no
   shared memory at all — reads and writes both, on local and UNC paths. It is nevertheless incompatible
   with this record: the process table above puts **two** writer processes on one store, exclusive locking
   mode requires the connection to be the only one accessing the database, and other connections then get
   `SQLITE_BUSY`. Recording the refusal is cheaper than re-deriving it under pressure.
4. **Every write transaction is short, and begins `IMMEDIATE`.** `BEGIN IMMEDIATE` takes the write lock up
   front, so two writer processes contend at the start and fail fast rather than deadlocking on an upgrade.
   `busy_timeout` is a small bounded value **and is never zero**: measured at zero against a
   rule-5-violating reader, **2,967 of 3,000 commits raised `SQLITE_BUSY`** — the run host could not
   persist and therefore, under `REQ-MONITOR-221`, could not publish at all — while the reader was starved
   in its turn, taking 97 `SQLITE_BUSY` in 98 attempts. Two processes thrash. The timeout's only job is to
   absorb contention from a *compliant* reader, which costs sub-millisecond (rule 5); at 5,000 ms every
   compliant condition measured produced **zero** `SQLITE_BUSY` and zero writer errors.
5. **The workspace service never holds a write transaction across a long read. Promoted to a rule of its
   own, because it is what keeps `REQ-MONITOR-218` true and it now has a number.** *(Stated inside rule 4
   until 2026-09-02; citations of "rule 4" for this prohibition resolve here.)* `REQ-TRACE-073`'s
   project-supplied regular expressions and `REQ-TRACE-225`'s deliberately unbounded engine read run
   **outside** any transaction and land their results in one short commit. The reason is `REQ-MONITOR-218`:
   a transcript row must be published with no delay of any size, it must be committed first
   (`REQ-MONITOR-221`), and a long write transaction in the other process makes that commit wait.

   **Measured, breaking this rule costs exactly what the rule says it costs.** A reader holding a 200 ms
   write transaction turned one of the run host's commits into **205.4 ms — 82 % of `REQ-MONITOR-222`'s
   entire 250 ms budget, in one commit, before the transport had done anything.** A 50 ms hold produced a
   61.8 ms commit. And a reader holding 200 ms write transactions back to back with no gap starved the
   writer indefinitely: 3,000 commits did not complete in 300 seconds and the run was killed. By contrast a
   **compliant** reader — reading all ~13,000 transcript rows back to back, 147–1,603 ms per pass, 47,695
   to 82,405 rows over the run — roughly doubled the writer's median commit and tripled its p95 (163.6 →
   345.9 µs p50, 271.7 → 898.9 µs p95) with **zero errors and zero `SQLITE_BUSY`**, and never blocked it.
   The difference between those two readers is this rule. It is load-bearing, not hygiene.

   **This is also the one way the product can manufacture the delay floor `REQ-MONITOR-218` forbids.** The
   requirement bans a floor "of any size"; nothing on the publish path applies one, and the commit is work
   rather than waiting. A second process holding a write transaction converts the commit into a wait of
   exactly that transaction's length — a floor the product did not choose but a user would experience.
6. **One store, one canonical path spelling, resolved once. New, and it exists to prevent a measured
   silent-loss mode.** Where one database file is reached through two different spellings — a UNC path and
   a mapped drive letter, a substituted or symlinked path and its target, two casings on a
   case-insensitive filesystem — the two openers do not share one write-ahead-log index, and the result is
   **silent partial loss with a clean `integrity_check`**: 20 of 20 trials wrong, 11 losing rows while both
   writers reported full success, and in the reader's view **18,776 polls in which a reader never once
   observed the other writer's commits**, with 55 of 800 rows surviving. That is `REQ-EVENTS-098` failing —
   "the writer MUST NOT be able to make a reader fail" is not what breaks; what breaks is that the reader
   and the writer are not looking at the same history at all, and nothing reports an error. It needs no
   second machine.

   The topology above already prevents it, and until this revision it prevented it **by accident**. Stated
   as intent: the workspace service is the only process that resolves an identifier, and the path it hands
   the run host is a **fully canonicalised** one — mapped network drive letters unmasked to their universal
   name, drive substitutions and symbolic links and junctions resolved, case normalised where the
   filesystem is case-insensitive. **No other process derives a store path**, from the identifier or from
   anything else, and no store path is accepted from configuration or the environment — which ESC-19's
   refusal of a configurable location already forbids for a different reason. The store's `-wal` and `-shm`
   are opened by the engine relative to the database path, so one canonical database path is sufficient for
   all three files.

   **And a resolved store path that is not machine-local is refused rather than opened.** `REQ-SESSION-198`
   requires the store to be "held in this machine's own per-user storage, never anywhere the workspace's
   own location may be synchronised or shared from"; a per-user local data directory that resolves to a
   share or sits inside a synchronising client's tree is that requirement's premise failing, and the
   product must not proceed on a premise it can cheaply check. The check is the same pair of platform calls
   `REQ-STARTUP-166` already requires for the workspace, run once at store resolution against the
   **store's** path, and measured at p50 0.10–1.83 ms and p95 ≤ 2.87 ms. The refusal is on
   `REQ-SESSION-089`'s terms, naming the resolved path and what was detected, and it states that the store
   location is not configurable so the remedy is the user's environment.

   Three things about that refusal are stated rather than left to be discovered. It is a **different
   determination** from `REQ-STARTUP-166`'s, which is about the workspace directory and drives a warning
   about the user's own files; this one is about the store's own directory and drives a refusal, and
   confusing the two would put a refusal on the wrong path. The classification has a **blind spot** — it
   sees synchronisation clients that register with the platform's sync-root API and is blind to a folder
   replicated by a scheduled copy job, which is indistinguishable from an ordinary directory — so the
   refusal is a floor and not a guarantee, and rule 6's canonicalisation is what defends the case the
   classification misses. And it is **reversible**: if the refusal turns out to fire on a configuration
   users legitimately have, the alternative is the same detection driving a warning, and the argument for
   refusal is that the failure it prevents is silent, passes every integrity check, and destroys the store
   outright in the write-back direction (4 of 4, zero errors reported).

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

**And OQ-47's copied-folder direction is not closed by this.** The previous version noted that the same
dead end is reached from two independent routes — a restore into a re-cloned workspace, and two copies of
one folder — and that reaching it twice was evidence. ESC-26 answers the restore route only, deliberately
and in terms: the exception exists "only inside the restore action. No other path gains it — not workspace
open, not repair, not a migration, not a future convenience." A user who copies a folder and wants the copy
to have an identity of its own still has no product action, and OQ-47 stays open on that side.

**Then the target store.** Cases (a) and (b), and case (c) under outcome 3, all end holding the artifact's
identifier; case (c) under outcome 2 ends holding it without the workspace pointing at it, which changes
what the user is told and nothing about what follows here. A store for that identifier either exists on
this machine or does not.

**It does not exist.** The store directory is created and the artifact's contents written into it — the
same operation as an ordinary first open of an identifier, with contents. Nothing is displaced and there is
nothing further to decide.

**It exists, and merge is not offered at all.** `REQ-SESSION-201` forbids a restore that combines an
artifact with an existing store, and requires that neither a session present only in the target nor one
present only in the artifact changes state without that having been stated first. This record goes further
than "not silently": **there is no merge, silent or stated, and that is a decision rather than an
omission.** Session ids are never reused (`REQ-SESSION-012`), so two stores can only collide on a session
in exactly one situation — a backup and the store it was taken from, where the target has since recorded
*more* of the same sessions. Merging those means reconciling rows inside one session between two divergent
histories, and there is no correct answer: the result is a session neither the artifact nor the target ever
recorded, which is the requirement's own "an artifact that restores to a store no run could have left
behind", produced by the restore instead of by the backup. A merge would be a feature every use of which
is its worst case.

**So a restore is whole-store replacement, and the choice the user is given is what becomes of what is
there now — where the answer is never deletion.** The displaced store is **moved aside, renamed with a UTC
timestamp, and kept.** That is this record's existing rule — the application never deletes a store and
never repairs one in place — applied to a second operation, and under SR-9(b) it is not merely tidy: a
store the restore deleted is history that existed nowhere else, and the user was mid-recovery when they
lost it. Before confirming, the user is told: the artifact's workspace identifier, when it was taken, how
many sessions it holds, how many the target holds, that the target's store is set aside rather than
deleted and where it goes, and how many sessions will arrive needing repair (below). A user who restores
the wrong artifact has then lost nothing.

It also feeds a surface this record already owes rather than creating a new leftover kind: a displaced
store is a store nothing points at, which is exactly what the reclamation surface below exists to show.

**Lock rows are corrected on the way in, and ADR-0005 owns the rule.** `REQ-SESSION-201` requires the
backup to be valid while runs are live, so an artifact routinely carries lock rows for sessions that were
mid-run. Rows whose `host` is not this machine are **dropped**; rows naming this machine are kept. A
dropped row costs nothing: the session's `execution_status` still asserts a run, so with no lock it is
**stale** by `REQ-SESSION-057` and the ordinary explicit repair settles it to `interrupted`, which is what
in fact happened to it. Keeping them would instead make every such session report live and unreapable
forever on any machine but the original (`REQ-SESSION-056`, `REQ-SESSION-047`), needing
`REQ-SESSION-183`'s explicit release once per session. The count is disclosed in the pre-restore summary,
so the correction is stated and not silent.

**The swap, and the one window that is not atomic.** No connection may be open on **either** directory a
rename touches — not the one being renamed, and not the one being renamed onto. *(Corrected 2026-09-02. The
rule read "No connection may be open on the target while it is replaced", and that phrasing is precisely
what let the whole mechanism fail: the staging store is not the target until the rename it is blocking has
happened, so the rule was satisfied and the restore still could not complete. See step 7.)* The Windows
writer-handle spike is the evidence for files — a rename over a file with a held descriptor failed in every
one of 115 attempts, and here there are three such files (`workspace.db`, `-wal`, `-shm`) across two
processes. `../spikes/backup-restore-mechanism.md` is the evidence one level up: a **directory** holding a
single open handle cannot be renamed at all, 0 of 30 in every shape tried — a plain descriptor, a connection
in this process, a connection in another process, and a process's current directory alike.

**The order below is the mechanism, and several steps exist only because of where they sit. It has now been
run, and the three things it got wrong were all orderings and omissions rather than predicates. A
reordering that reads more tidily is the failure this section has already had.**

1. The workspace service tells the run host to **refuse new runs** against this identifier. Only that; the
   close is not asked for yet, because a close must not be asked of a run that liveness has not yet cleared.
2. **Liveness is judged, with the refusal in force** — gate 3's predicate, against the target store, on the
   workspace service's own still-open connection. If any session is live the restore is abandoned here, by
   4a, with nothing moved.
3. The run host **closes its connection** for this identifier and acknowledges (ADR-0002 consequence 11).
   The workspace service still holds its own.

   3a. **That acknowledgement is bounded, and the bound's expiry refuses the restore rather than
   proceeding without it.** *(Added 2026-09-02, defect D3.)* As written, steps 1 and 3 stated the
   acknowledgements and neither stated a deadline; measured twice — the run host deaf, and the run host
   exited without answering — the workspace service produced **no result and no error inside a 15,000 ms
   watchdog**, while the application kept running and a window kept painting. A user sees a restore that
   never finishes and never fails, which is the one outcome worse than a refusal. The bound is **2,000 ms**
   from the instruction being sent, which is three orders of magnitude above the acknowledgement's measured
   cost and is a deadline for a process that has stopped answering rather than a budget for a slow one.

   **Expiry takes 4a and nothing else.** This is the whole of the correction and it is not obvious: a bound
   alone makes the defect worse, not better. Measured with a 2,000 ms bound and the service proceeding on
   expiry, step 9's rename failed `EPERM` — because the connection the run host never closed is still open
   on the directory being renamed onto — so the restore failed later, after mutation, in the one place this
   mechanism has no good failure. **An unanswered close is indistinguishable from a run host still writing,
   and must be treated as one.** The refusal names the run host as unresponsive rather than naming a live
   session, because what is known is that the question was not answered.

   3a-measured. *(`../spikes/corrected-restore-rerun.md`, 2026-09-02.)* Against a run host that
   acknowledges the refusal and then ignores the close entirely, the bound terminated the action in
   **2,008–2,020 ms** in 10 of 10, **refused** in 10 of 10, left the target byte-identical in 10 of 10 and
   left no staging copy behind. Against the same condition without the bound, spike 22 measured no result
   and no error inside a 15,000 ms watchdog.

   3b. **The run host's refusal to start runs is a lease, not a state it enters.** *(Added 2026-09-02, the
   other half of D3.)* Step 4a releases the run host on a refusal the workspace service reaches, and that
   is not enough, because the measured dual failure has no workspace service left to reach it: kill the
   workspace service after step 3 and **the run host stays closed and refuses every launch for ever, with
   the store held by nobody and nothing in the sequence that would ever clear it.** So step 1's instruction
   carries an expiry the run host itself enforces — **30,000 ms**, generous against the whole action's
   measured 2.67 s at 313 MB — after which the run host resumes accepting runs on its own. The workspace
   service renews it if a restore is genuinely still running. The asymmetry is deliberate: a restore that
   takes longer than expected is renewed and costs nothing, and a workspace service that has died releases
   the workspace by doing nothing at all, which is the only behaviour available to a process that is gone.
4. **Liveness is judged a second time**, after that acknowledgement and before the workspace service gives
   up its own connection — which is the only place it can be judged, because judging it needs an open
   connection and step 5 closes the last one. **This is the evaluation the swap rests on.** Step 1's
   instruction is not instantaneous: until the run host acknowledges, launches are still being admitted, and
   a run admitted in that window holds a lock and is mid-write. Measured, that run's session and all of its
   rows were destroyed by the swap. Here it is caught instead, at a cost of 3.1 to 3.8 ms.

   4a. **If either evaluation refuses, the restore is abandoned before any mutation** — nothing renamed,
   nothing expanded, nothing written, the target store byte-identical — the refusal names the sessions found
   live, and **the run host is released**: told that it may accept runs again and, if step 3 has already
   closed it, told to re-open. The release is not optional and is not tidiness. A run host left closed and
   refusing is a workspace in which no session can ever start again, with the store held by nobody and
   nothing in the sequence that would ever clear it; that state has been measured, from the other direction,
   and it persists for the life of the instance.
   4-measured. *(`../spikes/corrected-restore-rerun.md`, 2026-09-02, discharging IC-1.)* A run admitted
   inside step 1's window, taking its lock **after** step 2 had already passed and before step 3
   acknowledged — the exact position of the run spike 22 measured being destroyed. **The second evaluation
   caught it in 30 of 30**, at 0.23 / 0.42 / 1.27 ms; the restore abandoned in 30 of 30; the sessions
   already in the store were unchanged in 30 of 30; no displaced store and no staging copy were left behind
   in 30 of 30; **the raced session and every row it had written survived in 30 of 30**; and step 4a's
   release returned the run host to accepting runs, with its store re-opened, in 30 of 30. **The
   counterfactual is what makes this evidence**: the identical race against the mechanism with step 4
   removed completed the restore in 10 of 10 and destroyed the raced session and all of its rows in 10 of
   10. Step 4 is not defence in depth; it is the step that does the work.

   3b-measured. *(`../spikes/corrected-restore-rerun.md`, 2026-09-02.)* With the run host told to refuse,
   its store closed, and the workspace service then dying with nothing left to release it: a launch was
   refused while the lease held in 10 of 10, **accepted once the lease expired in 10 of 10**, and the run
   host re-opened the store by itself in 10 of 10. Spike 22 measured this state persisting for the life of
   the instance. The lease is the exit.

5. The workspace service **closes its own connection**. Both closes are now acknowledged and nothing has
   moved.
6. The artifact is expanded into a sibling staging directory in the same parent, in full, and **arranged
   into the store's own layout there** — the container's names are the container's and the store's names are
   this ADR's, and step 9a states what that conversion covers. The expanded store is then **opened
   read-write once there** — which performs any log recovery and lets the integrity check run against the
   thing that will actually be used rather than against the copy inside the container. That reason is
   unchanged, and it is why the open is deliberate rather than incidental. *("In full" originally stood
   alone here and step 9 renamed the result into place; read exactly as written that installs the
   container's layout as the store's. See step 9.)*
7. **The staging connection is closed.** *(Added 2026-09-02. Without this step the restore fails in 30 of 30
   attempts and the feature does not work at all.)* Step 6's open is what makes step 9 impossible: staging is
   the directory step 9 renames, and on this platform a directory holding an open handle cannot be renamed —
   `EPERM`, 30 of 30, against 30 of 30 succeeding with the connection closed first. This is ADR-0004 rule 1
   one level up: replace-by-rename "fails against *any* open handle on the target", and the reason the rule
   above did not reach it is that staging is not the target yet. The close is also what makes the directory
   renameable rather than merely tidy — measured, an open store directory holds `workspace.db`, `-shm` and
   `-wal`, and only after a clean close does it hold `workspace.db` alone. **This step is not hygiene and
   not redundant with step 5. Deleting it as a duplicate close reproduces, exactly, the defect that made this
   mechanism fail every time it was run.**
8. `<identifier>` → `<identifier>.displaced-<UTC timestamp>`. **The timestamp is milliseconds, and the
   rename onto that name is itself the claim.** *(Granularity stated 2026-09-02, defect D6; the claim
   corrected from "an exclusive create" on the same date after measurement.)* At second granularity two
   displacements inside one second collide and this step fails `EPERM` in **30 of 30** — a one-word omission
   that stops the mechanism dead. Milliseconds do not make a collision impossible, so **the granularity is
   not the guarantee**: where the rename fails because the name is taken, a decimal counter is appended and
   the claim retried, up to a small fixed number of attempts, after which the restore is refused with nothing
   moved. **A name assumed unique is not unique**, and this is the same rule ADR-0004 applies to any other
   name the product mints. **No separate create is needed and none should be added** —
   `../spikes/corrected-restore-rerun.md` measured that a directory cannot be renamed onto an existing
   directory here, so the rename fails on a taken name rather than merging into it; writing this as a create
   invites a create-then-rename pair, which has a gap between its two halves that the single rename does not.
   **The counter is the load-bearing half.** Forced to collide, the corrected name needed the counter in
   **30 of 30** and kept both displaced stores, openable and distinguishable; the pre-correction name —
   second granularity, bare rename, no counter — failed `EPERM` in **30 of 30** and lost a displaced store
   every time. The
   stamp's granularity binds every name of this shape in this record, not only this one: the recovery
   ladder's displaced store and the reversal's `.obstruction-` aside both reuse it deliberately, so it is
   fixed once here and inherited rather than restated three times and drifting.
9. staging → `<identifier>`. **What is renamed is a store in the store's layout, which is not the layout the
   artifact carries.** *(Corrected 2026-09-02, defect D7.)* Step 6 said the artifact is expanded "in full"
   and this step made the expansion the store, which — read exactly as written, and it was — produces a
   restored store holding `store.db` where the layout block fixes `workspace.db`, with `manifest.json`
   sitting inside the live store after every successful restore. The container's layout is the container's,
   the store's layout is fixed by this ADR, and **the restore converts between them rather than assuming
   they are the same**: staging is arranged into the store layout before this rename, the manifest and
   anything else belonging to the container stay outside the store, and the rename installs a directory that
   is already a valid store. The measured harness had to insert this conversion as an unspecified step to
   proceed at all, which is the plainest possible evidence that the record was missing one.

   9a. **`origin.txt` is written by the restore, because it is correctly not in the artifact.** The store's
   record of which project it belongs to is machine-local metadata and the backup is right to exclude it —
   but nothing put it back, so it was absent from **every** restored store, and it is the reclamation
   surface's only means of saying which project a store belongs to. A restore that produces a store the
   reclamation surface cannot describe has produced an orphan on the recovery path. It is written from the
   workspace the restore was initiated for, before step 9's rename, so the installed directory is complete
   at the moment it becomes the store.
10. Both processes re-open; migrations run in the workspace service exactly as at any other open; the run
    host is told the workspace is open again and may accept runs.

**Steps 8 and 9 are two renames and no platform offers a primitive that makes them one. The record says so
rather than implying atomicity.** What a reader observes between them is that the store directory is
**absent** — now measured, in 20 of 20 observations that caught the gap, which is 3 to 5 ms wide at every
store size from 68 KB to 313 MB, and never once anything mixed — and this record already fixes what that
means: a workspace for which this machine holds no store lists no sessions, which `REQ-SESSION-043` makes an
ordinary state and not an error. So the worst observable in the gap is an empty list, in a window whose
store is closed anyway; it is not a corrupt store and not a half-restored one, which is what the requirement
actually forbids.

**The reversal, rewritten 2026-09-02, because as written it failed in exactly the case it exists for.** If
step 9 fails after step 8 succeeded, step 8 is reversed before the failure is reported. This record
previously made that reversal a single rename of `<identifier>.displaced-<stamp>` back to `<identifier>` —
and step 9 has two failure families: a handle held inside staging, which leaves the target name free, and
**an occupied target name**, which does not. In the second family the reversal renames onto the very name
whose occupancy failed step 9, and it fails with the identical error. Measured, `EPERM` both times, and the
end state was a store directory holding no database, the real store sitting under a timestamped name, and
the workspace service's re-open throwing `unable to open database file`. **This record had written "if the
reversal also fails" as though it were a rarer, independent event. It is neither: on this platform the two
failures are the same failure, and the family that guarantees both is half the failure space.**

**So the reversal takes the same displace-then-rename shape the forward path already needs on this
platform.** It is two renames for the same reason steps 8 and 9 are two:

  R1. If `<identifier>` exists, it is renamed aside to `<identifier>.obstruction-<the same UTC timestamp
  step 8 used>`. The same stamp deliberately: the two leftovers of one failed restore are then legible as a
  pair, and the reversal mints no second name whose freshness would have to be argued separately. The
  obstruction is kept, never deleted — the product does not know what it is, and this record's rule that the
  application never deletes a store applies with more force to a directory it cannot identify.

  R2. `<identifier>.displaced-<stamp>` → `<identifier>`, which now renames onto a name that does not exist,
  and a rename onto a free name succeeded in 30 of 30 attempts.

**The rule this is an instance of, written out because it generalises past this mechanism: a reversal must
be at least as robust as the step it undoes.** A reversal that works only when nothing went wrong is not a
reversal — it is a second copy of the failing step, sharing its assumptions, and it will be exercised for
the first time on the one day it is needed. Anything added to a forward path to survive this platform
belongs in the path that undoes it.

**The reversal has now been run against the case it exists for, and it holds.**
*(`../spikes/corrected-restore-rerun.md`, 2026-09-02, discharging IC-1.)* With the install rename forced to
fail on an occupied name — the family in which the old reversal failed with the identical error —
displace-then-rename returned the target store **byte-identical in 30 of 30**, re-openable in 30 of 30, and
reached a store directory holding no database in **0 of 30**. R1 cost 3.15–3.75 ms and the whole reversal
6.43–7.36 ms. The counterfactual was run in the same harness: the single-rename reversal failed `EPERM` in
10 of 10 and reached the forbidden end state in 10 of 10, with the error naming both paths each time. **Two
leftovers, not one, were observed on every corrected run**: the `.obstruction-` aside this reversal mints,
which is intended and kept, and the staging copy, which is defect D5 and is still open.

**And the end state that must not be reachable, named so that it is testable: a store directory that exists
and holds no database.** The old reversal produced precisely that, in 20 of 20 observations, and it is not a
gap of milliseconds but the durable state the user is left in — it survives the failure, the re-open and the
restart. `REQ-SESSION-043` fixes what an *absent* store directory means and no requirement fixes what a
present, empty one means, so every reader in the product would meet a state nothing describes and nothing
was written for. R1 removes it: after a reversal the store directory either holds the store or does not
exist, and those are the only two states this record admits.

**The last resort survives untouched, because it is what stands between a failure and a lost store.** If R1
itself cannot run — the obstruction holds a handle of its own — the failure names both directory paths so a
person can finish a rename the product could not. That text was specified before it was ever run, it worked
when it was, and it was the only reason the measured end state was recoverable by hand at all.

**Two things a restore never does.** It never runs by itself — not at startup, not on finding an artifact,
not as a repair, and **not as a step of the recovery ladder below**, which may *name* it as a remedy the
user can choose but may never perform it. And it never reads an artifact except as part of a restore the
user asked for, so nothing scans for artifacts or offers to use one it noticed.

**And one thing nothing else in the product may ever do, which is the containment ESC-26's exception rests
on.** *No other path establishes a workspace identifier over one the product can read.* Not workspace open,
not the repair action, not a schema migration, not the recovery ladder below, not the reclamation surface,
not a store-not-found condition, and not a later convenience that would "just fix it up". Case (b)'s
exclusive-create mint stays available everywhere, because it replaces nothing; **replacement is confined to
one confirmed choice inside one user-initiated action.** This is written as a prohibition on the rest of
the product rather than as a permission for the restore, because that is the direction it will be tested
in: the next reader meets an identifier that does not match a store they can see and reaches for the write
that would resolve it, and the answer is no, everywhere but here. The reason is the one ESC-19's survey
supplies — three comparable products carry a filed, reproduced, painful defect where a folder rename
orphans a user's sessions, and `REQ-SESSION-197` is what keeps this product out of it.

### Corruption domain, and recovery for a store nobody backed up

**Stated plainly: one file per workspace is one blast radius.** Under the file design a torn write cost one
session, or one document inside one session; under this decision it can cost every session in a workspace,
together with that workspace's delivery records and improvement library. That is a real reduction in fault
isolation, accepted for the ruling's benefits, and it is bounded four ways.

1. **Scope bounds it to one workspace.** Other workspaces are separate files in separate directories.
2. **The user's own material is never in it.** Requirement documents, baselines, the generated artifact and
   the retired-identifier log are files in the user's repository (`REQ-TRACE-513`); configuration, personas
   and model slots are files (`REQ-CONFIG-477`); credentials are individually protected files
   (`REQ-PROVIDER-016`); artifact, attachment and image bodies are files referenced by row
   (`REQ-LIBRARY-087`, `REQ-SESSION-002`). A destroyed store costs the record of what the product did. It
   never costs work the user authored, and the artifact bodies outlive the index that named them.
3. **A pre-migration copy exists** for the one operation most likely to cause the damage. See schema
   evolution.
4. **The exports are the user's own readable copy, and `REQ-SESSION-201`'s backup is the restorable one.**
   *(Corrected 2026-09-02: this consequence read "and under SR-9(b) they are now the **only** one", which
   the paragraph below already withdraws. The two statements contradicted each other on one page.)* See
   below.

**What SR-9(b) changes about all of this.** A machine-local store is not in the user's backup of their
workspace. Backing up the project folder, pushing it to a remote, or letting a sync client replicate it
captures the repository, the configuration and the workspace identifier — and none of the session history.
On macOS a whole-machine backup does reach the per-user data directory; on Windows and Linux a
workspace-scoped backup does not, and the ordinary user has only the former by accident. Two consequences
follow and are stated rather than assumed.

- **The exports' role, corrected.** `REQ-EVENTS-166`, `REQ-SESSION-189`, `REQ-EVENTS-172`,
  `REQ-SESSION-199`, `REQ-LIBRARY-176` and `REQ-TRACE-514` were minted so a user could read their own
  records without this application. The previous version of this record went on to say they were "now also
  the only user-controlled durable copy of those records". **That is no longer true and must not be
  cited:** `REQ-SESSION-201`'s backup is a user-controlled durable copy, and it is the one that restores.
  What survives, and is the useful half, is that an export is *readable* where a backup is not, and that
  `REQ-SESSION-199` and `REQ-SESSION-201` each forbid being collapsed into the other. Both are needed and
  neither is the other's fallback.
- **The recovery ladder may not assume a copy exists.** Every step below is written on the assumption that
  what is in front of the user is the only copy there has ever been. A backup **may** exist, and the ladder
  may say so — but it may not look for one, may not restore one, and may not be built on the assumption
  that a user took one, because `REQ-SESSION-201` forbids a restore happening "as a repair" and nothing
  makes taking a backup mandatory.

**Detection, and its limit.** After an unclean shutdown the workspace service runs `PRAGMA quick_check` at
open, which is bounded, alongside rule 3's write probe — the probe establishes that the store is *usable*
and the check that it is *intact*, and neither substitutes for the other. **Neither establishes that it is
complete**: consequence 15's silent-loss mode leaves a store that passes `integrity_check` and is simply
short. A full `PRAGMA integrity_check` is available only from an explicit user action, because it is
O(store) and must never sit on an open path — and the packaged-first-paint spike puts the whole pre-paint
budget on the passing artifact flavour at a few seconds against `REQ-STARTUP-155`, which is not a budget an
O(store) check belongs in. Store opening runs in the workspace service after the window is shown, on
`REQ-STARTUP-043`'s post-show activation, so it delays neither first paint nor the moment the interface
accepts input.

**Recovery, in order, and it never destroys anything.** On a store that will not open or fails
`quick_check`:

1. **Report the workspace store as unopenable**, naming the store path and the engine's own error unaltered
   — `REQ-EVENTS-084` requires exactly that of the run refusal, "so a user can act on the actual cause" —
   and never a generic failure.
2. **Offer salvage first**, attempting SQLite's own recovery over the damaged file **into a fresh store**,
   and reporting what it could not read. This is offered before anything else because it is the only step
   that can return history, and there is no backup behind it.
3. **Offer the exports of what salvage recovered**, before the user is asked to accept the loss of the rest.
4. **Offer to move the damaged store aside**, renamed with a UTC timestamp, and start an empty one, stating
   in terms that the sessions in it will no longer be listed and that this machine holds no other copy —
   which is the same displacement a restore performs, so a store set aside by recovery and one set aside by
   a restore are the same kind of leftover and are reclaimed the same way.
5. **Name the restore as a remedy the user may take, and do not take it.** Where a user holds a
   `REQ-SESSION-201` artifact for this workspace, restoring it is the one action that returns history this
   ladder cannot. The ladder therefore says so — after step 2's salvage, because salvage returns *this*
   store's history and a backup returns history as of when it was taken. It **must not** look for an
   artifact, must not offer one it noticed, and must not restore anything itself: `REQ-SESSION-201` forbids
   a restore "as a repair" in those words, and a repair path that restores on a user's behalf is exactly
   the silent, whole-store overwrite the requirement's explicitness rules exist to prevent.

**The application never deletes a store and never repairs one in place.** That is the same instinct as
`REQ-CONFIG-192`'s "neither is rewritten, migrated in place, or deleted", applied one level up, and under
SR-9(b) it is no longer merely tidy: a store the application deletes is history that existed nowhere else.

### Reclaiming a superseded store

Machine-local storage accumulates. Three kinds of leftover exist and are handled differently.

**A pre-migration copy** is reclaimed by the product itself, at the next clean open at the migrated version.
It is the one leftover with a definite end of life.

**A store nobody references any more** — the user deleted the workspace folder, or replaced its identifier —
is reclaimed **only by an explicit, user-confirmed action**, from a surface listing the stores this machine
holds with each store's last-seen workspace paths (`origin.txt`), its size, its session count and when it
was last opened. Deletion offers the exports first. **ESC-26 gives this kind a second and now
product-driven source**: a restore that establishes the artifact's identifier over the workspace's leaves
the store recorded under the old value intact and unreferenced. It is listed here like any other, and
because it is intact rather than displaced, re-creating the old identifier value in `.rotaris/` by hand is
a complete undo — which is why the confirmation shows that value.

**Automatic reclamation is refused**, and the reason is the whole point of ESC-15. The only signal available
is that a store's last-seen path no longer resolves — and a path fails to resolve when an external drive is
unmounted, when a share is down, and, above all, **when the folder has been moved**, which is precisely the
case the identifier exists to survive. Reclaiming on that signal would delete a user's history to punish
them for the operation the design was built to support. Age is no better: `REQ-SESSION-043` makes a workspace
that has not been run here an ordinary state, and ESC-9 already ruled retention unbounded.

This needs a specification surface it does not currently have; it is listed in this record's open items.

### Schema evolution

**1. Record payloads keep their own version field, unchanged.** Where a requirement fixes a `schema_version`
inside a record it stays a column on that record's row and is read exactly as specified.
`REQ-CONFIG-192` is carried verbatim: a delivery record whose `schema_version` exceeds the supported version
is reported as unsupported and not interpreted, is not rewritten, migrated in place or deleted, its
neighbours read normally, and the condition is reported in the three places the requirement names — the board
showing that requirement's delivery history as unavailable *for that reason*, the session log, and any
surface that reads delivery records — and "a workspace holding an unsupported record still opens and still
runs". A row is a better home for that rule than a file was, because skipping one row is cheaper than
skipping one file. `REQ-SESSION-013`'s persisted-state version is likewise a column, and `REQ-SESSION-038`'s
refusal of a higher version is a row-level refusal.

**2. The table schema is versioned by `PRAGMA user_version`, and migrations are forward-only.** Numbered
from 1, each migration is a single statement sequence inside **one transaction**, so a migration either
completes or leaves the previous schema in force; a half-migrated store cannot exist. Migrations run **only
in the workspace service**, at workspace open, **before the run host is told the workspace is open** — so no
second process is ever inside a schema change. The run host refuses to open a store whose `user_version` is
not the one it was built for; it does not migrate and it does not wait.

**Before any migration runs, the store is copied** with `VACUUM INTO` to `workspace.db.pre-<n>.bak` beside
it, kept until the next clean open at version `n`. This is the answer to the blast-radius question for the
one operation most likely to cause the damage, and under SR-9(b) it is the only copy that will exist. **A
copy that cannot be written aborts the migration**: the workspace opens at the old version with the reason
stated, rather than migrating without a way back.

**Downgrade, and a store newer than the application, are the same case with the same answer.** When
`user_version` exceeds the version this build supports, **the application refuses the store**: it does not
migrate downward, does not guess which columns it still understands, and **writes nothing to it** —
including no `user_version` — so a store opened by a newer build and then by an older one is returned
untouched. The refusal names the store path, the version it carries, the version this build supports, and
the one remedy: update the application. Downward migrations are not written, ever; the cost of maintaining a
reverse for every schema change is paid on every change and redeemed almost never, and a wrong one silently
destroys history.

**The workspace still opens.** Refusing the store refuses the *rows*. Configuration, personas, model slots,
the requirement documents, the generated artifact, the baselines, the retired-identifier log and the
credentials are all files (`REQ-CONFIG-477`, `REQ-TRACE-513`, `REQ-PROVIDER-016`) and are all still readable
and editable; version control is unaffected. A user who opens their project with an older build sees their
material and cannot see their session history — not a workspace that will not open.

**The honest cost, stated because it is a genuine regression.** Under files, one unsupported record sat
uninterpreted while its neighbours read normally — that is `REQ-CONFIG-192`'s whole point, and it is
preserved for records. Under a store, an unsupported **table schema** stops every row in the workspace at
once. Forward tolerance that was per-record for payloads is per-store for structure. Nothing recovers that;
it is inherent to having a schema, and it is why migrations are additive by policy: **a migration adds
tables and adds nullable columns, and does not drop or retype a column an older supported build reads**, so
`user_version` rises less often than the schema changes.

### What is not in the store

Repeated here because this is the file a reader will open to ask. The configuration a user edits, which
`REQ-CONFIG-477` now states as a boundary with four independently sufficient grounds; personas and model
slots; the requirement documents, the generated symbol artifact, the three baselines and the
retired-identifier log, which `REQ-TRACE-513` states as a boundary of its own; global configuration, the
discovery snapshot and desktop preferences, which are per-user and outlive any workspace; artifact,
attachment and image **bodies**, which are files beside the store, referenced by row, and **never blobs**
(`REQ-LIBRARY-087`); provider credentials, which stay individually protected files because
`REQ-PROVIDER-016` requires `0600` plus an explicit Windows access-control list, read back, and no row makes
that guarantee; the session's human-readable summary and the session's log, which exist to be read by a
person (`REQ-SESSION-006`, `REQ-SESSION-140`, `REQ-SESSION-142`, `REQ-SESSION-191`) — *the path
`evidence/debug.log` this record previously named here is withdrawn and must not be cited: it belonged to
the session-directory layout domain 18 carried, `REQ-SESSION-142` now names only "the session's log,
which is a file", and `REQ-SESSION-002` closes the per-session set at three **kinds** and fixes no
filenames*; the workspace identifier
itself (`REQ-SESSION-197`) — a store cannot hold the thing that names it; and `REQ-GIT-128`'s integration
lock, which is a file in the workspace on purpose.

**And the backup artifact of `REQ-SESSION-201` is not in it either, in the other direction.** It is written
where the user chose, it is never read back in place of the store, and nothing the product does consults it
except a restore the user asked for. `REQ-SESSION-201` says so itself, and adds that it does not collide
with `REQ-SESSION-028`'s ban on a second whole-state copy: that rule governs what a *save* writes and
forbids the product keeping a duplicate the store could disagree with. The artifact is not kept, is not
maintained, and is not consulted — so there is nothing for the store to disagree with.

## Consequences accepted

1. **A native module returns**, with an Electron-ABI rebuild per version and architecture and asar
   unpacking. ADR-0054 and ADR-0056 already carry that obligation for `node-pty`; this widens it rather than
   creating it.
2. **Two writer processes share one write lock. Now measured, and the price is smaller than the rule that
   bounds it.** Contention is real, bounded by rules 4 and 5, and it is the price of SR-4's
   one-per-workspace scope. A **compliant** heavy reader in the other process — reading all ~13,000
   transcript rows back to back, 147–1,603 ms per pass — roughly doubles the writer's median commit and
   triples its p95 (163.6 → 345.9 µs p50, 271.7 → 898.9 µs p95), with **zero errors, zero `SQLITE_BUSY`
   and no blocking**, and the absolute figure stays under a millisecond. That is contention this design
   absorbs. A **non-compliant** one — a write transaction held across the read — produces the 205.4 ms
   commit in rule 5 and, held back to back, starves the writer indefinitely. So alternative G's two-store
   split is **not triggered**: the measured cost of sharing is sub-millisecond, and the failure mode that
   would justify the split is a rule violation rather than a property of sharing. G stays available for the
   case the *Revisit if* names — a workspace-service write pattern that genuinely needs long transactions.
3. **The superseded record's consequence 3 is withdrawn.** "A workspace on a network share or in a
   cloud-sync folder is degraded, not merely slow" is **no longer true and must not be cited**:
   `REQ-SESSION-198` requires such a workspace to be fully usable, and it is, because the store is not there.
   What replaces it is smaller and different: the user is *warned* about shared or synchronised storage by
   `REQ-STARTUP-166`, and the warning is about their own files and about a second machine working in the
   same folder — not about this store.
4. **A machine-local store is not in the user's backup of their workspace** (SR-9(b)). This is the largest
   new user-visible property in this record, and the specification has since closed the two holes the
   previous version listed as owed. **Its statement that "the requirement SR-9(b) minted for that
   disclosure is not in the specification" is withdrawn and must not be cited**: `REQ-SESSION-200` exists,
   fixes what must be named as outside a workspace backup and what is carried, requires both remedies to be
   named, requires it to be reachable in the ordinary course of managing sessions (`REQ-SESSION-182`), and
   forbids it being delivered only inside a failure message. Its statement that the exports "become the
   only user-controlled durable copy" is withdrawn too: `REQ-SESSION-201` is that copy. What is left as a
   consequence is the plain fact — the store does not travel with the workspace — and the obligation that
   the recovery ladder still assumes no copy exists, because taking a backup is not mandatory.
5. **Storage the product owns accumulates outside the workspace, and only the user may reclaim it.** A
   deleted project leaves a store nothing points at. Automatic reclamation is refused for the reason above,
   so an inspect-and-delete surface is owed, and it **still** does not exist in the specification (OQ-48).
   ESC-19 has made it more owed, not less: a restore displaces the store it replaces rather than deleting
   it, and the corruption ladder does the same, so the two operations most likely to be used by a user in
   trouble both produce leftovers only this surface can clear. **ESC-26 adds a third producer and a third
   shape** — a confirmed identifier establishment leaves the old identifier's store intact and merely
   unreferenced — so the surface is now the only route back to a store a user may well want, rather than
   only the only route to clearing one they do not.

   > **Corrected 2026-09-03. This consequence is the one that tracks leftovers and it had stopped tracking
   > them.** It named three producers and three shapes while the mechanism above produces **five**, and it
   > was not updated when the corrected reversal added one. The full set, each stated with whether anything
   > deletes it:
   >
   > | Shape | Produced by | Deleted by |
   > |---|---|---|
   > | `<identifier>.displaced-<stamp>` | a restore, displacing the store it replaces | nothing — kept on purpose |
   > | `<identifier>.displaced-<stamp>` | the corruption ladder | nothing — kept on purpose |
   > | the old identifier's whole store | ESC-26's confirmed establishment | nothing — kept on purpose, and it is the undo |
   > | `<identifier>.restoring-<n>` | **every** restore, staging the artifact | ***nothing, and nothing knows it exists*** |
   > | `<identifier>.obstruction-<stamp>` | the R1/R2 reversal, displacing whatever occupied the target | ***nothing, and nothing knows it exists*** |
   >
   > **The last two are defect D5 and it is open.** The staging copy was left behind in every measured
   > failure of spike 22 — 30 of 30 on the literal reading, 30 of 30 with a file manager holding the store
   > directory, 30 of 30 at second-granularity collision, and the timeout case — and the layout block above
   > calls it "transient" while no step deletes it. It is the size of the store. The obstruction aside was
   > added by the correction and IC-1 observed **both** leftovers beside the target on every reversal run.
   > The first three are kept deliberately and are the reclamation surface's business; the last two are not
   > kept deliberately by anybody, which is the difference this table exists to show.
6. **The backup is O(store), and it now has one number rather than none.** `VACUUM INTO` copies the whole
   store and pins the write-ahead log for the duration. Measured against a 41 MB store with 108,525 commits
   landing during the run, it produced **8 valid snapshots out of 8** at a **median 1,077 ms** each (min
   403 ms, max 2,107 ms) on a local NVMe volume, monotonic and integrity-clean — which settles the
   *correctness* half of `REQ-SESSION-201`'s hardest clause. **The scale half is still open**: the action
   is required to work while runs are live, ESC-9 leaves retention unbounded, and the field has a filed
   issue about session logs reaching 700 MB to 2 GB. At the measured rate a store two orders of magnitude
   larger is a copy of tens of seconds, which is where progress reporting starts to matter — so the
   question is now "at what size", not "is it seconds or minutes". The write-ahead-log growth during the
   copy is still unmeasured and is the input the mid-copy checkpoint question turns on.
7. **A restore stops the store for both processes while the application keeps running**, and its directory
   swap is two renames rather than one. The observable in the gap is an absent store directory, which
   `REQ-SESSION-043` already makes an ordinary state — so the failure mode is an empty session list, not a
   corrupt store. Accepted deliberately in preference to inventing an atomicity no platform provides.
   **Measured 2026-09-02 and true as claimed**: 20 of 20 observations that caught the gap saw the store
   directory absent and never anything mixed, and the gap is 3 to 5 ms whatever the store weighs. It was
   also measured to be *not* the worst observable, and that is the part this consequence must not be read
   as covering on its own: a failed reversal left a store directory present and empty, durably, in 20 of 20
   occupied-name failures. That state is now excluded by the reversal's displace step rather than by luck,
   and the exclusion is a correctness property of the reversal and not a nicety of it.
8. **Restoring on a machine other than the one that took the backup changes which sessions need repair.**
   Foreign-host lock rows are dropped on the way in (ADR-0005), so every session that was live when the
   backup was taken arrives stale and needs the ordinary explicit repair. That is a correct outcome, it is
   disclosed before the restore, and it means a restore is routinely followed by a repair-all — which
   `REQ-SESSION-182` already offers and which needs no new affordance.
9. **A second workspace presenting an already-open identifier opens without a store.** New behaviour,
   expressible in `REQ-SESSION-089`'s existing vocabulary but not itself stated by any requirement
   (OQ-47). ADR-0002 has since settled the part of OQ-47 that was an inter-record disagreement — the
   workspace service is keyed by resolved path, this store by identifier, and the two key different
   objects — but this behaviour is still architecture-invented on a specification silence.
10. **`REQ-SESSION-089`'s graceful degradation is gone by ruling, and the amended requirement says so.** The
    event store, the session state and the lock are one object; there is no partial failure left. The
    previous version listed this as an amendment owed; it has landed, in `REQ-SESSION-089` and
    `REQ-EVENTS-084`, and they agree.
11. **A transaction removed a defect ESC-3 accepted, and the specification has absorbed it.**
    `REQ-LIBRARY-042` now requires the read-modify-write to "take effect as one indivisible step" and
    records its old concession as withdrawn "as unreachable, not as unimportant". ESC-18 ruled it; nothing
    here is outstanding.
12. **Indexes and query planning are ours to own.** `REQ-SESSION-042`'s listing — which now requires the
    cost to grow with the number of sessions "and with nothing else" — and `REQ-TRACE-239`'s 100 ms board
    budget are the two that must be measured against real indexes rather than assumed.
13. **Store paths are longer than workspace-relative ones.** A per-user data directory plus an identifier
    plus a session id plus an artifact name is a deep path on Windows; long-path handling is an obligation
    rather than an optimisation, and artifact body names are the part that varies without bound. The
    backup adds nothing to this — it writes to a destination the user chose — but the restore's staging
    and displaced directories add a suffix to the deepest path in the record, which is where a long-path
    limit would bite first.
14. **Where a first-statement store failure belongs is decided by this record and by no requirement.** Rule
    3 puts the open, the pragma, the read-back and the write probe inside `REQ-EVENTS-084`'s "opening the
    store", and starts `REQ-EVENTS-088` only once the workspace service has declared the store open. The
    measurement that forces the question is real — 30 of 30 opens over a mapped drive threw on the first
    statement and then worked — and neither requirement covers it as written. This is architecture-invented
    on a specification silence, on the same footing as consequence 9, and it should be raised as one.
15. **A store reachable through two path spellings loses data silently, and rule 6 is the whole defence.**
    `REQ-EVENTS-098`'s non-blocking property is a conformance property of the store, and it was measured to
    hold on local storage and on same-spelling network storage (9,330 and 8,631 reader polls, zero reader
    errors, zero writer errors) and to **fail** where one file is reached two ways — 18,776 polls in which
    the reader never observed the writer's commits, 55 of 800 rows surviving, `integrity_check` clean.
    Nothing reports an error, so there is no failure to detect after the fact and no repair to offer. The
    only defence is not producing the condition, which is rule 6, and rule 6 is therefore a correctness
    rule and not a hygiene one. It also means **`integrity_check` is not evidence of completeness** —
    anywhere this record or a later one reaches for it, it establishes that the store is not corrupt and
    says nothing about whether it is short.
16. **The chosen binding needs two implementation disciplines that are not optional.** Every prepared
    statement is retained for the life of the connection (a garbage-collected `Statement` aborted the
    process in 3 of 30 measured launches under Electron, in both the run-as-node and `utilityProcess`
    hosts), and result-less pragmas go through direct execution rather than the convenience accessor that
    creates a transient statement per call — which is both the abort's easiest trigger and, separately, the
    route by which `PRAGMA synchronous` silently fails to apply. Both belong in the thin data-access module
    alternative B exists to keep swappable, and both are the kind of thing that is rediscovered as an
    intermittent crash if it is not written down.
17. **Four mechanisms in the architecture record have now been built for the first time, and every one of
    them contained a defect that no amount of reading had caught. That is the number, and it belongs here.**
    *This consequence read "three" until 2026-09-03; the fourth is stated at the end of it.*
    ADR-0054's commit step, which renamed a prepared directory onto an existing one — a thing this platform
    does not do, so a damaged preparation was never repaired and one case launched to no window at all.
    ADR-0054's completeness check, which passed a preparation whose image was damaged, after which the
    launch produced nothing. And this record's restore, which could not complete at all, destroyed a live
    session through a gate evaluated too early, and reversed itself with the same call that had just failed.
    Each was found on first execution and none by review. Each is corrected in place, here or in the record
    that owns it.

    **And the fourth, which says most about the other three: the harness built to measure this record's
    corrected restore had three defects on its first run.** One of them would have reported a **pass while
    testing nothing it claimed to test** — the raced run took its lock on the wrong side of the first
    liveness evaluation, so the first caught it and the second, the one under test, never ran. A second was
    **defect D8 arriving uninvited**: the byte-identical check counted the `-wal` and `-shm` files any open
    connection creates. The third asserted byte-identity in the one experiment whose entire premise is that
    a live run keeps writing. **A harness is a mechanism**, decided on paper like the rest, and it was
    written by someone who had just finished writing up the other three. See
    `../spikes/corrected-restore-rerun.md` section 8.

    **What that licenses and what it does not.** Four of four is a sample of four and it is the only
    sample this project has, so it is the best available estimate of how much of what remains unmeasured is
    wrong, and the estimate is not small. It does not license measuring everything; that is not available.
    It settles two narrower things. First, **a mechanism this record describes and nobody has executed is
    not evidence that the mechanism works**, and must not be cited as though the writing were the testing —
    every one of these four read correctly to everyone who read it, including the readers who wrote it.
    Second, **when one of them is built and does not work, the defect and its measurement belong in the
    record in place**, rather than being repaired quietly in code, because the reason for a fix is the only
    thing that stops the next reader removing it. Every correction in the restore section above is written
    that way for that reason.

    **One instance is worth carrying by itself, because it is the same fact found twice.** ADR-0054's commit
    step and this record's reversal failed on one identical platform property — a directory cannot be
    renamed onto a name that already exists, not even an empty one — discovered independently, in two
    records, by two measurements, neither of which was looking for it. The displace-then-rename shape is now
    in both. A third mechanism in this product that renames a directory onto a name that might be occupied
    has the same defect and has simply not been run yet.

18. **What in this record is known to be wrong, or known to be silent, and is not fixed. Added 2026-09-03 by
    the Architecture Gate's ruling on item 4.** The gate's standard is that a defect **stated in the record**
    that would not cause a conformant implementation to be built wrong does not block building against that
    record. The standard is only worth anything if the statement exists, and until this consequence was
    written this ADR was the one carrying open defects and not naming them. **Three are open. None is in the
    build-wrong class. A builder is expected to meet all three.**

    - **D5 — nothing deletes a leftover staging copy or an obstruction aside, and nothing knows they
      exist.** The full table is in consequence 5 above. Each is the size of a store. What is owed is
      OQ-48's inspect-and-delete surface, which the specification still does not have.
    - **D8 — the three gates before the swap are not read-only at the filesystem level.** The liveness
      gate's read-only open of a write-ahead-logged store creates `workspace.db-shm` (32,768 B) and
      `workspace.db-wal` (0 B) **in the target store directory**, measured before and after. No row is
      written and the data is unchanged, so the intent of "none of them touching the target" holds and the
      literal sentence does not — **a refused restore leaves the target directory different from how it
      found it**. It is stated here rather than repaired because this record is cited for exactly this kind
      of guarantee, and it met the defect a second time inside the IC-1 harness, uninvited.
    - **D11 — the `.displaced-` suffix can make the kept store unreadable, and the kept store is the whole
      point.** The suffix costs +35 characters. The store binding throws `unable to open database file` on
      any statement at an absolute database path of 252–259 characters and on open at ≥ 260, **while Node's
      own filesystem calls worked at 328** and `LongPathsEnabled` was `1` on the measuring machine: the
      registry opt-in does not reach the store engine. A live store at 230–251 characters works perfectly
      and its displaced copy cannot afterwards be opened by the product at all; the rename always succeeds.
      **Not reachable at the shipped location** (96 characters, fixed-length by construction); reachable
      with a long account name, a redirected profile, or a junctioned per-user directory. *This also
      corrects consequence 13, which names the right hazard and points at the deepest path when the limit
      bites at the shallowest one, `workspace.db`, because it is the engine and not the filesystem that
      refuses.*

    **Two rules this record owns are not defects and are owed evidence rather than a fix**, and they are
    named here so the list is the whole list: rule 6's canonical path spelling **needs a conformance test
    that opens one store two ways and asserts the product refuses**, because its violation is silent and
    there is no error to detect (consequence 15); and ADR-0055's stand-down rule for a recovered process has
    no measurement behind it at all.

## Revisit if

`node:sqlite` reaches stable and Electron commits to shipping the binding — take alternative B and give back
the rebuild obligation. Or a requirement appears that joins a session row to a workspace-scoped row, which
would close alternative G off.

**Two of this section's triggers were measured on 2026-09-02 and are marked rather than deleted, so a
reader can see they were tested.**

- *"Or the commit cost on the publish path, once instrumented, turns out to consume a material share of
  `REQ-MONITOR-222`'s budget, which would make the coalescing tick's commit shape a decision rather than a
  consequence."* — **Not triggered.** The commit consumes **0.28 %** of the budget at p95 and the whole
  commit-then-publish interval **0.71 %**. The coalescing tick's commit shape stays a consequence. The
  carve-out forbidding per-tick commits stands, but on the transport's account rather than the store's.
- *"Or cross-process write contention, measured against `REQ-MONITOR-218`'s no-delay-floor rule, proves
  real — take alternative G's two-store split."* — **Not triggered by compliant contention**, which is
  sub-millisecond (consequence 2). It is triggered by rule-5 violations, which produced a 205.4 ms commit
  and indefinite writer starvation — so the trigger is **restated**: take G if the workspace service's
  write pattern ever turns out to *need* long write transactions, rather than if contention is merely
  measurable. Note that ADR-0005 then has to say which of the two stores holds the lock table.

New with ESC-19. Or the binding's own documentation contradicts what alternative T assumes about the online
backup facility restarting on an external write, in which case T is the better mechanism and U is dropped —
this is a documentation check, not a measurement, and it should be done first. Or `VACUUM INTO`'s pinning of
the write-ahead log during a backup is measured and found to grow the log unacceptably on a large store
under a live run, in which case take T driven from the writing connection and move the copy into the run
host, accepting the long operation there. Or the product owner reads `REQ-SESSION-201`'s "MUST NOT reach
outside that store" as binding the restore as well as the backup, in which case case (b) stops
establishing an absent identifier file and collapses into case (c) — which, since ESC-26, is a confirmed
product action rather than a manual remedy, so the cost of that reading has fallen.

**New with the 2026-09-02 measurement pass.** Or the write-ahead log's growth while `VACUUM INTO` pins it
is measured on a large store under a live run and proves unacceptable — the correctness of the snapshot is
now settled (8 of 8), the log growth is not, and it is the only input the mid-copy checkpoint question
needs. Or rule 6's refusal of a non-machine-local store path fires on a configuration users legitimately
have, in which case the same detection drives a warning instead; the argument for refusal is the silence of
the failure it prevents, not its likelihood. Or a power-loss test establishes that a committed
write-ahead-log frame at `NORMAL` survives more than the record assumes, which would not change the
publish-path setting but would re-open how much `FULL` is buying on the terminal save.

**Discharged, 2026-09-02 (second).** This record previously carried: *"Or the specification grants
`REQ-SESSION-197` one narrow, explicit, user-confirmed exception, in which case case (c) of the restore
gains a product action and the residue this record raises against the specification closes."* **ESC-26 has
granted exactly that**, in exactly that shape, and case (c) is rewritten above. The clause is retired
rather than deleted so a reader can see the escalation was raised here before it was ruled elsewhere.

**Discharged, 2026-09-02.** This record previously carried: *"Or the product owner takes SR-9(b)'s larger
option — a configurable store location, or an explicit whole-store backup action — in which case
alternative N returns and the disclosure requirement is no longer the whole answer."* ESC-19 has answered
it, and split it: the backup action is taken and is built above; the configurable store location is
**refused**, and ESC-19 states in terms that this record's location decision does not reopen. Alternative N
is closed rather than pending, and the clause is retired rather than deleted so a reader can see the
question was asked before it was answered.

## First execution — 2026-09-03, the walking skeleton

*Recorded under GD-10.*

**Built and run as product code:** `@rotaris/store` — the open sequence (WAL set and read back, the
write probe in `BEGIN IMMEDIATE` rolled back), schema v1 with the migration runner, the
statement-shaped DAL, the identifier by exclusive create, `origin.txt` on first open, and **the
corrected restore ported from IC-1's `restore2.js` with IC-1's experiments as its test** — E1, E1c,
E2, E2c, E3a, E4, and the D9 foreign-lock confirmation. All pass; both counterfactuals reproduce
their defect. In the application, the workspace service opened and migrated a store for a carried
directory and the run host opened it by the handed path.

**Found, in rule 6's implementation:** the first cut compared a caller's spelling against the first
opener's and refused a mismatch — and the test showed that on this platform `realpath` returns the
on-disk casing, so a lower-cased spelling canonicalises to the same string and no mismatch can arise.
The refusal was therefore unreachable, and the rule as written was doing nothing. **The corrected
shape is that `openStore` hands the engine the canonical spelling regardless of what it was passed**,
so two openers cannot reach one store by two spellings because neither opener's spelling ever reaches
the engine. That is a stronger property than a refusal and needs no second opener to be present.

**Found, and recorded as the fourth entry of consequence 17's pattern in miniature:** the E3a test
passed its bound to the wrong parameter and measured the default 2,000 ms instead of 300 — a harness
defect, caught because the assertion named the number.

**Not exercised:** the restore behind a *real* run host over the process protocol (the test's run host
is in-process); IC-4 and IC-5 remain as `TODO` markers at the modules they bind.

## Spikes 8 and 18 — 2026-09-03, taken with the session writer

*Recorded under GD-10 and the spike ruling. Both reports are in `../spikes/`.*

**Spike 8** (`store-schema-and-open-path.md`): the declared indexes cost +37 % / +42 % on the
publish-path commit and shorten the checkpoint period below 100 commits; the open sequence is ~3 ms
and `REQ-EVENTS-179`'s probe 0.15 ms; log recovery after a kill is whole and ~11 ms; **an integrity
check costs ~2.8 ms per MB and may not sit on the startup path** (462 ms on a 167 MB store); listing
and summary are index reads at 1–5 ms; the trim is ~35 ms per 2,500 appends; the binding cannot open
a path over 260 characters unprefixed, which the store's own path never is. **It found the fifth
defect of consequence 17's pattern**: an index declared for a budgeted axis that the planner never
used. Consequence 17's estimate is unchanged and its count is now five — **six** with the run loop's, in the next section, and **seven** with the terminal's (ADR-0020's marker protocol read the PTY's echo before the shell's frame; recorded there, 2026-09-03), and **eight** with the redaction pass's (ADR-0007, quadratic over a long run, found by the hooks' payload bound the day after; recorded there).

**Spike 18** (`two-writers-one-store.md`): two compliant writer processes on one store — zero
`SQLITE_BUSY` in 6,000 contended commits, nothing lost, +12 % at p50, aggregate throughput unchanged,
and **one sample of 258 ms** in 6,000, the first this record has seen cross `REQ-MONITOR-222` on a
compliant path. Rule 4 stands; a third writer is not measured.

## The run loop — 2026-09-03: schema v3 and the sixth of consequence 17

*Recorded under GD-10.*

**Schema v3** lands with the run loop: the run's columns on the session row (`stop_reason`,
`iterations_completed`, the aggregates with cost as a decimal string, the summarisation, the todo and
progress documents), `launch_audits` whose primary key is `REQ-SESSION-138`'s one-shot, and `timeline`
append-ordered by the writer's ordinal. **No index**, because no budgeted query reads any of it yet; the
plan-assertion rule of spike 8 stands for the first one that does. Consequence 11's checkpoint period is
untouched: the publish-path transaction gained no statement.

**The sixth of consequence 17's pattern is ADR-0043's**, not this record's: the replica cleared its
transcript on every whole-session update, which was harmless while only an attach published one and
emptied a transcript still being written once the run loop's status saves did. Corrected there, with the
falsified reason kept beside the fix. Every mechanism in this record that has gone from paper to first
execution has now held a defect no reading caught, six times — seven with ADR-0020's, the first mechanism of the permission-gate part to run against something real, and eight with ADR-0007's, found not by its own first execution but by the first mechanism to run it at size.

## First execution — 2026-09-03, the restore behind the real run host, and the backup from the Settings view

*Recorded under GD-10. IC-5 discharged; IC-4 discharged in its first half, prepared in its second.*

**Built and run:** `packages/workspace/src/{backup,restore}.ts` around this record's mechanism, the
workspace service performing both (ADR-0002 c.7: main supplied the save and open dialogs and the message
boxes and nothing else), and the service reaching the run host through **narrow requests back to main**
that main forwards — steps 1, 3, 4a and 10 as `runHost.refuseRuns / closeStore / release / reopen`,
each bounded, with the lease renewed every 10 s while a restore runs (3b). The restore is two-phased so
every question is asked before anything is changed (`REQ-SESSION-201`): an assessment that runs gates 1
and 2 on the artifact, reads the identifier case, and counts what the target holds including its lock
rows; then the perform. The three confirmations carry what the requirement and ESC-26 fix — which
workspace, when, what happens to the store that is there now; both identifier values and the sessions
that become unreachable, cancel the default, three outcomes; the foreign rows as one condition with the
risk stated. The two actions sit in the Settings view's Project category (`REQ-CONFIG-268`), disabled
with the reason while a run is busy (`REQ-NOTIFY-008`).

**Run in the application, six scenarios, real utility processes:** a backup taken **while a run was
streaming** — 4 sessions, 100 KB, the run finished afterwards untouched; a restore **refused while a run
was active** ("Finish the active run before restoring the session store."); a restore into the same
identifier — assessed (5 sessions in the target, 4 in the artifact), confirmed, performed in ~250 ms,
the previous store displaced and kept, `origin.txt` naming the workspace, the run host re-handed the
store; a restore into a workspace carrying a **different** identifier with ESC-26's third outcome — both
values named, the identifier replaced *after* the store was whole, the store under the old value intact,
and writing the old value back undoing it (done, on the scratch workspace); and the Settings screen.

**Found, and it is about this record: case (b) has no route in the product.** "The workspace carries no
identifier file at all" cannot be met from the restore action, because the restore is an action of an
*open* workspace and opening one mints its identifier (`REQ-SESSION-197`, W-18). The disaster-recovery
journey this section describes — machine dies, clone, open, restore — therefore always arrives as case
**(c)** with a freshly minted value on the workspace side, which is exactly the situation ESC-26 was
ruled for. The code path for (b) exists and is tested in the workspace package; it is reachable only by
a caller that restores without opening, which nothing does. The section is not wrong about what (b)
*would* do; it is wrong about (b) occurring. **The verification run found this the honest way:** the
scenario prepared for (b) was met by the second message box, which its script had no answer for, and a
real native dialog blocked the run until its capture fired.

**A second observation, not a defect.** A backup taken mid-run carries that run's session as `running`
with its lock row, as `REQ-SESSION-201`'s "a state a reader could have observed at one moment" says it
must; restored on the same machine after the run has ended, that session reads as stale (live status, a
pid that is gone) and waits for ADR-0005's reap-and-repair, which is not built. The restore's
foreign-lock drop (consequence 11) does not touch it because the row names this machine.

**IC-5 discharged** — `store.test.ts`: against an artifact in the container layout (`store.db`,
`manifest.json`), the restored directory holds `workspace.db`, no manifest, and `origin.txt` naming the
project; the counterfactual (`skipArrange`, D7 as it was) opens, works, and is missing all three.
**IC-4 half 1 discharged, half 2 prepared** — `../spikes/machine-identifier-rename.md`.

**Not exercised:** the kill-in-the-gap case (README B2); two concurrent restores of one identifier; a
restore from a network destination; D5's staging leftover (observed again: every successful restore
leaves none, every reversal leaves `.restoring-1`).

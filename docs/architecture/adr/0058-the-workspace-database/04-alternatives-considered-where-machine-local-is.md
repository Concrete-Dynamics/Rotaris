# ADR-0058 — The workspace store: machine-local, found by a workspace identifier, and how it is backed up — Alternatives considered — where "machine-local" is

Part 4 of 22 of [ADR-0058](../0058-the-workspace-database.md), which indexes every part.

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

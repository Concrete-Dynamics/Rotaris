# ADR-0058 — The workspace store: machine-local, found by a workspace identifier, and how it is backed up — Context

Part 1 of 22 of [ADR-0058](../0058-the-workspace-database.md), which indexes every part.

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

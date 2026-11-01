# Product-owner decisions on the architecture record — Architecture Gate decisions — ruled 2026-09-02

Part 7 of 15 of [the owner decisions](../owner-decisions.md), which indexes every part. Archived in [the archive](../../archive/architecture/owner-decisions/07-architecture-gate-decisions-ruled-2026-09-02.md), one index line each here: GD-1; GD-4.

## Architecture Gate decisions — ruled 2026-09-02

The four things the Architecture Gate verdict left with the product owner, plus the one question the
verdict's category B raised and declined to answer for itself. None of these is what makes the gate
verdict NOT READY; that is the four build-wrong defects and the four build-host obligations, and none
of them is the owner's to close.

- GD-1 — the approved visual design reference is not a gate condition, and OQ-31 is ruled without it; ruled 2026-09-02; [archived](../../archive/architecture/owner-decisions/07-architecture-gate-decisions-ruled-2026-09-02.md#gd-1)

### GD-2 — ESC-15's and SR-7's stated reasons are corrected in place; both rulings stand

**Decided: correct the reasoning, keep the conclusions.** Neither ruling is reopened. Both are corrected
where they are written, so that a later reader re-deriving from the stated reason reaches the stated
conclusion. The corrections are recorded in the ESC-15 and SR-7 sections above and summarised here.

**ESC-15.** The recorded reason was that write-ahead logging is unsupported on network filesystems, so the
store opens read-only, so the lock cannot be acquired, so no session starts. Spike 19 measured **both
clauses false**: WAL succeeded over a UNC path in 320 process-trials with zero errors, the pragma returned
`wal` and the prescribed read-back returned `wal`, the 32 KiB shared-memory segment was obtained over SMB,
and `db.readonly` was `false` in every network case. The ruling survives on three failures the measurement
found instead, all of them worse than the one it replaced: a store can report WAL enabled, read back as
WAL, own its shared-memory segment and still fail its next write, with that write silently absent from the
following read; and the failure is **path-spelling dependent**, so the same share behaves differently
addressed as a UNC path and as a mapped drive letter. The original claim at least fails loudly and in one
place. What the measurement disproved was an argument for the ruling that was weaker than the truth.

**SR-7.** The ruling's own evidence is untouched and stands unchanged — first paint at 13,287–19,580 ms
against a 5,000 ms budget at every bundle weight including a zero-payload build, against 664–1,561 ms for
the same payload as a directory tree. What was disproved is a subsidiary identification the ruling relies
on: the packaging tool's portable-executable environment variable was measured **null in 0 of 157**
launches through our own launcher, because the tool sets it only when the tool's own portable stub runs,
which ours is not. Our own declared variable carried the correct absolute artifact path in **149 of 149**.
The mechanism named changes; the conclusion does not.

**Why correcting matters when no conclusion moves.** A record whose conclusions are right for reasons that
are false is a record that cannot be re-derived. The next person to meet a workspace on a network share
will read ESC-15's reason, find it does not reproduce, and have to decide whether the ruling was wrong —
with no way to know that the truth is worse rather than better.

### GD-3 — the corrected restore is re-measured as a condition on its implementation, not on the gate

**Decided: not a gate condition; a condition on the first implementation of the restore, recorded in the
new `docs/architecture/implementation-conditions.md`.**

The three corrections to ADR-0058's restore are, as this is written, exactly the paper reasoning that
consequence 17 says is not evidence. They are also not on the startup path, and nothing else in the record
depends on them, so holding every unrelated decision for one mechanism's re-measurement buys nothing.

**The condition has a home, because otherwise this option is the do-nothing option.** No register of
conditions that bind at implementation time existed when this was ruled; the check was made rather than
assumed. `docs/architecture/implementation-conditions.md` is created by this ruling to hold it, and the
Architecture Gate verdict points at it. An unlanded condition is not a lighter version of a gate
condition, it is no condition at all, and this record has already lost two days to an amendment that was
ruled and never scoped.

**What the re-run must cover** is bounded to the two things the corrections changed and the measurement has
not yet seen: a run launched into the window between the refusal of new runs and the run host's
acknowledgement, confirming the second liveness evaluation refuses it and the run and its rows survive
intact; and an install rename forced to fail on an occupied name, confirming displace-then-rename leaves
the target store byte-identical.

- GD-4 — a restore under way is visible; a backup may be abandoned; ruled 2026-09-02; [archived](../../archive/architecture/owner-decisions/07-architecture-gate-decisions-ruled-2026-09-02.md#gd-4)

### GD-5 — the Linux and macOS build-host obligations are deferred to hardware, not waived

**Decided, 2026-09-02: the obligations that need a machine this record does not have are deferred until one
is available, and they remain owed.** They are recorded as **IC-3** in `implementation-conditions.md` rather
than as gate items, on the same principle as GD-3: an obligation that cannot be discharged here does not
become smaller by being called something else, so it is written where it binds the work rather than left in
a verdict category that will be read once and closed.

**What is deferred**, and none of it can be closed by reasoning on this machine:

- **Spike 12** — the Linux artifact's runtime on a host that has never had the legacy FUSE library
  installed. It decides which of ESC-11's two applied options the release takes, and the whole point of the
  measurement is a machine that has never had the library, which this one cannot become by uninstalling it.
- **Spike 17's macOS and Linux platform keys.** `REQ-STARTUP-155` binds all four artifacts and only the two
  Windows ones were built.
- **ADR-0056's build-time load proof on all three release runners.** This one **grew** rather than merely
  waiting: it was always the only check in the record that catches an unloadable store binding, and defect
  D10 then established that the rebuild it was meant to confirm reports success while compiling nothing and
  that the loader would ignore the result anyway. It is no longer one check among several. It must be shown
  constructible on each runner, not assumed.
- **The instance claim on macOS and Linux.** SR-1 made single-instance behaviour entirely ours on three
  platforms and it has been measured on one. `REQ-STARTUP-156`'s release gate does not require launching
  the entry point twice on one user account, which is the check that would catch a failure here.

**What deferral does not mean.** It does not mean these are lower risk than the measured items — the
opposite is the record's own experience. Three mechanisms in this record went from paper to first execution
and every one held a defect no reading had caught, and **all four of these obligations are in the class of
things that have never been executed at all**. Deferring them is a decision about when a machine is
available, not a judgement that they will pass. Any implementation that reaches a Linux or macOS artifact
before IC-3 is discharged is shipping on an untested platform and the record says so here so that nobody
has to infer it.

**What it does mean for the gate.** The Architecture Gate's category C is unchanged by this ruling: these
four remain open, and this ruling relocates them rather than closing them. Whether the gate closes with
category C outstanding is a separate decision and is the owner's.

> **Amended 2026-10-26 by the owner — the Linux half is no longer deferred to hardware
> ([R-087](../../product/requests.md#r-087)).** The owner: "das IC, also Implementation Conditions sollten keine
> Linux-Builds verhindern … deine Arbeit darf nicht blockiert werden dadurch. … Müsste ein AC sein und eine
> Architekturentscheidung." A developer of this project has a Linux host, so the premise "a machine this record does
> not have" no longer holds for Linux. IC-3 binds macOS alone; the Linux halves of the four obligations above are
> **not waived** — they are the acceptance criteria AC-1 to AC-4 of
> [ADR-0066](../adr/0066-the-linux-artifact-is-built-on-a-developer-host.md), which authorises building the Linux
> artifact and keeps this ruling's warning for one built before they are met. The ruling above is kept as written.

---

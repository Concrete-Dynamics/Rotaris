# ADR-0054 — Packaging, the four artifacts, and self-update — The launch preparation — what `REQ-STARTUP-165` leaves to this record (continued)

Part 4 of 22 of [ADR-0054](../0054-packaging-artifacts-and-self-update.md), which indexes every part.

**The stub must not outlive the launch, and must not keep the artifact open.** Two rules, both
load-bearing and both learned from what the tool's own stub does. First, **the stub must not remain as a
supervising parent that deletes the preparation on exit** — that is exactly the behaviour that makes the
current portable re-extract on every launch. Second, **the stub must close its handle on the artifact
file before the application starts**, because `REQ-STARTUP-125`'s Windows portable strategy renames that
artifact aside while the application runs, and on Windows a rename over a path fails with `EPERM` while
**any** handle is held on it — measured to fail under every `fs.open` flag reachable from the runtime,
and to fail even where the holder explicitly permits deletion. Under the preparation this is a strictly
easier problem than it was before, and that is worth saying: the running image is no longer the
artifact, so the executing-image lock that made the old rename-aside delicate is not on the artifact at
all. **It becomes delicate again the moment the stub keeps a handle.**

**Both rules are now measured, and the second turns out to be the difference between `REQ-STARTUP-125`
being satisfiable and not being satisfiable at all.** The requirement says the replacement "SHALL succeed
while the application being replaced is still running, the target being the artifact rather than the file
the process is executing". Tested by launching and then renaming the artifact aside in a loop, recording
whether the application was in the process list at the moment the rename succeeded:

| launch path | first successful rename | application alive then | failed attempts before it |
|---|---|---|---|
| **this preparation, cache hit** | **189 ms** after launch | **yes** | **0** |
| `electron-builder`'s `portable` target | 16,837 ms | **no** | **79, every one `EBUSY`** |

Under the tool's own portable target the artifact was locked for the entire life of the run: every
attempt from 479 ms onward returned `EBUSY`, and the rename first succeeded at 16,837 ms — **the same
millisecond the portable's own process exited**, i.e. after the application had already finished.
`REQ-STARTUP-125`'s "while the application being replaced is still running" was **not satisfiable on that
target at all**. Under the preparation it is satisfied on the **first attempt**, because the stub has
already exited and nothing holds the artifact.

**So SR-7's ruling does not merely preserve self-update; it rescues it.** This record previously carried
the two rules above as precautions against a hazard. They are not precautions — they are the whole
mechanism, and P1 failed a second requirement independently of the 5-second budget, by a margin no timing
argument reaches. That is a second reason SR-7's ruling is the right one, and it is not a timing
argument.

**How the artifact is identified for the update path — from the environment the stub sets, never from
the running image's own path.** Clause (e) and `REQ-STARTUP-106` both require the artifact the launch
started from. Under a preparation the running image's executable path points **into the preparation**,
so it answers the wrong question; the launcher passes the artifact's full path to the application in a
declared environment variable, and that value is the sole input to flavour classification and to the
update target. Three consequences fall out and each is desirable:

**Before them, a correction. SR-7's ruling on this point holds and its stated mechanism does not.** SR-7
records that "the artifact is identified by the packaging tool's own portable-executable environment
variable, not by `execPath`", and instructs this record to state it rather than discover it. **The first
half was measured and confirmed; the second half was measured and is false.** Across **149 launcher
launches that painted, 149 reported `process.execPath` inside the preparation root** — so an
implementation reaching for `execPath` would classify and target a copy the product can recreate at will,
which is exactly what `REQ-STARTUP-106` calls "the one outcome an update must not produce". But
`PORTABLE_EXECUTABLE_FILE` was set in **0 of 157 launches through the launcher**. It is
`electron-builder`'s variable, published by `electron-builder`'s portable stub; once P4 moves the artifact
off that target the variable does not exist. This was checked from the other direction on the same
machine on the same day: spike 17's own `electron-builder` portable still publishes it correctly, so the
variable works — **for the tool's own target, which SR-7 is the ruling that leaves.**

**The mechanism that actually holds is the one this record already chose: the launcher publishes its own
declared variable, and it carried the correct absolute artifact path in 149 of 149 painted launches.**
`REQ-STARTUP-147` accommodates this without amendment, naming as one of its four kinds "the variable by
which that form names the artifact file a launch started from", whose value "is a file path and nothing
else". So the conclusion SR-7 reached is right, the reason it gave for it was tested and found false, and
the requirement had already been written wide enough to carry the replacement.

- **Absent variable → not updatable.** Someone who runs the payload's executable directly out of a
  preparation is not running from a released artifact, so `REQ-STARTUP-106` classifies the build not
  updatable and **no request is issued at all**. That is the correct outcome and it is the requirement's
  own default rather than a special case.
- **Windows flavour classification stays correct.** The registry discriminator tests whether *the
  artifact* resolves inside the directory `InstallDir` names. A portable running out of a preparation
  under the per-user data root can therefore never be misread as an installed build, whatever directory
  the preparation occupies — which is what `REQ-STARTUP-106` says the artifact-side test is for.
- **The value must be validated before it is used as a write target.** It names the file the updater
  will rename and replace. It must resolve to an existing regular file; anything else is treated as no
  released-artifact target, which `REQ-STARTUP-125` already gives a defined outcome.

**The medium the artifact sits on may not accept the replacement, and `REQ-STARTUP-125` now says what
happens.** A portable exists to run from read-only and removable media, and under a preparation it goes
on running perfectly well after that medium is unplugged — the running image is in the per-user root, not
on the stick. So the update path meets a case the previous design could not reach: the target exists as a
value but cannot be written, or is no longer there at all. The requirement's outcome is exact and the
updater implements it literally: **fail reporting that it could not install the update at the target,
change nothing anywhere, and leave the running application and its preparation exactly as they were.**
Not a retryable transient, not a fallback to some other location, and specifically **not** an update
applied to the preparation — which is the failure `REQ-STARTUP-106` exists to forbid, arriving by a
different road. `REQ-STARTUP-115`'s launch-time cleanup takes the same shape for the same reason: a
launch that cannot reach the artifact's directory has nothing to do rather than something to report.

**The restart is where this design meets the instance record, and that is ADR-0055's problem, named here
because the update path is what triggers it.** `REQ-STARTUP-121` makes `Restart now` a **hand-over** of
the running instance rather than a second launch: the updated installation is started first, the record
passes to the successor rather than being released, the current window closes only after the successor
has started, and a launch arriving mid-hand-over goes to whichever of the two holds the record. Under a
preparation this acquires a property nobody has recorded: **the successor is a new artifact version, so
its first run is a preparing run** — the exempt one, which on the measured payload means the predecessor
holds its window and its record for **roughly 1.6–2.1 seconds, and up to about 3.9 seconds on a single
core**, before the successor is up. *(This record previously put that figure at 13–19 seconds, which was
P1's extraction cost and not this mechanism's; the wait is real but it is seconds rather than tens of
seconds.)* `REQ-STARTUP-121`'s own failure branch is what keeps that safe ("when the successor
cannot be started, nothing SHALL close"), and the ordering it fixes is what keeps it correct. The
mechanism of passing the record is ADR-0055's to decide and is decided there.

**What is unchanged.** The other three artifacts, all four apply strategies, the manifest, the naming
authority, the exact-string asset lookup, and every observable in `REQ-STARTUP-013`, `REQ-STARTUP-020`
and `REQ-STARTUP-031`.

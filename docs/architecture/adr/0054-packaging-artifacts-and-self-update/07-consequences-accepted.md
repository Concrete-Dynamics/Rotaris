# ADR-0054 — Packaging, the four artifacts, and self-update — Consequences accepted

Part 7 of 22 of [ADR-0054](../0054-packaging-artifacts-and-self-update.md), which indexes every part.

## Consequences accepted

1. **We own an updater**, including its Windows and Linux file operations and their failure modes, and
   it must be exercised on all three platforms because the four strategies share no code.
2. Unsigned binaries mean the product will always trip the platforms' first-launch warnings — a product
   decision already taken and disclosed, not one to revisit here.
3. **Without differential updates every update is a full artifact download.** At these artifact sizes
   that is acceptable and the verification model assumes it.
4. **The application image's runtime is pinned by requirement**, so a packaging-tool upgrade that
   changes that default is a release-blocking change and not a routine bump. `REQ-STARTUP-156`'s
   first-paint gate must be run on a machine that has **never** had the legacy library installed, or it
   verifies nothing about this.
5. **We own a launcher stub as well as an updater, and it is on the critical path of every portable
   launch.** It is the one component in the product that runs before the application runtime exists, so
   it cannot use anything the runtime provides, and a defect in it is a portable that does not start.
   Its build is ADR-0056's obligation, and that obligation now has a measured size rather than an
   estimate: a launcher of this shape was **330,752 B** with two pure-Rust dependencies, and assembling
   the archive plus a release build plus the append took **35.1 s** on top of the `--dir` build — against
   the **≈2 m 40 s** each `electron-builder` `portable` build cost. It removes a compression step rather
   than adding one. Two properties are non-negotiable and both come from the
   measurements: it must place the payload at file-copy speed rather than at the 30–39 MB/s the tool's
   own stub achieves, and its steady-state path must not read or hash the payload. **Both were met and a
   third has been added by measurement:** a launcher of this shape wrote the tree at 410.7–565.7 ms against
   the 684–722 ms a plain recursive copy took, and its steady-state check costs 0.14–5.87 ms depending on
   whether the manifest is included. The third property is that **its commit must displace before it
   renames and its check must verify every file**, because a launcher that does neither passes every
   timing test in the spike and still fails `REQ-STARTUP-165` (c) in two observed ways. The two defects
   this stub is now specified against were found by building it and damaging its output, not by reading
   this record — which is the strongest argument there is for exercising the damage cases in the build.
6. **A first run of each version is slow, and nothing tells the user why.** `REQ-STARTUP-165` (c) and
   `REQ-STARTUP-150` forbid reporting anything about preparing, reusing, superseding or redoing a
   preparation — so a user who updates and then waits while their machine writes several hundred
   megabytes sees only a slow launch. That is the specification's deliberate choice and this record
   implements it; it is named here because it is the most likely user-visible surprise the design
   creates, and because the temptation to add a splash will recur. **The silence is now four outcomes
   wide and no wider**: a fifth, the run that could produce no preparation at all, is reported, and the
   two amended requirements say so in terms. Implementing four-silent-one-loud from a habit of "the
   preparation is silent" is the specific error this consequence exists to prevent.
7. **Disk cost is one payload per artifact version present, until reclamation runs.** Reclamation is
   best-effort and post-show, so a machine that is updated repeatedly without the application being
   allowed to finish starting will accumulate preparations. They are all under one root and all named by
   token, so the state is inspectable and removable by hand — which is what `REQ-STARTUP-165` (b)'s
   identifiability clause buys.
8. **The portable is no longer built by the same target as the other Windows artifact.** The installer's
   payload and the portable's payload are the same `win-unpacked` tree, so they cannot silently diverge —
   but they now travel through two mechanisms, and `REQ-STARTUP-159`'s per-artifact claim plus
   `REQ-STARTUP-156`'s per-artifact gate are what keep that honest. The gate's two-run requirement for a
   preparing artifact is the specific check that this design's steady state, not merely its first run,
   is what ships.
9. **The stub is now on the critical path of a user-visible notice, not only of a launch.** The marker it
   writes is what the application reads to decide whether to warn, so a stub that places the payload
   correctly but writes the marker wrongly produces either a missing warning or a spurious one. A missing
   warning is the worse of the two and is invisible: the artifact is permanently slow and nothing says
   why, which is the exact outcome `REQ-STARTUP-165` (c)'s closing sentence was written to prevent.
10. **`REQ-STARTUP-168` (b) obliges the release pipeline to remember something about builds that already
    shipped** — which keys each still-offerable release's artifacts carry. That record cannot be
    recomputed from a checkout, so it must be kept deliberately from the first signed release onward. It
    is cheap to start and impossible to reconstruct later, which is the reason it is a consequence rather
    than an implementation note.
11. **A release now publishes five files where it published four**, and the fifth is the one the naming
    scheme does not name. `REQ-STARTUP-032`, `REQ-STARTUP-035` (3) and `REQ-STARTUP-152` each except the
    manifest and its signature individually, so the agreement rules stay decidable — but the pipeline now
    has two assets outside the naming module's output, and a check that enumerates "every published asset
    is a value of the scheme" without those two exceptions will fail on a correct release.
12. **The completeness check is now a per-file check, and its cost lives on the fast path of every
    launch.** It was 0.14–0.49 ms and is 3.56–5.87 ms. Against 5,000 ms that is nothing, and it is stated
    as a consequence anyway because it is the item a later optimisation pass will find first and the item
    a later optimisation pass must not touch. **The check earns its cost against a failure that produces
    no window and no message**, which is the least debuggable outcome the artifact has.
13. **The payload is shipped compressed, and the reason is no longer only artifact size.** A 508 MiB
    uncompressed artifact reproduced a **31.2–33.9 s cost before any of our code ran**, three times out of
    three, on the first cold execution of newly built content — with the launcher's own internal timeline
    normal (1.26–2.34 ms to the start of preparation), so the time was spent by the operating system
    creating the process. Eight controls showed nothing comparable: fresh copies of the same content at
    the same size, and newly built artifacts at 182.7 MiB, all launched cold in 1.8–3.0 s. Microsoft
    Defender was enabled throughout and an on-access scan of a large unfamiliar executable is the obvious
    candidate, but **the cause was not established and is not claimed** — no elevation was available, no
    scan trace was captured. What is established is the observation and its condition. It lands inside the
    exempt run so it does not threaten the ruling; it is recorded because it is a **third** reason
    alongside `REQ-STARTUP-032`/`-038` and `REQ-STARTUP-124`'s download not to ship the payload
    uncompressed, and because a build that switches to `store` for speed would reintroduce it invisibly.
    The compressed artifact measured 182.68 MiB against 508.23 MiB and showed none of it.
14. **The one branch of `REQ-STARTUP-165` (c) this record wrote from scratch on 2026-09-02 is still
    unmeasured.** The spike exercised every damage class and every reuse path, and did **not** exercise a
    run that can produce no usable preparation at all — a full disk, a refused write, unavailable storage
    — nor the notice that branch owes. That is the one preparation outcome the product reports, the one
    place three components must agree about a marker for a warning to appear, and the failure mode is a
    **missing** warning. It stays owed. *2026-10-23: the stub's half is measured on Linux — the run starts from a
    placement in the transient-files storage that is removed afterwards, its marker naming the root — and the
    notice is still not built ("The portable, the assisted installer and the icon").* Clause (d)'s "issues no network request and raises no elevation
    prompt" is likewise true by construction of the launcher and **was not independently verified** — no
    network capture and no privilege trace was taken.
15. **A power loss between writing the tree and its data reaching the disk can produce Defect B's damage
    class by accident.** The measured launcher flushed only the marker before the commit; the filesystem
    journals the rename but not the payload data, so a torn tree can in principle sit behind a valid
    marker. The manifest check catches a torn tree whose file **lengths** are wrong and not one whose
    lengths are right, and flushing 507.9 MiB before the commit would change the first-run figures by an
    amount nobody has measured. Recorded as a known residue of the commit discipline rather than resolved.

# ADR-0054 — Packaging, the four artifacts, and self-update — Alternatives considered

Part 2 of 22 of [ADR-0054](../0054-packaging-artifacts-and-self-update.md), which indexes every part.

## Alternatives considered

**A — `electron-builder` for the artifacts *and* `electron-updater` for the update path.**

*For:* the well-trodden path and the vendor's own pairing; a per-user NSIS installer, a portable
executable, a disk image and an application image are all first-class `electron-builder` targets,
matching the four artifacts exactly; and `electron-updater` implements download, verification and staged
install for all four flavours.
*Against:* **`electron-updater` is unworkable against these requirements, for several independent
reasons, each sufficient on its own:**
- It consumes its own metadata files (`latest.yml` and its per-platform siblings) and publishes
  block-map files alongside the artifacts. The naming rule requires *every* filename a release publishes
  to be a value of the single naming scheme, and the release body carries exactly one row per published
  asset except the manifest. **Extra published assets break both.**
- It verifies against a digest recorded in its own metadata, not against the manifest that is made the
  **sole** verification source, and it expects code-signature validation on two platforms, which the
  unsigned decision removes.
- Its macOS strategy **replaces the installed bundle**. The requirement is the opposite: the bundle is
  left byte-for-byte unchanged and never replaced automatically; the disk image is mounted and revealed
  for the user to complete the move.
- Its Windows differential update and its own flavour detection do not correspond to the registry-record
  discriminator or to the rename-aside portable strategy.
- It supports channels and configurable feed URLs, which the undisableability criterion forbids being
  reachable at all.

**B — `electron-builder` for the artifacts; a bespoke updater implementing the requirements directly.**
Chosen.

*For:* the update behaviour is fully specified, down to failure sentences, progress granularity, the
cleanup of the renamed-aside file and the auto-close delay. A bespoke implementation is a **direct
transcription** of those requirements rather than a fight with a library's assumptions.
`electron-builder` still earns its place, and that is the selection criterion: it produces the per-user
installer with its silent and directory switches, the registry writes, the disk image with its
applications-folder symlink, the application image, and the Windows payload tree the portable is built
from — and it lets each of them be named by template and published without metadata. *(This clause
originally read "exactly the four artifact shapes required, including … the single-file portable". Three
of the four still come from the tool; the portable's wrapper no longer does — see alternative P1.)*
*Against:* we own the updater, including its failure paths and its cross-platform file operations. The
portable strategy renames the artifact aside while the application runs — legal on Windows, and under
`REQ-STARTUP-165` the artifact is no longer the file the process is executing, which makes it easier
rather than harder; it and the application-image in-place replacement both still need real testing.

**C — Electron Forge with custom makers, plus the bespoke updater.** *Against:* its installer,
disk-image and application-image story is thinner, and the exact requirements — per-user install with no
elevation, an exact artifact naming scheme, an applications-folder symlink, a distribution baseline —
are precisely where `electron-builder`'s maturity pays.

### For the Windows portable's launch path — reopened, and re-decided on measurement

**P1 — `electron-builder`'s `portable` target, unchanged.** *This record's original choice. Refused on
measurement.*

*The argument it was chosen on, preserved:* the target produces exactly the artifact shape
`REQ-STARTUP-013` and `REQ-STARTUP-031` require, it shares its naming control and its machinery with the
NSIS installer, and it composes with the rename-aside apply strategy. **All of that still holds.** What
did not hold was an unstated assumption underneath it: that the resulting artifact starts in time.

*What changed.* First paint on the portable measured **13,287–19,580 ms against a 5,000 ms budget**,
across four bundle weights — and the smallest figure of all, 13,287 ms, is a **zero-payload build with a
warm cache**. There is no bundle weight at which this artifact passes, because it fails with nothing in
it. Two contributing facts settle it beyond tuning:

- **92 % of the launch is over before our process starts.** The stub self-extracts an entire runtime
  before any of our code exists; the median cost from our process's own time origin to first paint is
  1.24 s and is comfortably inside budget.
- **There is no warm path.** The stub **deletes its extraction directory when the application exits**, so
  every launch extracts 100 % of the tree from scratch. No configuration gives a user a faster second
  launch, and nothing may be cached in that directory between launches. This corrects a standing
  assumption in the record.

Both compression settings the tool offers were built and measured and neither closes the gap: deflate
lands at 7,433–7,791 ms warm for a 66 % larger artifact, and **uncompressed — the floor of the
mechanism — still lands at 5,307–6,087 ms warm** for a 508.6 MiB "single executable file", which is over
budget while also being an artifact whose size is its own problem for the download and update paths
(`REQ-STARTUP-032`, `REQ-STARTUP-124`). The stub places the tree six to
seven times slower than the operating system does: a plain recursive copy of the identical 508 MB tree
took **684–722 ms**. Roughly 70 % of the overhead is decompression and 25 % is the stub being slower
than a file copy; neither is disk-bound, so neither improves on faster storage.

The same payload as a directory tree paints in **664–1,561 ms** installed, and **1,232–1,593 ms** from a
path never launched from before with a cold cache. Bundle weight is close to free on that flavour: 327 MB
of additional payload moved first paint by about **10 ms**. So neither ADR-0040's syntax-tree parser nor
ADR-0035's bundled runtime is the cause; the packaging mechanism is.

**P2 — Keep `onefile` and give the portable its own budget.** *Refused by SR-7.* The budget it would need
is at least 17.5 s at the anchor weight and 19.6 s at the heaviest measured. `REQ-STARTUP-155`'s own text
exists to forbid a per-flavour differential, and a 17.5-second launch is not a product anyone wants.

**P3 — Keep the budget and make the portable a `onedir` tree.** *Refused by SR-7.* The measurements say
it passes with about 3.4 s of headroom, and it costs exactly the observable the artifact exists to
provide: `REQ-STARTUP-013`'s "a single executable file that runs with no support tree beside it", inside
`REQ-STARTUP-031`'s closed four-artifact set.

**P4 — Keep both, and replace the extraction mechanism: prepare once into per-user machine-local
storage, and launch from that preparation thereafter.** **Chosen — this is SR-7's ruling, and
`REQ-STARTUP-165` is the contract it must satisfy.**

*For:* it keeps `REQ-STARTUP-013` and `REQ-STARTUP-031` untouched and pays the extraction cost exactly
once per artifact version, which is also what users already expect of portable applications. The
0.7-second file-copy baseline for the same tree says the steady-state target is reachable by a
mechanism working at file-copy speed rather than at the stub's 30–39 MB/s.
*Against:* the mechanism is outside `electron-builder`'s portable target, so **we own the stub** as well
as the updater — a build-toolchain obligation ADR-0056 did not previously contemplate — and the
steady-state launch figure has not been measured on it. **The 0.7 s baseline is a baseline, not a
result.**

*What measurement has since established about this argument.* The baseline is now a result and the
mechanism beats it. On the same machine, the same Electron and the same 507.9 MiB payload tree spike 17
used as its anchor, a launcher of the shape this record describes writes that tree in **410.7 ms
(uncompressed) to 565.7 ms (deflate)** against the `fs.cpSync` baseline of **684–722 ms**, because it
writes large chunks in parallel rather than files in sequence. First paint from the preparation is
**575.5–624.2 ms warm and 897.3–1,242.5 ms cold** (n=6 each), replicated independently against the
earlier, uncorrected launcher build at 581.3–723.1 ms and 964.0–1,414.6 ms. **The worst cached launch
observed anywhere in that spike is 1,414.6 ms — 28 % of the budget.** The whole launcher costs about **37 ms** warm over
launching the prepared tree directly, of which `CreateProcess` on the 233.9 MB Electron executable is
18.6 ms.

Two of that argument's "against" clauses are now priced rather than feared, and one qualification is
added rather than removed. The exempt preparing run was measured anyway and lands **inside the bound it
is exempt from** — 1,634.7–2,091.3 ms warm, 1,710.2–2,037.0 ms cold, and **3,798.8–3,909.8 ms even when
forced to a single thread**, so the exemption is a margin rather than a dependency at this bundle weight.
The qualification is that the measured application **contains no product at all** — no framework, no
store, no native module, no preload, no theming — and the clock starts at `CreateProcess` from a parent
rather than at a double-click in a file manager, so **575.5–1,414.6 ms is a lower bound on the packaging
and runtime cost and nothing else**. The number this record and ADR-0055 may spend is the headroom:
roughly **3.6–4.4 s**.

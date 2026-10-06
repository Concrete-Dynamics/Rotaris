# ADR-0054 — Packaging, the four artifacts, and self-update

- **Status:** proposed
- **Date:** 2026-08-31
- **Revised:** 2026-09-01. **Reopened and re-decided.** The packaging tool's own portable target cannot
  meet `REQ-STARTUP-155` at any bundle weight, including an empty one; SR-7 rules that the artifact
  prepares itself once and launches from that preparation, and `REQ-STARTUP-165` now states the contract
  that preparation must satisfy. Both escalations this record raised are also ruled and are converted
  from open questions into decisions.
- **Revised:** 2026-09-02, against the settled specification, and it moves this record in three places.
  **ESC-8's signature mechanism is decided against the shape this record proposed** — `REQ-STARTUP-167`,
  `REQ-STARTUP-168` and an amended `REQ-STARTUP-032` publish a **detached** signature as a fifth asset and
  make the *build* carry a set of keys, where this record argued no new filename could appear and put the
  rotation in the manifest. **The one gap this record's own "Revisit if" named is closed**:
  `REQ-STARTUP-165` (c) now states the outcome for a preparation that cannot be made at all, and the
  design is built to it below rather than left owed. And the native-module obligation is widened to the
  store binding and pointed at ADR-0056's build-time proof.
- **Revised:** 2026-09-02, a second time, and this time against **measurement** rather than against text.
  SR-7's gate condition was measured and **SR-7 is vindicated**: a cached launch paints in 575.5–624.2 ms
  warm against 5,000 ms, and the worst cached measurement taken anywhere in the spike is 1,414.6 ms. The
  "Revisit if" clause that turned on that number is discharged below. But the same run found **two defects
  in the mechanism this record specifies, both observed rather than inferred** — the commit step does not
  work on Windows, and the completeness check passes a damaged preparation that then launches to no window
  at all — and both are corrected in the Decision. **The corrections do not reopen P4; they are what makes
  P4 work.**
- **Origin:** UI (ADR-UI-12)
- **Depends on:** ADR-0001, ADR-0002, ADR-0020, ADR-0042, ADR-0049, ADR-0055, ADR-0056, ADR-0058
- **Governed by:** `owner-decisions.md` ESC-8, ESC-11, SR-7, and the consequence for ADR-0058 recorded
  with ESC-21
- **Evidence:** `../spikes/cached-portable-launch.md` — the measurement of the preparation mechanism this
  record specifies, and the source of every figure below that is not attributed to another spike;
  `../spikes/packaged-first-paint.md` for the `electron-builder` `portable` target that P1 was refused on;
  `../spikes/windows-writer-handle-compaction.md` §3.2 for the Windows replace semantics the update path
  depends on.

## Context

`REQ-STARTUP-031`, `REQ-STARTUP-013`, `REQ-STARTUP-014`, `REQ-STARTUP-020`, `REQ-STARTUP-022`,
`REQ-STARTUP-024` and `REQ-STARTUP-016`: **four published artifacts and no others**, from a single
naming authority — a Windows setup executable, a Windows portable executable, a macOS disk image and a
Linux application image, each with an exact name template. The Windows portable is the **only**
single-file artifact; every other payload is a directory tree. macOS is a single architecture with a
fixed bundle identifier. The Linux image runs unextracted on a stated distribution baseline. Windows
installs **strictly per-user with no elevation**.

`REQ-STARTUP-021` and `REQ-STARTUP-023`: binaries are **deliberately unsigned and un-notarized** on
Windows and macOS; the platforms' first-launch warnings are expected and disclosed.

`REQ-STARTUP-105`, `REQ-STARTUP-111`, `REQ-STARTUP-114` and `REQ-STARTUP-152`: the update check contacts
**exactly one endpoint** — the release API of the product repository — with a 10.0 s timeout and a fixed
accept header, **once per window activation, only after the window is visible**, and it **cannot be
disabled by any user-reachable means**; the acceptance criterion is that four closed configuration
enumerations contain **no entry naming update checking, an endpoint, a release source, or a channel**.

`REQ-STARTUP-108`, `REQ-STARTUP-032`, `REQ-STARTUP-113` and `REQ-STARTUP-123`: asset selection is
**exact-name matching only** — same case, same separators, same literal version text; abbreviated,
re-cased, re-separated, prefix, suffix and substring matches are all rejected, and a release with no
exact match simply offers nothing. Verification is against a checksums manifest published with that
release, two-space separated, sorted by filename, compatible with the standard checking tool and never
self-listed; **a release publishing no manifest is refused as unverifiable.**
`REQ-STARTUP-152` and `REQ-STARTUP-035`: **every** asset a release publishes, every filename its
manifest lists, and every filename the update client asks for are values of that **one** naming scheme
and must agree, with the release body carrying exactly one row per published asset **except the manifest
and the signature published over it**.

**`REQ-STARTUP-167`, `REQ-STARTUP-168` and the amended `REQ-STARTUP-032` add a second check the previous
version of this record did not have and could not have anticipated the shape of.** The manifest is now
signed by a detached `SHA256SUMS.txt.sig`; the signature is verified **before the manifest is parsed and
before any asset is fetched** (`REQ-STARTUP-122`); every published artifact carries the verification
counterpart inside itself, resolved from what was installed with no additional download; the set of keys
a build accepts is fixed when that build is produced and **nothing at run time may add to, replace or
disable it**; and a release published without a signature this build can verify is never installed by it,
with no override of any kind. See the ESC-8 section below, which this supersedes in mechanism and not in
ruling.

`REQ-STARTUP-125`, `REQ-STARTUP-119`, `REQ-STARTUP-115` and `REQ-NOTIFY-220`: **four apply strategies
selected by installation flavour, not by operating system**, each with a fixed observable result — a
hidden sibling file moved onto the target while the running application is still running; a new file
beside the target with **the target artifact** renamed aside, rollback on failure and cleanup on a later
launch; a setup executable started as a surviving process with the application editing nothing itself
and its window auto-closing after a fixed delay; and, on macOS, **the disk image mounted and revealed
with the installed bundle left byte-for-byte unchanged and never replaced automatically**.
`REQ-STARTUP-126`: **not one file of the existing installation is moved or modified before the
replacement has been fetched in full and verified**, and a failure at any stage leaves what is installed
byte-for-byte what it was.

`REQ-STARTUP-106`: Windows flavour classification is decided by the **installer's own registry record** —
a value existing *and* **the artifact the launch started from** resolving inside the directory it names —
with every other Windows standalone build being portable; the application-image variable is tested first;
and a build not running from a released artifact is not updatable and issues no request at all.
**The requirement now says "the artifact", not "the running executable", and the difference is the whole
of the preparation trap** — see below.

`REQ-STARTUP-110`, `REQ-STARTUP-120` and `REQ-STARTUP-150`: a failed update **check** is always invisible
— log only, no user-facing failure path at all — while a failed update **install** is always visible as
a persistent error notice with copyable detail and a retry action. `REQ-SHELL-118`,
`REQ-STARTUP-118` and `REQ-NOTIFY-218`: download progress is reported **inside the offer notice, updated
in place, never replaced**, at whole-percent granularity or whole-unit granularity when the size is
unknown, with the action disabled for the duration and its accessible description saying why.
`REQ-STARTUP-116` and `REQ-STARTUP-117`: **exactly one waved-off version is remembered — never a list —
recorded before the notice naming it is cleared, and only by that notice.**

`REQ-SHELL-121` and `REQ-STARTUP-046`: shutdown leaves no partially written and no locked update file,
and waits for in-flight update work **at most a stated allowance**.

`REQ-STARTUP-024` is the sharpest sentence in the domain for a packaging tool: the Linux artifact is an
application image that **runs without being extracted first on an unmodified Ubuntu 24.04
installation** — "the oldest system-library baseline the artifact is required to support" — and
`REQ-STARTUP-159` restates the same claim generally: installing the platform's published artifact on
that baseline "with nothing else installed" and with outbound network blocked paints the main window.
**"Unmodified" is doing real work there**, and it is the one requirement in this record a packaging
tool's own defaults can fail on the user's machine while passing on ours.

**`REQ-STARTUP-165` — the launch preparation, and the whole of what the specification fixes about it.**
A `onefile` artifact **may** prepare itself once and start from that preparation on every later run of
the same artifact. Its form, its name and where within the named storage it sits are explicitly
implementation choices, and no user-facing surface exposes any of them. What is fixed: **(a)** it never
lands beside the artifact — it goes in the per-user data directories of `REQ-STARTUP-145`, in storage
**local to the machine** rather than shared with or replicated to another (`REQ-STARTUP-166`), and
starting the artifact writes nothing to the artifact's directory or medium, so a read-only or removable
medium is left byte-for-byte unchanged; **(b)** a preparation belongs to an artifact of **identical
content**, so a new version and a rebuilt artifact of the same version each prepare afresh, and a
preparation must be identifiable as belonging to its artifact so it can be removed without disturbing
another; **(c)** an incomplete, unreadable or foreign preparation causes the artifact to prepare again
and **must never cause the launch to fail, warn, or report anything** — preparing is the recovery path
and never the failure path, while a run that can produce **no** preparation at all still starts, places
what it must run in one of a **closed set of two locations** clause (c) fixes, and is the one preparation
outcome that is reported; **(d)** preparing uses nothing but the artifact, issues no network request,
raises no elevation prompt, and writes nothing outside the per-user directories of `REQ-STARTUP-145`
**save for that one run-scoped placement, which clause (d) now excepts in its own text**; **(e)** the run
can identify **the artifact file the launch started
from**, and that file — never the preparation — is what `REQ-STARTUP-106` classifies and
`REQ-STARTUP-125` replaces; **(f)** nothing else about the run differs, including the reported version,
the flavour classification and the single-instance resolution.

`REQ-STARTUP-155` gains exactly one exemption for it: the run that performs the preparation is exempt
from the 5-second first-paint bound, **for that preparation and nothing else**. "First run" means the
first run of a **given version of that artifact, on a machine, for the user who runs it** — and a run
that prepares again after an unusable preparation is a first run for this purpose, so recovering never
makes a build non-conformant. Every other run is bound by the same 5 seconds as every other artifact.
`REQ-STARTUP-013` and `REQ-STARTUP-031` are **unchanged**.

**`REQ-STARTUP-106` and `REQ-STARTUP-125` now state the preparation trap explicitly.** Both take the
classification and the update target from *the artifact the launch started from*, "however the running
image was started", and never from a copy the artifact made of itself in order to run —
`REQ-STARTUP-106`'s own words for why: doing otherwise "would replace a copy the product can recreate at
will and leave the file the user actually holds untouched, which is the one outcome an update must not
produce". `REQ-STARTUP-125` adds that where the running image is a preparation, the replacement still
lands on the artifact and the preparation is left to be superseded on the next launch under
`REQ-STARTUP-165` (b). `REQ-STARTUP-115`'s launch-time deletion of a leftover `<name>.old` is likewise
beside the **artifact**, and a launch that cannot reach that directory — removable medium gone,
read-only medium — treats the cleanup as having nothing to do rather than as a failure.

**`REQ-STARTUP-156`'s release gate has been amended and now catches what this record complained it would
not.** The gate must run on a machine of the platform key and, on Linux, on the unmodified baseline
`REQ-STARTUP-024` names — explicitly "not a machine the release owner has configured for building,
testing, or development" — with no separately installed component of the product, with outbound network
blocked, and against the published asset matching its listed digest. A check for which all four cannot
be established is recorded as **not performed** and fails the gate. For an artifact that prepares itself
the gate must observe **two runs on that same machine**: the one that prepares, and a later one where
the 5-second bound is actually measured.

**What was checked.** Context7, the electron-builder documentation, and the npm registry, 2026-08-31.
`electron-builder` is MIT; 26.15.x is the current stable line and 27.0.0-alpha.7 is the pre-release
line. `nsis`, `portable`, `dmg` and `AppImage` are all first-class targets, `artifactName` is a
per-target template, `nsis.oneClick` and `nsis.perMachine` select the assisted per-user installer, and
setting `publish` to null on a target suppresses the update-metadata files. On the AppImage runtime the
two lines differ, and the difference is user-visible — see the Linux-runtime ruling below (ESC-11).

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

## Decision

**Alternative B, with `electron-builder` (MIT) as the packaging tool, and alternative P4 for the
Windows portable's launch path.**

- **`electron-builder` produces three of the four artifacts directly** — the per-user NSIS installer
  (`nsis.oneClick`, `nsis.perMachine`), the disk image and the application image — with per-target
  `artifactName` templates producing their exact names. **Publishing must be off**, so no
  update-metadata or block-map files are emitted. The checksums manifest is generated by the release
  pipeline from the emitted assets, sorted by filename, two-space separated, never self-listed.
- **The fourth artifact, `Rotaris-{v}-windows-x64-portable.exe`, is assembled by the release pipeline
  from the `win-unpacked` payload `electron-builder` already produces**, wrapped by a launcher stub this
  project owns, rather than by the tool's `portable` target. The tool's target is refused for the reason
  in alternative P1: it cannot start inside `REQ-STARTUP-155`'s budget at any bundle weight and it
  offers no setting that closes the gap. **The artifact is still one executable file with no support
  tree beside it and still carries the one name `REQ-STARTUP-031` fixes**; what changes is what is
  inside it and what it does on first run. It is emitted into the same output directory as the other
  three, is listed in the same manifest, and is fed by the same naming module.
- **The artifact naming scheme is one module shared by the build configuration and the updater**, as
  `REQ-STARTUP-031` requires ("a single authority shared with the updater"), so the agreement rule is
  **structural**. The updater's asset lookup is **exact string equality** against that module's output —
  no normalisation, no case folding, no substring test.
- **The updater is a main-process module** with the strict sequence `REQ-STARTUP-122` now fixes: fetch
  the manifest **and its detached signature**; verify the signature; parse the manifest, and only then;
  stream the asset into a fresh staging directory in chunks; verify the digest; apply. **Parsing after
  verifying is the order, not an optimisation** — an unverified manifest must reach no parser of ours. It
  reports progress into the **same notice by identity, never by replacement**, at the specified
  granularity with a final settle update.
- **Four apply strategies, selected by flavour**, each a separate function with its own rollback story.
  The macOS one mounts and reveals and **changes nothing**; that is worth a comment in the code, because
  it looks like an omission.
- **Packaged-state detection is not sufficient for flavour classification.** The discriminator is fixed:
  the application-image variable first, then the macOS bundle, then on Windows the registry value *and*
  **the artifact** resolving inside the directory it names, everything else portable. Reading that
  registry value needs a small platform helper; this is one of the few places where a Windows-specific
  code path is unavoidable. **Every one of those tests takes the artifact, never the running image** —
  under a preparation the running image's own path answers a different question, and answering it is the
  failure `REQ-STARTUP-106` now names in its own text.
- **The platform's own auto-update mechanism is not used at all, on any platform**, and neither is any
  update feed other than the one endpoint.
- **The undisableability criterion is a property of the configuration surfaces, not of the updater.**
  ADR-0042's typed key registry makes one of the four enumerations checkable mechanically; the others
  belong elsewhere, and the check should be **a single test that reads all four registries**.
- **The application image must carry a runtime that mounts itself.** `REQ-STARTUP-024`'s "unmodified
  Ubuntu 24.04" makes the image's own runtime a requirement question, not a build detail: the legacy
  runtime dynamically loads `libfuse.so.2`, which that distribution does not ship, so an image built
  with it fails to launch on the stated baseline. **The version line is therefore selected by this
  requirement**, not by convenience — see the Linux-runtime ruling below (ESC-11).
- **Native modules must be rebuilt against the shell's binary interface and shipped unpacked from the
  archive — now two of them, and the obligation has a build-time proof behind it.** The pseudo-terminal
  binding of ADR-0020 was joined by ADR-0058's store binding when SR-4 put the product's system of record
  in a database. **ESC-21's comparison found that exact binding recorded as failing silently under an
  Electron runtime through an interface mismatch, with the error swallowed**, so this is no longer a
  packaging detail: ADR-0056 rules 1 to 4 make the rebuild explicit, force it from source, and require
  the packaged tree to be **proved to load** under its own Electron binary before an artifact is
  accepted. What this record adds is the packaging half. Unpacked addons are files in the payload tree,
  so the portable's launcher stub places them like everything else — **a verbatim copy, never a
  re-archive**, since an addon the stub repacked would be an addon the loader cannot open. And the
  pseudo-terminal's platform floor becomes a stated system requirement.
- **A binding that will not load is never caught and degraded.** For the store that is
  `REQ-SESSION-089`: the run refuses to start, naming the store and the engine's own error. The packaging
  interest in it is narrow and worth stating once, because it is the reason the build-time proof exists:
  **first paint does not open a store**, so `REQ-STARTUP-156`'s gate — download the published artifact,
  launch it, observe first paint — would pass on an artifact whose store binding cannot load. The gate
  does not see this. ADR-0056 rule 4 does.

### The launch preparation — what `REQ-STARTUP-165` leaves to this record

The specification fixes the properties; the following are the choices. Each is stated with the clause it
answers, so a reader can check the design against the contract rather than against intent.

**Where it lives — the per-user *local* application-data root, never the roaming one, and never beside
the artifact.** Clause (a) requires the per-user data directories of `REQ-STARTUP-145` and **storage
local to the machine rather than shared with or replicated to another** (`REQ-STARTUP-166`). On Windows
those two pull apart, and the trap is worth naming: the platform layer's conventional per-user
application-data path resolves under the **roaming** profile, which is precisely storage replicated to
another machine, and putting a half-gigabyte tree there would be an operational injury as well as a
conformance failure. **The preparation root is derived from the local application-data location, and the
platform layer's default user-data path is not used for it.** Beside the executable is refused outright
by clause (a) and by the purpose of the artifact: a portable must run from read-only and removable
media, and must leave that medium byte-for-byte unchanged. This is also consistent with ESC-15's ruling
that machine-local state belongs in machine-local storage.

**The roaming trap is confirmed on a real machine rather than anticipated.** Measured from inside the
running packaged application: the platform layer's default per-user data path resolved to
`C:\Users\…\AppData\Roaming\<app>`. A preparation derived from it would put 507.9 MiB **per version**
into replicated storage — clause (a) and `REQ-STARTUP-166` both violated, and an operational injury on
any machine with a roaming profile. Deriving the root from the local application-data location instead
landed correctly under `…\AppData\Local\`, and the two clause-(a) observables were checked directly: the
directory holding the artifact gained **no entries at all** across a preparing run and two cached runs,
and the artifact's `size`, `mtime` and `ctime` were **byte-identical** across all three snapshots (only
`atime` advanced, which is a read). With file creation and deletion denied on that directory by an
explicit deny ACE, the artifact still prepared (1,645.1 ms) and still launched from the preparation twice
(591.6 ms, 579.3 ms). **That last test is an ACL approximation and not a read-only volume**, so clause
(a)'s claims about removable and genuinely read-only media remain untested; the ADR relies on them and
should not be read as having evidence for them.

**How a version is identified — a build-time identity token carried in the stub, not a digest computed
at launch.** Clause (b) requires that an artifact start from a preparation only where that preparation
was produced by an artifact of **identical content**, so the key must cover content and not merely the
version string: a rebuilt artifact of the same version must prepare afresh. The identity is therefore
the product version **plus a digest of the payload, both computed by the release pipeline and embedded
in the stub**, and the preparation directory is named for that token. It is not recomputed at launch,
because hashing a 100–500 MB artifact on every start would spend a material part of the 5-second budget
on a question the build already answered. **The residue, stated rather than hidden:** the identity is
what the artifact *claims*, so an artifact whose bytes were altered without its token being altered
would reuse a preparation. The artifacts are deliberately unsigned (`REQ-STARTUP-021`,
`REQ-STARTUP-023`), so there is no integrity claim here for this to weaken — but it means clause (b) is
honoured for every artifact the build produces and not against an adversary.

**A second residue, found by measurement, and the field that answers it is load-bearing rather than
cosmetic.** The token is a digest of the **payload**, so it does not cover the launcher's own bytes.
Rebuilding the launcher without touching the payload produced a **byte-different artifact carrying an
identical token, and the existing preparation was reused.** That is defensible on its face — the launcher
is not in the preparation — but it means clause (b)'s "identical content" is carried, for anything about
the launcher that changes how the payload must be laid out, by the **marker's launcher-format field** and
not by the token. That field was exercised: bumping it forced a silent redo (`marker-format-mismatch`,
repainting at 1,611.0 ms). **A launcher change that alters the layout and ships without a format bump
would silently reuse an incompatible preparation**, which is the failure clause (b) exists to prevent
arriving by the one road the token does not watch. The field is therefore part of the release
pipeline's contract, not a comment.

**How a preparation is known to be complete — the directory name is the completion, and the commit is
displace-then-rename.** A preparation is written into a sibling directory under a name that cannot be
mistaken for a finished one, its contents flushed, and then committed onto the token-named path as the
last step. A directory bearing the token name therefore exists only if it was finished. This is what
makes clause (c) cheap: incomplete means absent, so the recovery path and the first-run path are the same
code.

**Defect A — corrected. The conclusion holds; the mechanism this record specified for it was tested and
does not work on Windows.** This record previously wrote the commit as *"renamed onto the token-named
path as the last step"*, with no displacement. **That was implemented exactly as written and measured to
fail: on Windows, renaming a directory onto an existing directory fails, and `MOVEFILE_REPLACE_EXISTING`
does not apply to directories.** The consequence is not theoretical and was observed twice, in the one
situation clause (c) is entirely about — a preparation that exists and is damaged:

- with the marker deleted and the tree intact, the redo prepared correctly, **could not commit, deleted
  its own work, and launched from the still-damaged directory.** The launch succeeded and the preparation
  was never repaired, so the artifact would re-prepare on every launch **for ever** — the silent
  degeneration `REQ-STARTUP-165` (c)'s notice clause exists to make visible, reached without any notice.
- with the entry point deleted, the redo could not commit, the entry point was still missing, the spawn
  failed, and **the launch produced nothing at all** — a flat violation of clause (c)'s "SHALL NOT cause
  the launch to fail".

**The mechanism that actually holds: where the token-named path exists and failed the check, rename it
aside to a `.stale-…` sibling first, then commit, and leave the stale directory for the reclamation pass
below.** Measured cost of the extra rename: **2.17–3.18 ms** (one outlier at 82.3 ms). Every timing
figure this record now carries was taken with that correction in place. **A reader who "simplifies" the
commit back to a bare rename reintroduces both observed failures**, and neither is visible in a build
that never meets a damaged preparation.

**What the fast path costs — one directory probe, one marker read, and a per-file presence-and-length
check. Priced, not asserted.** On every later run the stub resolves the preparation root, checks for the
token-named directory, reads the marker inside it recording the token and the launcher's own format
version, verifies the preparation against the manifest that marker carries, and executes the payload.
**It does not open the artifact and hashes nothing.**

The costs are measured against the real 507.9 MiB preparation and the real 182.7 MiB artifact:

| what | warm | first touch on a cold cache |
|---|---|---|
| marker read + format/token/entry-name compare + entry-point stat | **0.14–0.49 ms** | **0.37 ms** |
| the per-file manifest check added below (all files stat-ed) | **3.56–5.87 ms** | 3.58–4.09 ms |
| *rejected:* SHA-256 over the artifact, fastest implementation on the machine | 709.6–845.0 ms | — |
| *rejected:* SHA-256 over the artifact, a pure-Rust digest a small stub would embed | 1.48–1.95 s | 1.38 s |
| *rejected:* SHA-256 over every file of the prepared tree | 4.43–5.50 s | 3.89–3.91 s |

So the whole fast-path check is **under 0.13 % of the 5,000 ms budget**, while the digest this record
rejected costs **14–17 % of it on every launch** — and 39–44 % if the artifact were shipped uncompressed
at 508 MiB, where the same digest took 1,929.5–2,207.1 ms — spent to answer a question the build already
answered. Digesting the prepared tree instead is worse still and **alone consumes or exceeds the whole
bound**. **The decision not to recompute a digest at launch is correct by a wider margin than this record
claimed.**

**And there is a second reason to compile the token in that this record did not state and should.** The
justification given was the cost of hashing. Measurement found a sharper one: reading a 24-byte footer
from the artifact costs 78.8 µs once the file has been opened before, but **its first open on a cold
cache cost 342.9 ms** — nine hundred times the cold cost of a check confined to the preparation. A
metadata-only `stat` of the artifact does not pay this; `open` does. A footer-reading fast path would
therefore pay about a third of a second on the first launch after every boot, and it would put a handle
on the file the updater must rename. **The phrase to hold on to is "does not open the artifact", not
"reads none of the payload".**

**When it is redone — always, silently, on any doubt.** Clause (c) makes preparing the recovery path and
forbids it being the failure path. So: token-named directory absent, marker absent, marker unreadable,
marker naming a different token or an unrecognised format, the payload's own entry point missing, **or
any file the marker's manifest names being absent or of the wrong length** → **prepare again**, with no
message, no notice, no log line the user sees, and no failure. `REQ-STARTUP-150` restates the same
silence. A repeated preparation is a first run of that version for `REQ-STARTUP-155`'s purpose, so
recovering never makes a build non-conformant. Measured: all eight marker-and-entry-point damage classes
were detected and redone silently, repainting in **1,611.0–1,967.5 ms**, which is inside the bound they
are exempt from, and nothing was reported to the user on any of them.

**Defect B — corrected. The conclusion holds; the check this record specified for it was tested and
passes damage that then produces no window at all.** This record previously closed the redo trigger at
"the payload's own entry point missing". **That check was implemented exactly as written and measured to
return a cache HIT on a preparation that cannot run.** Two damage cases, each applied to a freshly
committed preparation:

| damage | what the check said | what the launch did |
|---|---|---|
| a runtime library (`ffmpeg.dll`) deleted from the tree | **hit** | process started, **no window ever appeared** |
| `resources\app.asar` truncated to 1 KiB | **hit** | process started, **no window ever appeared** |

**Both were confirmed independently**, by running the prepared executable directly and reading its own
report: with the library removed it exited 3 having never painted; with the archive truncated it exited 1
having produced no report at all. Two earlier runs of the same shape sat in the harness's 90-second
window and returned first-paint times of **90,198.5 ms and 90,200.4 ms** — the process started and then
never painted. **That is `REQ-STARTUP-165` (c) unmet**, in the requirement's own words: an incomplete
preparation caused the launch to fail. It is also invisible: nothing reports it, because clause (c)
forbids reporting, and the artifact simply does not start.

**The check that actually holds: the marker carries the path and length of every file the preparation
contains, and the fast path stats them all.** Measured at **3.56–5.87 ms warm — about one tenth of one
per cent of the budget** — and it catches deletion, truncation, and the wholesale removal of a subtree,
which is what an antivirus quarantine, a partial delete and a disk error actually do. **It does not
catch silent in-place corruption at unchanged length; nothing short of a digest does**, and the table
above prices digesting the tree at 3.89–5.50 s across both cache states, which alone consumes or exceeds
the whole bound. That
residue is accepted and stated rather than closed.

**This is why the marker cannot be optimised away, and the temptation to do it is real.** The obvious
saving on a fast path is to carry the token in the directory name and stop reading the marker at all.
Under this revision the marker carries three things nothing else can: the launcher-format field that is
the only guard on a layout-changing launcher change, the manifest that is the only guard against a
damaged preparation launching to no window, and the preparation-failure outcome the application must
read to raise `REQ-STARTUP-165` (c)'s notice. **Removing the marker read reintroduces Defect B by
construction.** A reader who wants that 4 ms back should read the previous paragraph first.

**When it cannot be done at all — the one preparation outcome that is reported, and it is now specified.**
The previous version of this record ended its "Revisit if" with *"that case needs a stated outcome and
does not have one"*. **It has one.** `REQ-STARTUP-165` (c) gained a second half: where a run produces no
usable preparation at all — "the storage of clause (a) refusing the write, being full, or being
unavailable, so that redoing it does not succeed either" — that run **still starts the artifact**, runs it
with every behaviour of clause (f) unchanged, is **exempt from the first-paint bound on
`REQ-STARTUP-155`'s terms** because it performs exactly the work a preparation exists to avoid, and **is
reported**: once per such run, after the window is painted, on the persistent non-modal non-blocking
surface `REQ-STARTUP-116`'s offer uses, at warning severity, conveying three things — that the artifact
could not prepare itself and is therefore starting the slow way; **which storage** it could not prepare
into, named as the per-user data location of clause (a) and `REQ-STARTUP-145` and never as the placement
within it; and that every launch will cost what this one cost until that storage accepts a preparation.
It may not state or imply that the artifact cannot be used. `REQ-STARTUP-150` and `REQ-STARTUP-165` (f)
were both amended so that this notice is the single carved-out exception to the silence.

The requirement fixes the outcome. Three things it leaves to this record, and the design is stated
against each:

**What the run actually does, since it must still start.** The payload is a tree of executables and
loadable libraries; there is no way to run it without it existing as files. So the stub does the
preparation's work into a placement it does not keep: written under a name that is not the token name,
used for this run, and removed when the run ends. **This is deliberately the shape of behaviour the
tool's own stub had** — placing the whole payload on every launch, which spike 17 measured at
13,287–19,580 ms — and that is the honest outcome rather than a defect, because it is exactly what the
notice tells the user is happening. The difference from P1 is not the shape; it is that the cost is now
**disclosed**, which is what the old "Revisit if" meant by returning to P1's behaviour "without returning
to P1's honesty". **The cost itself is no longer P1's**, and the figure should not be quoted as though it
were: this launcher places the same tree at 410.7–565.7 ms, so the measured price of the cannot-prepare
run is the preparing run's own — **1,634.7–2,091.3 ms warm at this bundle weight, up to 3,798.8–3,909.8 ms
on a single core** — paid on every launch until the storage accepts a preparation. That is an order of
magnitude cheaper than P1 and it is still worth warning about, which is why clause (c) warns about it.

**Where the ephemeral placement goes. The specification now fixes this and no longer leaves it to a
reading.** The previous version of this record took a conservative reading of clause (d) and recorded the
root-refuses-every-write case as a specification defect it designed around. **That defect is closed.**
Clause (c) now fixes the permitted locations as a **closed set of two**: the per-user data directories of
`REQ-STARTUP-145`, "which is where it goes wherever they will accept it"; or, "only where those
directories accept no write at all, the storage the platform designates for a user's transient files".
There is no third, and clause (d) now states the same thing from its own side — its prohibition "governs
a preparation … and it has exactly one exception, which is the run-scoped placement clause (c) permits
where those directories accept no write at all".

So the design is: **the placement goes under the same per-user local root the preparation would have
used** — a sibling of the token-named path — for the failures that actually dominate, which are a full
disk, a quota, an antivirus hold on one directory, a token path left unreadable; and **only** where that
root accepts no write of any kind does it fall back to the platform's transient-files storage. Every
prohibition of clause (a) holds over both: not beside the artifact, not on its medium, not in storage
shared with or replicated to another machine, and no elevation prompt. What the notice names is still the
storage a *preparation* could not be made in, never the placement.

Three properties of the placement come from clause (c) directly and are easy to lose. It **is not a
preparation and must not be kept as one**: it serves that one run, is removed when the run ends, and is
never started from again, so the next launch does exactly what this one did rather than inheriting
anything. `REQ-STARTUP-151` puts it **before the paint**, on the same terms as a preparation. And the
residual case — neither kind of storage accepting any write — is bounded away by the requirement itself:
"there is nowhere on that machine the artifact's contents can be run from at all, and this clause's
obligation to start is not reached." The record no longer owes a reading here.

**How the application learns of it, given that the stub is what knows and the two closed lists forbid the
obvious channels.** The notice is raised after the window is painted, by the application; the failure is
observed before the application exists, by the stub. Something has to cross that gap. Three candidates
were weighed and two are unavailable:

- **A second environment variable.** Refused. `REQ-STARTUP-147` enumerates the variables this domain
  reads and the list is closed at four kinds — the application-image variable, the bundled-runtime
  override, the Windows command interpreter, and "the variable by which that form names the artifact file
  a launch started from", whose value the requirement says "is a file path and nothing else". A status
  flag is none of those, and adding one would need an amendment for a channel we do not need.
- **A launch argument.** Refused. `REQ-STARTUP-152` and `REQ-STARTUP-002` state the product has no
  argument vocabulary, no subcommand and no flag, and ADR-0055 already carries **OQ-43** *(ruled 2026-10-06,
  [R-071](../../product/requests.md#r-071): `PD-STARTUP-002`)* for the one
  sentinel argument the internal-child branches need. Deepening a question this record does not own, for
  a second use, is the wrong direction.
- **The marker the stub already writes into the tree it placed.** **Chosen.** The fast path already reads
  a marker recording the token, the launcher's format version and the completeness manifest; the marker
  gains the run's
  **outcome** and, where the outcome is a failed preparation, **the per-user root it could not write** —
  which is precisely the value the notice must name. The application reads it relative to its own image.
  This adds no vocabulary to either closed list, costs one small file in a tree being written anyway, and
  has the property that matters most: **the storage named in the notice is the storage the stub actually
  failed on**, not a path the application recomputed and might compute differently.

  Two rules keep the marker from becoming a way to fake a preparation. It is placed **inside the tree**,
  so it travels with the placement rather than being addressable on its own; and **a marker recording a
  failed preparation is never at the token-named path**, because the rename onto that path is what
  completion means. A directory bearing the token name still exists only if it was finished, so clause
  (c)'s "incomplete means absent" is untouched.

**What must not happen on this path**, stated because each is a plausible mistake: the notice must not be
raised on the ordinary preparing run, the reusing run, the superseding run or the redoing run — those
four stay silent under `REQ-STARTUP-150`; it must not be raised more than once for the run; it must not
be phrased so the user reads it as the workspace-storage warning of `REQ-STARTUP-166`, which lands on the
same surface at the same severity and is about a different thing; and it must not delay first paint,
since it is a post-show notice about a cost already paid. Where it sits in the post-show order is
ADR-0055's.

**Two launches racing to prepare, which SR-1 does not prevent.** The preparation happens in the stub,
**before** the Electron process exists and therefore before the instance claim of `REQ-STARTUP-164` can
resolve anything. Two double-clicks in quick succession produce two stubs both preparing. Each writes
its own unfinished directory, and the rename decides: the loser finds the token-named path already
present, **discards its own work and uses the winner's**, since by clause (b) an identical artifact's
preparation is interchangeable. The loser pays one wasted extraction; nothing is corrupted and nothing
is reported. Both then launch, and the ordinary single-instance resolution hands one to the other.
**Measured, by wiping the root and spawning the artifact twice back to back:** the loser found the
token-named path already present, discarded its own work and re-checked successfully; the root afterwards
held exactly one directory, 73 files, 507.9 MiB, no leftover temporary, and both launchers exited 0.

**Reclaiming superseded preparations.** Clause (b) requires only that a preparation be *identifiable* as
belonging to its artifact so it can be removed. Left alone, an update would leave roughly a payload's
worth of disk behind per version. So: after the window is shown and off the critical path, a run started
from a preparation removes preparations under the same root bearing **other** tokens, and the
`.stale-…` displacements the corrected commit leaves behind. It is best-effort — a deletion that fails is
retried on a later launch and never reported, exactly as `REQ-STARTUP-115` treats its own leftover — and
it is **not** part of the closed background activation `REQ-STARTUP-043` enumerates, so it must not be
scheduled as though it were. **Both halves of that trade are now measured.** Running v1.0.0 and then
v1.0.1 left two token-named directories of **73 files / 507.9 MiB each**, each carrying its own marker
naming its own token, so the cost of not reclaiming is one full payload per version left behind;
deleting one costs **86.9–90.6 ms**, so the post-show placement is comfortable rather than tight.

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

## Ruled — what the update path establishes (was an escalation; ESC-8)

The options this record raised were: **(a)** keep it as specified, disclosed in the release notes;
**(b)** add code signing and notarization; **(c)** sign the checksums manifest with a key shipped in the
application. **The owner ruled (c).**

The reasoning recorded with the ruling: `REQ-STARTUP-021`, `REQ-STARTUP-023` and `REQ-STARTUP-123` leave
binaries deliberately unsigned, so as specified the update path establishes *what* was downloaded and
nothing about *who* published it, over the same connection the download came from. Signing the manifest
gives publisher authenticity for updates, is materially cheaper than full code signing and notarization,
and **does not change first-launch platform warnings** — so consequence 2 below stands unaltered.

**The ruling is unchanged. The mechanism this record proposed for it is superseded**, and the
specification has since fixed both halves it left open. `REQ-STARTUP-167` is now the product's single
definition of publisher authenticity; `REQ-STARTUP-168` fixes rotation; `REQ-STARTUP-032`,
`REQ-STARTUP-035`, `REQ-STARTUP-122`, `REQ-STARTUP-123` and `REQ-STARTUP-152` carry the consequences.

**Superseded, and preserved because the argument was sound and only its premise was wrong.** This record
held: *"the signature must not become a fifth published asset. `REQ-STARTUP-152` and `REQ-STARTUP-035`
require every filename a release publishes to be a value of the one naming scheme, with exactly one
release-body row per published asset except the manifest. A detached signature file would be a filename
the scheme does not name. The signature therefore travels inside the manifest … the constraint it must
satisfy is that no new filename appears."* And on rotation: *"rotation therefore requires a period in
which the manifest carries signatures under both the outgoing and the incoming key."*

**What changed is that both constraints were amendable and were amended, which is not something an
architecture record gets to assume.** The naming rule was not a fact about the world; it was a
requirement, and the specification chose to widen it rather than to contort the signature into the
manifest. Reading the amended text against the old argument:

- **`REQ-STARTUP-032` now names the file.** The signature is `SHA256SUMS.txt.sig`, a detached signature
  over the manifest's **exact published bytes**, published beside it. The manifest lists neither itself
  nor the signature, and the requirement gives the reason this record did not have: *"the signature is
  what establishes the manifest rather than something the manifest establishes, and a manifest cannot
  carry a digest computed over a file derived from the manifest itself."*
- **The two agreement rules were amended to admit it, individually.** `REQ-STARTUP-152` now reads "the
  manifest listing every published asset but itself **and the signature published over it**", and
  `REQ-STARTUP-035` (3) now excepts both from the release-body table. So the constraint the old argument
  enforced — no filename outside the scheme — was not defended by hiding the signature; it was replaced
  by naming the two files the scheme does not cover.
- **Detachment is now load-bearing rather than incidental**, and it is the reason the old proposal would
  have been worse. `REQ-STARTUP-152` requires `SHA256SUMS.txt` **exactly as published** to be consumable
  unmodified both by the update path and by `sha256sum -c`, "with no reformatting step in between".
  Carrying a signature inside the manifest would have put content into a file whose bytes a stock tool
  must still accept. The detached form leaves those bytes untouched, which is why both consumers read the
  same file. **The old proposal was not merely overtaken; it conflicted with a guarantee this record had
  already cited elsewhere.**
- **Rotation is decided the other way round, and better.** `REQ-STARTUP-168` (a) makes what a build
  carries a **set** of keys rather than one, and (b) requires a release to be signed with a key carried
  by every published artifact it may be offered to — decidable before publishing, and decided at
  `REQ-STARTUP-156`'s gate. So the overlap lives in the **builds**, not in the manifest, and there is one
  signature per release rather than several. That is strictly cheaper: the manifest format never changes,
  and the thing that must be got right is a gate check against releases already published rather than a
  multi-signature format the updater has to parse.

**What this record owns under the amended text:**

- **The verification order is fixed by requirement and is not ours to arrange.** `REQ-STARTUP-122`:
  fetch the manifest together with the signature → **verify the signature** → parse the manifest, and
  only then → stream the asset into a fresh staging directory → verify the digest → apply. The signature
  is checked **before the manifest is parsed and before any asset is fetched**, so a manifest this build
  cannot attribute to a trusted publisher costs the user no download and **reaches no parser**. That last
  clause is a security property, not an efficiency one: it keeps untrusted bytes out of our parser, and
  it inverts the order this record previously wrote ("fetch and parse the manifest; stream the asset;
  verify; apply").
- **Three signature outcomes, each refusing the install and leaving nothing downloaded**
  (`REQ-STARTUP-123`): no signature published, a signature that cannot be fetched, and a signature that
  does not verify against a key this build carries. Their wording is ours; their existence and their
  effect are not. **No refusal is overridable** — no confirmation, setting, retry or interface path
  installs an update whose signature did not verify — so the updater must offer no such path even as a
  developer affordance.
- **The trusted set is fixed at build time and nothing at run time may touch it.** `REQ-STARTUP-167`
  forbids a configuration value, a preference, an environment variable, an interface control or anything
  downloaded from adding to, replacing or disabling it, "because a trust anchor a network can replace
  establishes nothing". This is a structural obligation on where the keys live: they are compiled into
  the artifact and resolved from what was installed with no additional download (`REQ-STARTUP-159`).
  There is no key file to ship, and shipping one would create the surface the requirement forbids.
- **The gate check of `REQ-STARTUP-168` (b) is a release-pipeline obligation with a real input.** To
  decide that a release is verifiable by everything it may be offered to, the pipeline must know which
  keys the artifacts of every still-offerable release carry. That is a record the pipeline has to keep
  deliberately; it cannot be recomputed from the current checkout, because it is a fact about builds that
  already shipped. **Not keeping it is how (b) becomes undecidable and stranding becomes a discovery.**
- **A withdrawn key strands updates and nothing else, by design.** `REQ-STARTUP-168` (c): installations
  carrying only a withdrawn key refuse the install, keep working exactly as they did, and their update
  *check* stays silent under `REQ-STARTUP-110` and `REQ-STARTUP-150` — the refusal is visible only where
  a user asks for the install. So the compromise path is a product decision with a stated cost, not an
  outage.
- **The key material is a release-pipeline secret and never ships**; only the verification counterpart is
  in the artifact. Nothing about this changes the unsigned-binary decision or the platforms' first-launch
  warnings, and `REQ-STARTUP-035` (6) requires the release body to say so explicitly, so a reader does not
  take the absence of a code signature to mean the update path establishes nothing about who published.

## Ruled — the Linux artifact's runtime, and the sandbox that comes with it (was an escalation; ESC-11)

`REQ-STARTUP-024` requires the application image to run **unextracted on an unmodified Ubuntu 24.04
installation**, and `REQ-STARTUP-159` requires first paint on that baseline with nothing else installed.
The packaging tool's two runtime options do not both satisfy that, and the difference is user-visible in
two ways:

- **The legacy runtime dynamically loads `libfuse.so.2`.** Ubuntu 24.04 ships FUSE 3 and does not
  install that library; the user's first double-click produces a dynamic-loader failure, or from a file
  manager, nothing at all. That is `REQ-STARTUP-024` failing on the exact machine it names.
- **The legacy runtime also disables the shell's own process sandbox unconditionally** on that path,
  because the distribution restricts unprivileged user namespaces. The static runtime instead detects
  the condition and disables it only when the namespaces are genuinely unavailable. ADR-0002 makes the
  sandboxed renderer load-bearing — the transcript renders Markdown a model wrote and the terminal grid
  renders bytes an arbitrary process wrote — so "Linux users get that surface unsandboxed" is a
  different product, not a build flag.

At the time of writing the static runtime is the default of the tool's **pre-release** line and the
legacy runtime is what the current stable line produces. The options were: **(a)** ship on the
pre-release line; **(b)** ship on the stable line and pin the runtime explicitly if that line permits it;
**(c)** ship on the stable line and disclose the library prerequisite; **(d)** change the Linux artifact
form.

**Ruled (ESC-11): (b) if the stable line permits explicit pinning, otherwise (a).** Options (c) and (d)
are refused — (c) contradicts `REQ-STARTUP-024` as written, and (d) is forbidden by
`REQ-STARTUP-031`'s closed four-artifact set. Whether pinning is possible on the stable line is a
measurement (open spike 12); **it decides between (b) and (a) and does not reopen the question.**

The deciding argument recorded with the ruling is not packaging convenience: the legacy runtime
**disables the shell's own process sandbox unconditionally** on a distribution that restricts
unprivileged user namespaces, where the static runtime disables it only where namespaces are genuinely
unavailable. ADR-0002 makes the sandboxed renderer load-bearing, so "Linux users get that surface
unsandboxed" is a different product rather than a build flag.

**The gate defect this record raised alongside it has been fixed in the specification.**
`REQ-STARTUP-156` no longer says only "a machine the release owner controls": it now requires, on Linux,
**the unmodified baseline `REQ-STARTUP-024` names**, explicitly excludes a machine configured for
building, testing or development, requires no separately installed component of the product and blocked
outbound network, and requires a check whose conditions cannot be established to be **recorded as not
performed and to fail the gate**. The complaint is discharged; what remains is consequence 4's
operational form of it — the gate machine must never have had the legacy library installed.

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
    **missing** warning. It stays owed. Clause (d)'s "issues no network request and raises no elevation
    prompt" is likewise true by construction of the launcher and **was not independently verified** — no
    network capture and no privilege trace was taken.
15. **A power loss between writing the tree and its data reaching the disk can produce Defect B's damage
    class by accident.** The measured launcher flushed only the marker before the commit; the filesystem
    journals the rename but not the payload data, so a torn tree can in principle sit behind a valid
    marker. The manifest check catches a torn tree whose file **lengths** are wrong and not one whose
    lengths are right, and flushing 507.9 MiB before the commit would change the first-run figures by an
    amount nobody has measured. Recorded as a known residue of the commit discipline rather than resolved.

## Discharged — the cached-launch clause, retired 2026-09-02

This record carried a "Revisit if" written for a bad number, on the grounds that the number did not yet
exist. **It exists. SR-7's gate condition is met and the clause is retired**, bullet by bullet, so that
what was discharged and what was not is legible rather than assumed.

- *"The figure lands over 5,000 ms."* **Did not happen.** 575.5–624.2 ms warm, 897.3–1,242.5 ms cold,
  worst observation anywhere 1,414.6 ms. The clause named two remedies it would have reached for — moving
  where the preparation sits, and making the stub hand off rather than stay in the launch chain — and
  neither is needed. The second was measured anyway: the stub already hands off, exiting about 19 ms after
  its own first instruction on the fast path, and that is what makes `REQ-STARTUP-125` work at all.
- *"The figure is fine but the fast-path check is a material share of it."* **Did not happen, and the
  escape hatch the clause reserved is now closed rather than merely unused.** The check as this record
  specified it was 0.14–0.49 ms of a ~600 ms launch — 0.01 % of the budget. The clause's remedy was to
  carry the token in the directory name and stop reading the marker; under this revision the marker also
  carries the manifest that closes Defect B and the preparation-failure outcome the notice depends on, so
  **that remedy would now reintroduce a launch that produces no window.** It is withdrawn as an option,
  not left available.
- *"Cache invalidation across an update does not work — the one outcome that would make the design wrong
  rather than slow."* **Did not happen.** Two artifacts differing by one line in one licence file
  produced different tokens; v1.0.1 prepared afresh (1,961.3 ms), v1.0.0's own preparation stayed intact
  and was still used afterwards (591.3 ms, cache hit), and two token-named directories coexisted, each
  with its own marker naming its own token. A same-payload artifact rebuilt at a different chunk size
  also produced a different token and also prepared afresh. **The residue is the launcher-bytes case
  recorded under version identity above**, which the marker's format field covers and which is the reason
  that field is now called load-bearing.
- *"The unwritable-root case behaves differently from the design above. Spike 20 should exercise it."*
  **Not discharged. The spike did not exercise it**, and it is now consequence 14.

## Revisit if

**The unwritable-root case is measured and behaves differently from the design above.** It is the only
part of `REQ-STARTUP-165` the spike left untouched, it is the branch this record wrote from scratch on
2026-09-02, and it is the one where the failure is a missing warning rather than a slow launch. Until it
is exercised, consequence 14 is the honest statement of what is known.

**The bundle grows materially past the anchor weight the figures were taken at.** Everything above is at
spike 17's `W150` anchor — a 507.9 MiB payload tree carried as a 182.68 MiB compressed artifact — with a
probe application that contains no product. The preparing run scales with the payload and with the core
count: single-threaded it was 3,798.8–3,909.8 ms, of which roughly 2.7 s is decompression, so a
four-core machine at twice this bundle weight is the first place the exempt run stops being comfortable.
The cached run is nearly insensitive to weight, so the number to watch is the **preparing** one, and the
lever is the archive rather than the check.

**Anti-malware or a filesystem filter treats the preparation root differently from an installed
directory.** Nothing in the measurement suggests it — no cached launch of either artifact at any cache
state exceeded 1,414.6 ms across 68 fast-path launches — but every figure here was taken with Microsoft
Defender enabled and unmodified on one machine, with locally written artifacts carrying no
mark-of-the-web, so **no SmartScreen prompt and no download-zone handling was exercised at all** and a
real download adds a first-run cost that is not measured. `REQ-STARTUP-156`'s gate, which now requires
two runs of a preparing artifact on a machine meeting `REQ-STARTUP-159`'s conditions, is where that lands.

**A single-file artifact ever needs to ship uncompressed.** Consequence 13 is why, and the argument would
have to survive a reproducible half-minute on the user's first launch.

**The specification defect this record previously designed around is closed and this clause is retired.**
It read: *"`REQ-STARTUP-165` (c) requires a run that can produce no preparation to 'still start the
artifact', while clause (d) requires preparing to 'write nothing outside the per-user directories of
`REQ-STARTUP-145`'. A payload that must exist as files cannot satisfy both where that root refuses every
write."* **Both clauses have since been amended and the contradiction is gone**: clause (c) fixes a
closed set of two permitted locations, clause (d) states the single exception in its own text, and the
case where neither accepts a write is explicitly declared out of the requirement's reach. The design is
restated against the amended text under "Where the ephemeral placement goes" above. **Nothing here is
owed to the owner and this is not a residue.**

**And:** the product ever acquires code signing, at which point signature verification of the artifacts
themselves becomes possible, `REQ-STARTUP-167`'s manifest signature is subsumed by it, and
`REQ-STARTUP-123`'s explicit note that neither check establishes anything about the artifacts carrying a
code signature would be worth revisiting as a requirement. Or `REQ-STARTUP-168` (b)'s gate check proves
undecidable in practice because the record of which keys shipped in which release was not kept from the
start — consequence 10 exists to stop that, and if it happens anyway the rotation story needs a different
mechanism rather than a better process.

## First execution — 2026-09-04, the installer

*Recorded under GD-10; `../spikes/native-load-proof.md`.* `electron-builder` produced
`Rotaris-0.1.0-windows-x64-setup.exe` (125,246,346 B) and its block map from a `win-unpacked` tree of 442 MB
(`app.asar` 68.5 MB), the name rendering from `tools/release-naming` and asserted equal by the build
(`REQ-STARTUP-031`). The packaged application shows the product version, not Electron's. **Not built:** the
portable and its launcher stub (SR-7, alternative P4) — the second build technology this record carries is
still on paper. **Not done:** signing (no certificate; `signtool` finds no signature on any artifact), the
release gate, an icon. The installer was produced, not installed.

## The bundled code-intelligence runtime as `extraResources` — 2026-09-06, Part T (ADR-0035's first execution)

The runtime rides **outside the asar**, under `resources/code-intelligence/` (`electron-builder.yml` `extraResources`;
a Python tree cannot run from an archive), built by `pnpm code-intel:bundle` before `electron-vite build` and asserted
by `afterPack` to answer its own version and the distribution's from inside `win-unpacked` (the "runtime" rule beside
rules 1a and 4; `build-hooks.cjs`). **Measured growth of the artifact** on the build that first carried it (this
worktree, `pnpm package` end to end in 353 s, IC-6's rules green): `win-unpacked` from 442 MB to the figure in the
handoff and `release/load-proof.json` — the runtime is 167.2 MiB in 10,603 files, byte-compiled so an installation
under Program Files never writes bytecode; the installer's growth is in the same report. The "327 MB of additional
payload moved first paint by about 10 ms" measurement above is not re-taken: the runtime is never read at first paint
(only the sentinel path touches it), so first paint is unaffected by construction. **IC-7** (proposed in
`implementation-conditions.md`) binds the release this artifact would be: the runtime is self-contained, its language
servers are not — measured on the packaged binary with outbound blocked (`pnpm code-intel-proof` launch 7: `npm install
typescript@5.9.3` attempted and failed). The licence text the bundle carries is one copy under the distribution's
dist-info; the notices generator (`REQ-STARTUP-141/142`) is still not built. *2026-09-27: no longer the copy the artifact
carries. The notices file reproduces the same text, and REQ-STARTUP-142 requires it there, so the dist-info copy is
filtered out of the artifact and kept in the source tree for the generator. See "The two bundled assets" below.*
**IC-7 adopted 2026-09-06 (ESC-32, option 2):** the language servers are tools provisioned after installation;
`REQ-STARTUP-142`'s section now lists them after Git and ripgrep, from the same manifest, and the generator that
will write that section is the one still owed here — IC-7's second half is discharged when it does. *It did, on
2026-09-27: see "The notices generator" below.*

## Two assets the About page asks this record for — 2026-09-08 (Part AG)

`REQ-SHELL-140` reads the build identifier from **a bundled text asset** and `REQ-SHELL-142` opens **a bundled
third-party notices file**. No build in this tree produces either, so the About page ships each requirement's own
absent branch — an em dash for Build, and the caption "This build does not carry a third-party license bundle." Both
branches are built and exercised (`pnpm settings-proof`, launch 1), so nothing here is a stub: what is owed is the two
assets, not the surface. Main resolves them the way every other bundled resource is resolved — `process.resourcesPath`
for a packaged build, else `apps/desktop/resources/` — in `apps/desktop/src/main/about.ts`, which is where a packaging
change would land them. `shell.openThirdPartyLicenses` answers `licenses.absent` until then. *2026-09-27: the notices
file now has a generator (below), and the reader's name was corrected to `THIRD-PARTY-LICENSES.txt` in the same change —
it had looked for the name in lower case, which only a case-insensitive filesystem forgives
(`../../defects/fixed/the-about-page-looks-for-the-licence-bundle-under-a-lowercase-name.md`). Carrying the two assets
into the artifact is `first-release-plan.md` §4.4.* *2026-09-27, later: §4.4 is built — see "The two bundled assets"
below. Nothing in this section changes: the readers and both absent branches stand as written, and the proof now
measures the present branch of each.*

## One version and the pre-build guard — first execution, 2026-09-27 (first-release plan §4.1)

*Reported in place under the standing policy; row in `../first-executions.md`.* `pnpm release:guard <tag>`
(`tools/release-guard`) is `REQ-STARTUP-028`'s guard. It is one stage with two halves, which report together and
share one exit code (`REQ-STARTUP-149`: 0, or 1 with `error: …` on stderr, or 2 for usage). The **version half**
compares the tag's version with every place the build declares one (`REQ-STARTUP-158`). The **package-pin half**
compares the setup manifest with the packages the built-in default configuration launches through `npx`/`uvx`
(`REQ-STARTUP-059`). The tag is parsed by `REQ-STARTUP-027`'s grammar, which now lives in `tools/release-naming` beside
the names it renders (`parseReleaseTag`, with `REQ-STARTUP-029`'s channel), so the updater's comparison
(`REQ-STARTUP-109`) can read the same one.

**Which places declare the product version — decided here: one, `apps/desktop/package.json`.** electron-builder
renders it into each artifact's name and into the installer's metadata and packs the file into `app.asar`, and
everything the running product reports as its version is **read back** from that packed copy through one reader,
`@rotaris/platform`'s `installedProductVersion`: main's About surface, and the run host's MCP client, which sends it as
`clientInfo.version` in every handshake. The other three values the plan listed are not product versions:

- The **workspace root** (`0.0.0`) belongs to a private manifest that no build reads for a version, so its `version`
  field is **removed**. It looked like a second declaration and disagreed with the first.
- **`tools/release-naming`** (`0.0.0`) and every other `@rotaris/*` package are private workspace packages. They are the
  desktop's devDependencies, compiled into its bundles from source and never packed as packages, so their `0.0.0` is
  package-manager bookkeeping. They are left as they are and not checked. A place that ever comes to carry the version
  into an artifact joins `PRODUCT_VERSION_PLACES`: the portable stub's identity token (§4.5) is the obvious candidate.
  electron-builder's `extraMetadata.version` and `buildVersion` are deliberately unset; either one would be a second
  place.

`0.1.0` already agrees with the planned `v0.1.0`. A prerelease tag needs the declaration to be the tag's text
**exactly**, for example `0.1.0rc1`. Equality is exact text because that text is what every artifact name renders.

*The falsified reason, kept beside its replacement.* This note first said the manifest was "the only version an
artifact carries", and that every other `version` in the workspace belonged to a package no artifact carries. The gate
round that reviewed the guard found that false: `@rotaris/mcp`, compiled into the run host, declared
`CLIENT_INFO = { name: 'rotaris', version: '0.1.0' }` as a literal and told every MCP server that version during
`initialize`, so declaring `0.2.0` and tagging `v0.2.0` would have passed the guard and still reported `0.1.0` to every
tool server — against `REQ-STARTUP-158`'s "SHALL report at run time, that same version". It was not made a second place
for the guard to check; it was made a reader. `OpenOptions.clientVersion`, and the `clientVersion` of `ToolDiscovery`,
`HealthProbe` and `SessionConnections`, are required and have no default; `McpHost` is handed the product version by the
run host's composition root, which reads it from `import.meta.dirname` — `out/main/`, the directory main's bundle sits
in too — so one file answers both processes. Measured on the built app: with the manifest temporarily declaring
`0.2.0rc1`, both of alpha's handshakes in `mcp-proof`'s discovery launch named `rotaris 0.2.0rc1`; the old literal
would have said `0.1.0`. The note is `../../defects/fixed/the-mcp-client-reports-a-literal-product-version.md`.

**What the version half found: the running app did not report the declared version.** `shell.hello` answered with
`app.getVersion()`, and Electron answers that with **its own** version for a runtime started with a file. That is the
development entry and every proof: `settings-proof` read `v44.1.1` and passed on a `/^v\d/` check. The packaged build
was right only because `app.asar` is a package. Repaired in the same change: main reads
`out/main/../../package.json`, which is the same place the guard reads in both entries, and answers `dev` when that
file declares nothing. `REQ-STARTUP-007` says `dev` there and `REQ-STARTUP-004` says `0+unknown`; the two disagree,
and `dev` is **OQ-71**'s reading. `settings-proof` now requires the exact `v0.1.0`, and it was measured failing on the
old build. The note is `../../defects/fixed/the-unpacked-build-reports-electrons-version-as-the-products.md`.

**What it found about prereleases, not repaired here.** electron-builder 26.15.3 rewrites `0.1.0rc1` to `0.1.0-rc1`
when it normalises the package metadata (loose SemVer, measured). So a prerelease built from this configuration would
be named `Rotaris-0.1.0-rc1-…`, which is not `REQ-STARTUP-031`'s name, and `build-hooks.cjs`'s naming check compares
against the normalised value and cannot see the difference. The repair belongs to §4.2/§4.5, where the name must be
rendered from the tag's version through `tools/release-naming`:
`../../defects/a-prerelease-version-reaches-the-installer-hyphenated.md` — *repaired 2026-09-28, the note now under <!-- historical-path: ../../defects/a-prerelease-version-reaches-the-installer-hyphenated.md -->
`../../defects/fixed/`; the report is "The prerelease naming repair" below.*

**What the pin half found: the manifest it checks does not exist.** No setup manifest of `REQ-STARTUP-058` is in the
tree. The one `npx`/`uvx` launch among the defaults is `browser`'s `npx -y @playwright/mcp@0.0.80 --headless`. It is
resolved through the product's own `resolveCommand`, so shorthands count. It is counted although it ships
`enabled: false`: `REQ-MCP-095` requires its pin whatever the switch says, and `REQ-STARTUP-064`'s "nothing will ever
launch it" pulls the other way. That is **OQ-69**. So on this tree `pnpm release:guard v0.1.0` **exits 1 on the pin half
alone**, naming `@playwright/mcp`, `0.0.80`, both files and the missing manifest. That is the requirement working. It
also means **no release is publishable until the manifest exists**, and no step of the plan builds it (the plan's §4.1
now says so). The guard reads it at `apps/desktop/resources/setup-manifest.json` (`SETUP_MANIFEST_LOCATION`, one
constant) and needs two fields: `schemaVersion: 1` and `toolServerPackages: [{ name, version }]`. It enforces the
manifest's own discipline: complete version strings and one entry per package. The rest of `REQ-STARTUP-058`'s schema
is left to whoever builds the manifest, and so is the choice of location if they want another. **That builder inherits
two constraints.** `toolServerPackages` is the guard's reading — `REQ-STARTUP-058` says only "exact MCP package pins" —
so a different field name moves `TOOL_SERVER_PACKAGES_FIELD` with it. And `apps/desktop/resources/` is
electron-builder's `buildResources` directory, which is not packed (`extraResources` carries only
`resources/code-intelligence`), so a file there is not yet "the machine-tool manifest a build ships" (`REQ-STARTUP-059`):
the step that writes it must also add it to `extraResources`, where `REQ-STARTUP-143` and `about.ts`'s pattern would
read it.

**How it runs, and why that way.** The guard is TypeScript and imports `SHIPPED_MCP_SERVERS` and `resolveCommand`
from `@rotaris/config`, so it reads the configuration the build ships rather than a copy of it. `@rotaris/config`'s
import graph uses parameter properties, which Node's type stripping refuses (measured on `kernel/src/time.ts`). So
`cli.mjs` loads the guard through Vite's `runnerImport`, the compiler the desktop build already runs on. Vite marks that
API experimental, and the lockfile pins it. `guard.test.ts` spawns the script, so a change in that API fails
`pnpm check` before it can fail a release. `@rotaris/config` imports `@rotaris/kernel`, whose index re-exports the
generated (gitignored) requirement symbols, so **the tag workflow must run `pnpm symbols` before the guard** (§4.2); a
checkout that skips it fails closed, `error: the release guard could not run`, exit 1. One reading was taken in the
grammar: numbers are canonical decimals, so `v01.2.3` is refused (**OQ-70**).

The grammar lives in `tools/release-naming/src/index.ts` itself, not a second module. The packaging hook's naming check
(`build-hooks.cjs`, `checkNaming`, inside `afterPack`) imports that file with plain Node, whose type stripping neither
resolves a `./tag.js` specifier to `tag.ts` nor accepts parameter properties. The grammar first arrived as `tag.ts`,
re-exported with both, and the gate round measured `checkNaming('0.1.0')` failing with `ERR_MODULE_NOT_FOUND` — which
`afterPack` turns into `[ic6] BUILD REFUSED` for every installer — while `pnpm check` stayed green. It is one file of
erasable syntax now, and `naming.test.ts` calls the hook's own `checkNaming` in a child `node`, so either shape fails
the tests (both mutations measured).

**Measured:** at the first build, 36 new unit cases in the two tools (31 in `tools/release-guard`, 5 for the tag
grammar) and 3 for main's reader. After the gate round: 35 in `tools/release-guard` (the reader pinned to the guard's
place from the tool side, an empty place list failing, a leading `--`, a linear-time pin check), 6 for the grammar and
the hook's plain-Node load, 3 for the reader in `@rotaris/platform` and 1 in main, and 1 for the handshake identity on
all three MCP paths.
The two comparisons were mutated and the tests failed each time. The real script ran against this tree: `v0.1.0` gave
exit 1 on the pin half only; `v0.2.0rc1` and `vlatest` gave exit 1; no argument gave exit 2. With a scratch manifest
pinning `0.0.80`, `v0.1.0` passed with exit 0. **Not done here:** `.github/workflows/release.yml` (§4.2), the setup
manifest, and the prerelease naming repair.

## The setup manifest — first execution, 2026-09-28 (first-release plan §4.1)

*Reported in place under the standing policy; row in `../first-executions.md`.* `REQ-STARTUP-058`'s manifest exists:
`apps/desktop/resources/setup-manifest.json`, schema version 1, **committed rather than generated** — every value in it
is a pin a person chose, and a generator would only have moved the choosing — and carried by `electron-builder.yml`'s
`extraResources` to the root of the artifact's resources beside the two About files, which is where the guard's note
above said it had to land. The pin half of `pnpm release:guard` reads it at the location that note fixed, under the field
name that note fixed (`toolServerPackages`), so neither constant moved.

**What it pins, and how each figure was taken.** Git and ripgrep exactly as `REQ-STARTUP-058` states them, plus the
source URL `REQ-STARTUP-142` wants beside the name, version and licence:

| Tool | Probe | Minimum | Provisioned | Platform key | Archive | SHA-256 |
|---|---|---|---|---|---|---|
| `git` | `git --version` | none | 2.55.0 | `windows-x64` | `…/git-for-windows/git/releases/download/v2.55.0.windows.1/MinGit-2.55.0-64-bit.zip` | `31497e7968196332263459ee319d2524e3ebc5786ab895e2abad34ffdd4f4ebf` |
| `ripgrep` | `rg --version` | 14.1.0 | 15.2.0 | `windows-x64` | `…/BurntSushi/ripgrep/releases/download/15.2.0/ripgrep-15.2.0-x86_64-pc-windows-msvc.zip` | `71b2fef860abe467217a538ff31de02f5258807c0129f771846f87bd029aafc5` |
| | | | | `macos-arm64` | `…/ripgrep-15.2.0-aarch64-apple-darwin.tar.gz` | `3750b2e93f37e0c692657da574d7019a101c0084da05a790c83fd335bad973e4` |
| | | | | `linux-x86_64` | `…/ripgrep-15.2.0-x86_64-unknown-linux-musl.tar.gz` | `33e15bcf1624b25cdd2a55813a47a2f95dbe126268203e76aa6a585d1e7b149c` |

Each digest was **computed here, from the bytes**: `curl -sS -L -o <file> <url>` through the session's egress proxy
(TLS verified against its bundle), then `sha256sum <file>`; none was copied from a page. ripgrep publishes a `.sha256`
sidecar beside each asset, and all three agree with the computed digests. **Git for Windows publishes no per-asset
sidecar**, so MinGit's digest rests on this one download; a second download on another host before the first release is
cheap corroboration and is owed to whoever runs §5's gate. Git's licence is `GPL-2.0-only` and its capabilities
`worktrees` and `checkpoints`; ripgrep's `Unlicense OR MIT` and `search`, the words the requirement uses. Licences for
the two tools and for `@playwright/mcp` (`Apache-2.0`) were read from what the upstream declares — the registry's
record for `@playwright/mcp@0.0.80` says `Apache-2.0` — not inferred.

**Which Git archive.** `REQ-STARTUP-058` asks for "a Windows-x64-only archive from the upstream Git-for-Windows release
line". That line publishes, per release, an installer (an executable), `PortableGit` (a self-extracting 7-Zip archive)
and `MinGit` (a plain zip, in a full and a busybox variant). `REQ-STARTUP-085` accepts `zip`, `tar.gz` and `tar.xz` and
nothing else, so MinGit is the one form the extraction can take; the full variant is pinned because the busybox one is a
smaller Git nobody asked for. Its entries sit at the archive root (`cmd/git.exe`, `mingw64/bin/git.exe` — both declared
as expected executables); ripgrep's sit under one directory named after the archive (`ripgrep-15.2.0-<triple>/rg`).
`REQ-STARTUP-058` says "archive layout" and says nowhere what a layout is, and `REQ-STARTUP-086` names no base for the
expected executables' paths. Both are **OQ-87** (OQ-76 on its branch, renumbered at the merge), and the manifest is built under the reading it states: `layout` is the
format and the top-level directory (or `null`), and executables are relative to that directory.

**The other two lists.** `toolServerPackages` pins `@playwright/mcp` 0.0.80, the one package the built-in defaults launch
through a runner — counted although the `browser` entry ships `enabled: false`, which is **OQ-69**'s reading, the one the
guard already built — with `source` and `license` beside `name` and `version`, mirroring the language servers' four fields
(a reading; the guard reads two of the four). `languageServers` is `pins.json`'s list **verbatim**: the runtime's pins are
the one source of truth (the bundle step checks them against the runtime's own defaults, IC-7), and
`setup-manifest.test.ts` holds the shipped manifest's list equal to `pins.json` and to `CODE_INTELLIGENCE_LANGUAGE_SERVERS`,
so a change to one file without the other fails `pnpm check`. The file carries no `$comment` on purpose: the fingerprint
of `REQ-STARTUP-061` is over the whole canonical JSON, so an edited comment would set every installation up again.

**Where the schema lives, and why there.** `packages/config/src/setup-manifest.ts`: `SetupManifestSchema` (zod, strict —
a key the schema does not name refuses the file, at any level), the platform keys of `REQ-STARTUP-060`, the three archive
formats of `REQ-STARTUP-085`, the two provisioner families, the complete-version pattern (`REQ-STARTUP-059`'s discipline,
now imported by the guard's `isCompleteVersion` so the two admit the same strings) and `readSetupManifest`, which names
every problem by its JSON path and reports them all at once. **The platform keys are a second copy, bound by a test.**
`REQ-STARTUP-060` has one set of keys shared by artifact naming, updater asset selection and manifest artifact
selection, and `tools/release-naming`'s `PLATFORM_KEYS` is the authority for the first two; `config` has no edge to that
package, so the schema carries its own literal, and `tools/release-guard/src/pins.test.ts` — the guard imports both —
holds the two equal key for key and in order, and every archive the shipped manifest carries under one of them (found by
the independent verification of this item: the first build had the second literal and nothing binding it). The raw
`<os>-<machine>` fallback key of the same requirement is read as a key a host may compute, never one a manifest archive
is written under — the schema refuses it, so a fallback host finds no archive to select; what machine setup then does is
the consumer's, not built. The reading is raised as **OQ-88** (OQ-77 on its branch, renumbered at the merge) rather than settled here. `config` is the one package both readers may import:
the guard (`tools/**`, outside the boundary matrix) already reads `SHIPPED_MCP_SERVERS` and `resolveCommand` there, and
the product's reader — the machine-setup flow, main's by `REQ-STARTUP-089` — has `config` in main's allowed edges; and
`config` already owns both things the manifest is cross-checked against. `zod` is `config`'s first use of it, a dependency
`contracts` already carries. The schema refuses: text that is not JSON; a non-object; a schema version other than 1; a
missing list; a version that is a range, a partial, a floating tag or a prefixed spec; a digest that is not 64 lower-case
hex characters; a URL that is not `https://` (`REQ-STARTUP-082`); an archive format outside the three; a top-level
directory written as a path; an executable path that is absolute (a leading `/`, or a drive letter — `C:/git.exe`, added
after the independent verification found the pattern let it through), has a `..` component or a backslash
(`REQ-STARTUP-085`'s refusals, so the manifest never names one); an archive with no executable; a tool with no platform
key or an unknown one; a provisioner outside `npm` and `uvx`; an empty capability list; a name listed twice in any list.

**What the first execution found.** (1) **The guard passes.** `pnpm release:guard v0.1.0` exits 0 with
`version: tag v0.1.0 is stable version 0.1.0, which apps/desktop/package.json ("version") declares` and
`package pins: @playwright/mcp 0.0.80 (server "browser") — apps/desktop/resources/setup-manifest.json agrees`. With
the pin mutated to `0.0.81` it exits 1 naming both files, and `setup-manifest.test.ts` and `pins.test.ts` go red with it.
(2) **`guard.test.ts` had encoded the manifest's absence twice.** One case accepted exit 0 *or* 1 for the declared
version, and one expected `server "browser" launches …` on stderr — a line only the missing manifest had put there. Both
now require the pass; the second requires exactly one error and no mention of the manifest. (3) **The notices file now
says something false of the tree.** The generator reads `pins.json` as its manifest and writes "The setup manifest of
this build pins no machine tools"; the manifest pins two. `REQ-STARTUP-142` wants that section generated from the setup
manifest and listing Git and ripgrep. Recorded and not repaired — the build was told to leave what the notices file lists
alone while **OQ-73** is open, and OQ-73's gate-review addendum already says the generator's reader follows the shape
machine setup decides (`../../defects/fixed/the-notices-file-says-the-setup-manifest-pins-no-machine-tools.md`).
*Repaired 2026-09-28 under R-062, OQ-73 still open (deferred 2026-10-06 by
[R-071](../../product/requests.md#r-071), with the release pipeline's notices and signing):*
the generator now reads this manifest in `SetupManifestSchema`'s
shape (a copy of the field names, held to the schema by `notices.test.ts`, because `tools/notices` imports nothing from
`packages/`) and lists Git 2.55.0 and ripgrep 15.2.0 with their four fields. It states that machine setup, which would
download them, is not yet in the build. It lists `@playwright/mcp` 0.0.80 under a third sub-heading for
`REQ-STARTUP-152`, a placement OQ-92 raises. That first reading of the real manifest found the generator's assumed
shape wrong on one field (`version` where the manifest says `provisionedVersion`), and the runtime's name absent from
the manifest, so the sub-heading still reads it from `pins.json`. `pnpm notices` refuses on the same eleven problems as
before. (4) **Nothing
in the product reads the file.** The machine-setup flow (`REQ-STARTUP-060` onward, `REQ-MCP-112`'s setup half), the
fingerprint (`REQ-STARTUP-061`), the probe, the download and the promotion are not built and are not in the first-release
plan; the manifest is what they will read, and `SETUP_MANIFEST_FILE` is the name main would resolve the way `about.ts`
resolves the two About files. (5) **`afterPack` does not assert the manifest inside `win-unpacked`.** The yml entry is
tested through electron-builder's own `copyFiles` over a fixture (`about-assets.test.ts`), which is the step of a real
pack that places the file; the "assets" rule was left to its two files, and the artifact check is owed to the next
Windows package (IC-3), as the two About files' is.

**Measured:** 14 cases in `setup-manifest.test.ts` (6 over the shipped file, 8 over malformed shapes); 4 new cases in
`pins.test.ts` (the shipped manifest against the shipped defaults; the two platform-key lists equal, every shipped archive
under a naming key, a fallback-keyed archive refused — a key renamed in the schema's copy alone turns the first two red) and the guard's constant now equal to the schema's; 2
cases in `guard.test.ts` tightened; 1 new case in `about-assets.test.ts` (the manifest copied byte for byte). Three
mutations of the shipped file were run and each turned the tests red: the browser pin (`0.0.81` — 2 tests and the
guard), a language-server version drifting from `pins.json` (`typescript` 5.9.4 — the equality case), a digest in upper
case (the schema case and four that read through it). **Not done here:** the consumer, the notices reader's move, the
`afterPack` assertion, and any download of a pinned archive by the product.

## The notices generator — 2026-09-27, first execution (`first-release-plan.md` §4.3)

*REQ-STARTUP-037, REQ-STARTUP-141..143, REQ-STARTUP-149; IC-7's second half.* `pnpm notices` (`tools/notices/generate.mjs`
over `notices.mjs`) is the licence-inventory generation and validation step this record's pipeline runs per platform
before freezing. It writes `apps/desktop/resources/THIRD-PARTY-LICENSES.txt` (git-ignored) only when validation passes.
A failure exits 1 with one `error:` line per problem naming the component or path, and it removes any earlier file so a
stale one cannot be frozen in its place. The closure is computed offline, from what is installed:

- the desktop application's production `dependencies` and those of every workspace package it builds from, never a
  development dependency and never a product package;
- Electron as one component, with its own credits reproduced beneath it (OQ-72);
- SQLite and winpty (win32 only), which this build compiles into its native modules from vendored sources whose
  licence files the `files` patterns above strip from the archive;
- the bundled runtime's interpreter and every distribution in it;
- the fonts and the icon set, from a table beside the generator that must name every face `packages/ui/src/fonts.css`
  bundles.

The inputs a person owns are three version-controlled files beside the generator:

- the maintainer-review table (`reviewed-exceptions.json`, empty);
- the release inputs (`release-inputs.json`), where the owner writes O-3's LGPL address;
- the fonts table (`bundled-assets.json`), with the upstream OFL texts under `licenses/`.

**What the first run over this tree found.** The file renders 20.4 MB, 19.8 MB of it Electron's 779 credited
components. There are 40 application components on win32 (38 npm packages including Electron, plus SQLite 3.53.4 and
winpty 0.4.4-dev), 74 runtime components on the Linux bundle, and 4 fonts and icon sets. **Validation refused, on
six problems, each correctly:**

1. the LGPL address is empty (O-3, owed by design);
2. `@ai-sdk/provider-utils` 5.0.36 carries no licence text in its npm package;
3. `@xterm/addon-serialize` 0.14.0, the same;
4. `@xterm/headless` 6.0.0, the same;
5. `proxy_tools` 0.1.0, in the runtime, the same;
6. `dotenv` 0.9.9, in the runtime, declares no licence identifier.

Four of those wait on a maintainer's reviewed exception, which only a maintainer may write (plan §6, O-11). The sixth
has no reviewed route under REQ-STARTUP-143 as worded (OQ-74).

*Corrected 2026-09-27 by the gate review: the list above is short by eight.* The generator had counted any non-empty
licence-named file as the component's licence text. `@workflow/serde` 4.1.0 is inlined into the main bundle. Its only
licence file reads "Apache License 2.0" and then "See the LICENSE file in the root of this repository", and the
package ships no such file. The generator now reads a file that only names the licence, or only sends the reader
elsewhere for it, as a reference. It reads a NOTICE or an authors list as an attribution. Neither counts as the text,
and both are still reproduced (OQ-75). **Run again, validation refuses on fourteen problems:**

- O-3;
- `dotenv`;
- the four components above that ship no licence file;
- eight that ship only a reference:
  - `@workflow/serde` 4.1.0;
  - `ai` 7.0.92 and `@ai-sdk/gateway`, `@ai-sdk/openai`, `@ai-sdk/openai-compatible` and `@ai-sdk/provider`, each
    with Apache-2.0's per-file notice only;
  - in the runtime, `certifi` 2026.7.22, with MPL-2.0's Exhibit A only;
  - in the runtime, `mslex` 1.3.0, with the Apache-2.0 notice and an `AUTHORS.rst`.

O-11 names twelve reviews.

**Validation fails on more than REQ-STARTUP-143's five conditions.** These are the generator's own integrity guards.
Each fails closed and names what it found:

- a font's licence file that lacks the font's own copyright notice;
- an installed Electron runtime whose `dist/version` differs from its `package.json`;
- Electron credits whose product count does not match what could be read;
- a malformed or future-dated reviewed exception, even when no component needs it;
- a required dependency that is not installed;
- an input file that is not a JSON object.

Only the rule that Electron, the interpreter, a compiled-in library and a bundled asset must carry their text is a
reading of the requirement (OQ-75). The rest guard the generator's own inputs.

*Corrected 2026-09-27 by the gate review's second round, on two points.* First, an input that parsed to `null`, `false`,
`0` or `""` had been read as having nothing to report. Over an otherwise valid fixture, a `release-inputs.json` holding
`null` exited 0 with "(no address)" in the header. A `bundled-assets.json` holding `null` dropped every font and icon
text, and a `pins.json` holding `null` dropped every language server. Second, the address check still accepted the
plan's own example `Name <sources@domain.tld>`, `test@test.com`, `noreply@…`, two addresses in one value, and the
stock postal templates. Both are repaired. What the check refuses, and its limits as a word-and-shape heuristic, are
stated in the plan's §4.3.

Two premises of REQ-STARTUP-142 are not true of this
build: Manrope is named and not bundled, and no setup manifest pins a machine tool (OQ-73). **Nothing in this record
changes.** The step sits where REQ-STARTUP-037 puts it, before freezing. The `extraResources` entry
that carries the file into the artifact, and `package.mjs`'s call to the step, are §4.4's, with `build-id.txt`.
*Both landed 2026-09-27; see the next section.*

## The two bundled assets — 2026-09-27, first execution (`first-release-plan.md` §4.4)

*REQ-SHELL-140, REQ-SHELL-142, REQ-STARTUP-015, REQ-STARTUP-037, REQ-STARTUP-141, REQ-STARTUP-143, REQ-STARTUP-149.* The
packaged build now carries both files the About page asks this record for at the root of `process.resourcesPath`, where
`apps/desktop/src/main/about.ts` already looked. Four decisions were taken here, each recorded with its reason.

**1. What the build identifier is.** `pnpm build-id` (`tools/build-id/`) writes `apps/desktop/resources/build-id.txt`
(git-ignored) as one line: the full object name of the commit HEAD names, with `-dirty` appended when git reports a
change the commit does not hold — a modified, staged, deleted or untracked file that is not ignored (`git describe
--dirty`'s word). REQ-SHELL-140 fixes only that the value comes from a bundled text asset, and the specification's
appendix that the asset is one stripped line. The rest follows from what an identifier is for:

- Two builds of one commit from a clean tree carry the same identifier on every machine, and an identifier never
  names a commit the build did not come from.
- The full name, not an abbreviation: the length git abbreviates to grows with the clone's object count, so it is not
  a property of the commit.
- No tag and no `git describe`: whether a clone fetched its tags is not a property of the commit either.
- It reads the local repository only and never reaches the network. A tree git cannot name a commit for fails the step
  (exit 1, one `error:` line) and removes any earlier file, so a stale identifier is never frozen in its place.
- A build for a tag is not refused for `-dirty`. The specification does not forbid it, the identifier says it, and a
  release job's checkout is clean: `.gitattributes` forces LF and every file the build generates is ignored. *Decided
  2026-09-27, at the gate review's suggestion to record the choice.*

**2. `pnpm package` runs both steps before freezing, notices first.** After the code-intelligence bundle, because the
notices generator reads the runtime, and before `electron-vite build`, because a refusal should cost seconds. Both
files go to the root of the artifact's resources through two `extraResources` entries.

**3. What a local `pnpm package` does while O-3 is owed.** It fails. `pnpm notices` refuses until the owner writes O-3's
address, a maintainer signs O-11's twelve reviews and OQ-74 is ruled, and the package refuses with it, exiting 1 and
naming the flag below (REQ-STARTUP-143). This was measured: `REFUSED` at the notices step in 6.2 s, with the notices
step's fourteen `error:` lines above it. **`ROTARIS_PACKAGE_WITHOUT_NOTICES=1` is the one explicit way on.** Only the
value `1` sets it, and it passes over exit 1 only, never a usage error ~~or a crash~~ or a signal. ~~What it makes is a
development package with no notices file, because the refused step has already removed any earlier one.~~ Exit 1 is also
what a crash exits with: Node exits 1 on an uncaught exception, and the step makes exit 1 of an exception it catches.
So the flag passes over a crash as well, and an uncaught one removes nothing. `package.mjs` therefore removes any notices file
itself when it goes on without one (`settleNoticesStep`), and what it makes is a development package with no notices
file whatever ended the step. *Corrected 2026-09-27 by the gate review: the struck text claimed the flag never passed
over a crash, and it did, with a stale notices file left for `electron-builder` to carry and `afterPack` to accept.*
*A value other than `1` or empty is a usage error, and `pnpm package` exits 2 on it before any step runs
(REQ-STARTUP-149, `flagUsage`). Added 2026-09-27 by the review's second round: before it, such a value was found only
after the notices step, and the package exited 1 as though validation had refused.*
Such a package:

- shows REQ-SHELL-142's caption on its About page;
- carries no licence text for its shipped closure, and so not the tool server's (REQ-STARTUP-015/141/142);
- is announced as not releasable, in the step's line and again as the script's last line;
- carries a release artifact's name all the same. Its installer is `Rotaris-<version>-windows-x64-setup.exe`,
  REQ-STARTUP-031's name, and nothing on the file tells it from a release. Only `package.mjs`'s lines and
  `release/load-proof.json` do. What keeps it out of a release is the tag refusal below, because §4.2's workflow is the
  only route to one.

A build for a tag refuses the flag: `GITHUB_REF_TYPE=tag`, or `GITHUB_REF` under `refs/tags/`. §4.2's workflow therefore
cannot take this route even if it sets the flag. Only GitHub's variables are read, so a release built by any other route
is not recognised as one. `afterPack` refuses an artifact without the notices file unless the flag is set, and on a
build for a tag even when it is. So calling `electron-builder` directly does not get past either refusal. *The tag
half was added 2026-09-27 by the gate review. Before it, `afterPack` accepted the flag on a tag build.*

**4. Which copy of the tool server's licence text stands (plan §4.4's second fact).** REQ-STARTUP-015 wants exactly one
copy inside the bundle and cites REQ-STARTUP-142. REQ-STARTUP-142 requires the notices file to carry every shipped
dependency's full licence text, and `serena-agent` is one. So the copy REQ-STARTUP-142 compels is the one that stands,
and the copy this record named on 2026-09-06, under the distribution's `dist-info`, is the second. `electron-builder.yml`
filters it out of the artifact (`!runtime/**/serena_agent-*.dist-info/licenses/LICENSE`). The source tree keeps it,
because that is where the generator reads it. Nothing reads it at run time: the product never does, and `afterPack`'s
interpreter check reads `METADATA`. The requirements decide this between them, so no question is raised. On this tree's
real inputs the rendered notices text carries `serena-agent`'s MIT text exactly once (20.4 MB rendered, 1 occurrence).
The distribution's `RECORD` still lists the file it no longer carries in the artifact. Nothing in the artifact reads
`RECORD`; a tool that checks an installed distribution against it, as `pip uninstall` does, would find the file missing.
*Noted 2026-09-27 by the review's second round.*

**The evidence, and what it does not cover.**

- `afterPack` gains an "assets" rule (`apps/desktop/scripts/lib/about-assets.mjs`; *named `bundled-assets.mjs` until the
  gate review, which found the name taken: ~~REQ-STARTUP-143's "bundled asset" is a font family or the icon set~~
  `tools/notices/bundled-assets.json` already holds the bundled assets that carry a licence file, the three font
  families and the icon set. Corrected 2026-09-27 by the review's second round: the struck clause read REQ-STARTUP-143's
  licence-file clause as a definition. The specification lists both of this module's files among the bundled assets
  the shell reads (`docs/spec/12-desktop-shell-windows.md`, "Bundled assets read by the shell"; REQ-SHELL-140's
  "bundled text asset"), and the Distribution glossary now says so. The name stands: it says which surface the module
  serves*), which checks the artifact:
  - `build-id.txt` is one line, byte-identical to the file the step wrote, and names the tree being packed
    (`identifyBuild`, asked again at `afterPack`), so an identifier an earlier build left cannot be carried by an
    `electron-builder` called directly;
  - the notices file is byte-identical to ~~the one validation passed~~ the one in the source tree, or is absent only
    under the flag and never for a tag. *Corrected 2026-09-27 by the review's second round: `afterPack` does not run
    validation again, and nothing ties that file to the tree being packed as `identifyBuild` ties the identifier. On
    `pnpm package`'s path the file is this tree's, because the notices step has just regenerated or removed it; an
    `electron-builder` called directly carries whatever an earlier passing run left;*
  - no copy of the tool server's licence remains under its `dist-info`;
  - the notices file carries that licence text exactly once, read by the generator's own `normalize`.

  It fails the build naming each problem, including the case where a renamed distribution stops matching the filter.
  The count looks for a second copy at the `dist-info` path only, not across the rest of the artifact. On this tree
  the runtime carries the tool server's copyright line in that one file and no other.
- `about-assets.test.ts` runs the repository's own `electron-builder.yml` through electron-builder's own
  `getFileMatchers` and `copyFiles` (app-builder-lib 26.15.3, the yml parsed by the `js-yaml` it loads). The fixture
  tree is in both runtime layouts, with and without the notices file. Removing the filter or the build-id entry fails
  those cases.
- **No Windows package was run.** IC-3 bars a Linux artifact, and the Windows pack needs its own host. The "assets"
  rule's first run against a real `win-unpacked` is still owed, and it happens at the next `pnpm package` on Windows.
- `pnpm settings-proof` gains launch 1′, the present branch of each asset in the built app:
  - the Build row reads the identifier `pnpm build-id` wrote over this tree (`<HEAD>-dirty` while the change was
    uncommitted);
  - no caption stands under the licensing control;
  - the control opens `apps/desktop/resources/THIRD-PARTY-LICENSES.txt`.

  That notices file is a fixture, because `pnpm notices` refuses. The proof moves any real file aside first and gives
  it back byte for byte (`lib/staged-resources.mjs`). A run killed mid-launch is repaired by the next run. Both were
  measured: with real files present, with none, and after a `SIGKILL` during 1′.

  *Corrected 2026-09-27 by the gate review, on two points.* First, the repair could clobber a real file. If a real
  `pnpm build-id` or `pnpm notices` ran between a killed run and the next, the next run's restore put the stale file
  back over the new identifier, and deleted the new notices file. The stash's ledger now records each file the proof
  wrote by SHA-256 and modification time. A file that does not match is kept as newer, and the stashed one is dropped.
  The time is compared because `pnpm build-id` over the same tree writes the same bytes. Measured in the built app: a
  real identifier was staged, the proof was sent `SIGKILL` during 1′, and `pnpm build-id` then ran. The next run kept
  the new file, dropped the stashed one, removed the notices fixture, and passed. Second, the proof caught SIGINT and
  SIGTERM to give the files back. Node runs such a handler only after `spawnSync` returns. A script holding the same
  handler around a `spawnSync` showed that a SIGTERM during a launch was held until the launch ended, then ignored,
  and the script exited 0. The handlers are gone. `finally` covers a launch whose Electron dies, and the next run
  covers the proof's own death.

  *Corrected again 2026-09-27 by the review's second round, on two more points, each confirmed by its probe.* First,
  when the proof's fixture had been removed by another writer, the next run put the older stashed file back: a
  `pnpm notices` that refused after a killed run removed the fixture, and the notices file of an earlier passing run
  returned. A removal is now newer than the stash, like a write, so the name is left empty and the stashed file dropped.
  `restore` moves the stashed file over the proof's instead of removing the proof's first, so it never makes that state
  itself. Measured in the built app: a real identifier and an older notices file were staged, the proof was sent
  `SIGKILL` during 1′, and `pnpm notices` then refused and removed the fixture. The next run left the notices name
  empty, dropped the older file, put the identifier back byte for byte, and passed. Second, the ledger was written in
  place, and a kill during that write left it unreadable, so the fixture was kept and the real file dropped. The ledger
  is now written beside itself and renamed over. Two windows stay open, both while the proof has written nothing under
  a name, and `lib/staged-resources.mjs` names them: a write killed part-way, and a refusal during the absent-branch
  launch, which leaves no trace for the next run to read. *The same round added two smaller repairs: `package.mjs`
  reports a step it could not start as that, not as a signal, and `settings-proof` asks git for HEAD without the
  variables of an enclosing git process, as the writer does.*

**What this found.** No defect in the mechanism the record decided. It found one false statement nearby: `package.mjs`
said "`out/` now holds a SEAM-FREE build" after every run, including one refused before the build. That line now
prints only when the build ran (`docs/defects/fixed/pnpm-package-announced-a-seam-free-build-it-had-not-made.md`; the
closing lines are `scripts/lib/package-verdict.mjs`'s, tested). With it, a refusal writes an `error:` line to stderr
(REQ-STARTUP-149), and a counterfactual that ended before `electron-builder` is reported as not exercised. It also
found one craft note on the About page, recorded in `docs/defects/`. **Nothing in this record's decision changes.**
The gate review's corrections above change how decision 3 is carried out. They do not change the decision.

## The prerelease naming repair — 2026-09-28, first execution (R-062; first-release plan §4.1/§4.2/§4.5)

*Reported in place under the standing policy; row in `../first-executions.md`. The note is
`../../defects/fixed/a-prerelease-version-reaches-the-installer-hyphenated.md`.* The decision above says the artifact names
are one module shared by the build configuration and the updater, "with per-target `artifactName` templates producing their
exact names". The templates were `Rotaris-${version}-windows-x64-setup.${ext}`, and `${version}` is not the declared text:
electron-builder normalises the manifest's version through loose SemVer when it reads it, and renders the normalised value
(`0.1.0rc1` → `0.1.0-rc1`). **The decision stands; how it is carried out changes.** The names are still the naming module's,
but they reach electron-builder as **literals**, rendered from the declared text, and never through its macro:

- `pnpm package` (`scripts/package.mjs`) reads the declared text from `apps/desktop/package.json` — the one place §4.1
  decided — through `scripts/lib/artifact-names.mjs` (`declaredProductVersion`, validated by REQ-STARTUP-029's grammar; a
  text outside it renders no REQ-STARTUP-031 name and stops the package), renders `artifactName(declared, 'setup')`, and
  **writes the yml it would have run with, `win.artifactName` and `nsis.artifactName` set to that literal**, as
  `release/electron-builder.package.yml`, which is what `electron-builder --win --config …` then loads. `electron-builder.yml`
  carries no `artifactName` at all any more, and `configurationWithNames` refuses to overwrite one that reappears there.
- **A `-c.win.artifactName=…` command-line override was measured and refused.** Beside `--config <file>` electron-builder
  turns the two into `{ extends: <file>, win: {…} }` and, with no path left to load, also reads the project's default
  `electron-builder.yml`: the yml is merged twice (`files` and `extraResources` doubled), and the keep-prebuild
  counterfactual's variant (`package.mjs`, IC-6) is merged *over* the base rather than in place of it, so the base's
  prebuild exclusions stay in force and the counterfactual stops being one. The written configuration keeps a single load,
  measured through app-builder-lib's own `getConfig` (`artifact-names.test.ts`).
- `build-hooks.cjs`'s `checkNaming` (afterPack) takes the declared text and **the names electron-builder is configured to
  produce**, each configured pattern expanded by electron-builder's own `expandMacro` with the values it will use — so the
  old template renders `Rotaris-0.1.0-rc1-…` and is refused with a line saying the version reached electron-builder
  hyphenated, and a configuration with no name is refused too (a bare `electron-builder --win` would fall back to
  electron-builder's own `${productName} Setup ${version}.exe`). A new **`artifactBuildCompleted`** hook refuses any produced
  file whose name is not the declared version's installer or its block map, so the rule holds after the fact as well as
  before it. afterPack's report now records both `declared` and electron-builder's `normalised`.
- The block map is accepted because electron-builder emits it for an NSIS target whatever `publish` says, as the first
  execution of 2026-09-04 above already recorded against this decision's "no … block-map files are emitted". It is named
  after the installer, so it carries the declared text; whether the pipeline publishes it is §4.7's and REQ-STARTUP-152's
  business, not the build's.

**What stays normalised, and the question it raises (OQ-80).** The installer's own Windows metadata is still written from
electron-builder's `appInfo.version`: the NSIS `VERSION` define, which becomes REQ-STARTUP-018's `DisplayVersion` and the
uninstall display name `Rotaris 0.1.0-rc1`; the `ProductVersion` version key; and `VIProductVersion`, four numbers by
Windows' own rule (`0.1.0.0`), which no spelling could carry a suffix in. `extraMetadata.version` would have forced the
declared text through — electron-builder deep-assigns it *after* normalising — and was not used, because §4.1 decided that
either it or `buildVersion` is a second place a version is declared. Whether REQ-STARTUP-158 reaches that metadata is
**OQ-80**; the build proceeds with it as electron-builder writes it, said in `electron-builder.yml`'s header.

**Measured.** 26 new unit cases: `apps/desktop/scripts/lib/artifact-names.test.ts` (15 — the names for `0.1.0`, `0.1.0rc1`,
`0.1.0a2`, `0.1.0b3`; `0.1.0-rc1` and `0.1.0dev1` refused by the grammar; the manifest read raw for all four and refused
without a version or outside the grammar; the produced-name rule over the declared installer, its block map, the hyphenated
installer and electron-builder's own pattern; the written configuration loaded by app-builder-lib's `getConfig` with both
keys literal, the three hooks and the targets kept, `extraResources` and `files` once; the bare yml loading with no name;
a template already in the configuration refused; the keep-prebuild variant named with its own files list),
`apps/desktop/scripts/build-hooks.test.ts` (10 — `checkNaming` passing the declared name and refusing the hyphenated one,
one wrong key among right ones, no name, and a declared text outside the grammar; `configuredArtifactNames` through
electron-builder's real `expandMacro` over a normalised `0.1.0-rc1` rendering the defect's exact name and being refused, the
literal surviving, the stable case identical either way; `artifactBuildCompleted` over this tree's declared version) and
one more in `tools/release-naming/src/naming.test.ts` (the hook's plain-Node load refusing the hyphenated name, beside the
passing case rewritten to the new signature); counted from `pnpm vitest run … --reporter=verbose` over the three files,
30 cases in all, 4 of them `naming.test.ts`'s older ones. *Corrected 2026-09-28 by the review round: the first report
said 16, 11 and 32 new, which no run shows.* `pnpm check` and `pnpm build` green under Node 24.

**Not shown here — IC-3.** No Windows package can run on this host, so the repaired path has produced no installer. The
**next Windows `pnpm package`** must show, with the manifest temporarily declaring `0.1.0rc1`: the line
a line beginning `[package] declared 0.1.0rc1 → Rotaris-0.1.0rc1-windows-x64-setup.exe, written into release` (the
separator Windows prints, then `electron-builder.package.yml (from electron-builder.yml)`);
afterPack's `[ic6] naming: declared 0.1.0rc1, electron-builder's normalised 0.1.0-rc1; configured to produce
Rotaris-0.1.0rc1-windows-x64-setup.exe, Rotaris-0.1.0rc1-windows-x64-setup.exe`; `[ic6] naming: produced
Rotaris-0.1.0rc1-windows-x64-setup.exe` and the same for its `.blockmap`; the file by that name under `release/`; and the
installer's `DisplayVersion` read back from `HKCU\…\Uninstall\Rotaris` after a scratch install, for OQ-80's record. With
`0.1.0` declared it must package exactly as the 2026-09-04 execution did. The "assets" rule's first real run, owed above,
happens at the same package.

## The updater — 2026-09-28, first execution (`first-release-plan.md` §4.6; O-10, R-062)

*REQ-STARTUP-043, 046, 057, 105–126, 146, 150, 161–164, 167, 168; REQ-SHELL-114, 118, 121; `PD-STARTUP-001`;
`PD-MONITOR-002`. Reported in place under the standing policy; row in `../first-executions.md`.* The bespoke main-process
updater this record decided is built, in the shape the Decision fixed: `apps/desktop/src/main/updater/` — `classify.ts`
(106), `feed.ts` (105, 107–110, 112), `keys.ts` (167, 168), `download.ts` (118, 124), `install.ts` (122, 123),
`strategies.ts` (115, 125, 126), `updater.ts` (the orchestrator: 114, 116–121, 046) and `electron.ts`, the one file of
it that touches Electron (`net.fetch`, so the system proxy and certificate store apply), the disk, `reg.exe` and a
process. Everything else is pure over ports and decided by the tests beside it. The names and the order come from the
one naming authority, which gained REQ-STARTUP-109's order and the manifest format for it (`tools/release-naming`), so
the exact-string lookup the Decision requires is structural. Four things the record left open were decided here, each
stated so a reader can check the design against the requirement.

**1. Where the key set lives, and its form.** `RELEASE_SIGNING_KEYS` in `apps/desktop/src/main/updater/keys.ts`,
compiled into main's bundle: resolved from within what was installed (REQ-STARTUP-159), reachable from no configuration
value, preference, environment variable, control or download (REQ-STARTUP-167). The signature is **Ed25519** (RFC 8032)
through Node's `crypto`: `SHA256SUMS.txt.sig` holds the **raw 64-byte signature over the manifest's exact published
bytes**, and a key is an **SPKI PEM** text block — what `openssl genpkey -algorithm ed25519` and `openssl pkey -pubout`
produce, and what `openssl pkeyutl -sign -rawin` signs with. The specification leaves both forms to the implementation
(domain 11's Data & Formats: "the form of a key, the form of a signature, and how many keys a build carries are
implementation choices"); **OQ-83** asks whether the record should fix them so the pipeline (§4.7) cannot choose
differently, and the build proceeds under this reading. **What O-2 must add, and where:** one element in that array —
the public half of the release signing key as an SPKI PEM block, between `-----BEGIN PUBLIC KEY-----` and
`-----END PUBLIC KEY-----`. The private half is the pipeline's secret and never enters the repository. A rotation
appends the incoming key while the outgoing one is still carried (168 (a)); a withdrawal removes it so no later build
carries it (168 (d)); the pipeline's key record (§4.7, 168 (b)) starts with the first build that carries a key, and
this build carries none. **The set ships EMPTY on this tree.** With no key, `verifyDetachedSignature` answers `no-key`,
the install step refuses every manifest with one sentence saying the build carries no verification key, and nothing is
downloaded — measured in `install.test.ts`: the manifest and its signature fetched, no third request, no staging
directory. That is REQ-STARTUP-122/123's outcome for an unverifiable release, not a stub.

**2. The launcher's variable is named.** The record decided the launcher "publishes its own declared variable" and did
not name it. It is **`ROTARIS_PORTABLE_ARTIFACT`** (`classify.ts`), the variable REQ-STARTUP-147 admits as "the variable
by which that form names the artifact file a launch started from", a file path and nothing else. Two obligations on the
portable stub (§4.5, not built), recorded here so its spike inherits them: it must publish that variable with the
artifact's absolute path, and it must **forward its own arguments to the payload**, because the successor launch below
carries a token the payload has to see.

**3. The classification's residue.** A packaged Windows build with neither a registry match nor the variable — the
payload run directly out of a preparation, or an installed tree copied elsewhere — is **not updatable** here, this
record's reading ("absent variable → not updatable … the requirement's own default"). REQ-STARTUP-106's copied-tree
sentence reads the same case as portable, with the running executable replaced by a single-file portable. The two texts
disagree; the build follows this record, the launch performs no check, and its log line names the reason. **OQ-84.**

**4. The offer notice under two requirements.** REQ-STARTUP-118 gives the download a non-persistent notice titled
`Downloading Rotaris {version}` with a fixed message; REQ-SHELL-118 keeps the offer's title and identity, updated in
place, with a message conveying two things and no more, and re-enables the action "ready to install" when the download
completes — where REQ-STARTUP-122 runs download → verify → apply without a pause. Built: the **identity is kept and the
notice updated in place** (REQ-SHELL-118, and this record's "the same notice by identity, never by replacement"), through
a new `update` on the notice store; the **title and the message are REQ-STARTUP-118's** (Distribution owns the words,
Shell the surface — `CONTEXT-MAP.md`'s relationship); **not persistent while downloading**, so no dismissal can wave off
a version whose install is in flight; the action **disabled** with `The download is in progress; the same download
cannot be started twice.` as its accessible description (the notice contract's new `action.disabled`, drawn by
`Notice.tsx`); and **the apply follows the verified download without a second click**, so REQ-SHELL-118's "ready to
install" state stands only for the length of the apply. A failure becomes the `Update not installed` error notice in
place (REQ-STARTUP-120; REQ-SHELL-118's "SHALL become"), recorded before it is rendered (REQ-NOTIFY-268). **OQ-85** asks
which requirement governs the title, the persistence and the pause.

**The restart, built on ADR-0055's decision.** `Restart now` starts the target — the updated portable — with
`builtin:update-successor -- <this instance's hand-over endpoint>` on the sentinel branch (OQ-43 covers the composition,
as ADR-0055 says it should); the successor performs no claim and no hand-over attempt, opens its own endpoint and
announces its record over the predecessor's (`inheritInstance`, `packages/platform/src/instance.ts`); the predecessor
replaces the record's contents with the successor's fields in one atomic replacement (`replaceDocument`: a sibling
renamed over), answers, and only then destroys its windows and quits through the ordinary path — its `close` at quit
leaves a record that no longer names it. A successor that cannot be started surfaces through `Update not installed` and
nothing closes; one that never signals leaves the predecessor as it was, with no timeout of its own (ADR-0055). The
successor's own wait for the predecessor's answer is bounded by the hand-over interval, because the predecessor answers
at once and a successor left unanswered must not become a rival: it ends quietly. `instance.test.ts` drives the pass in
one process: the record names the successor afterwards, the predecessor's close leaves it, a third launch is handed to
the successor, a successor with no answer is refused within the interval and changes nothing, and a successor from
another machine is not accepted.

**What was executed, and what was not.** Unit: 145 cases in 14 files — the seven updater modules, the notice store's
`update`, the instance record's pass, `MainWindows`' post-show activation, the two commands, the naming authority's
order and manifest format — under `pnpm vitest run`. Built application, on Linux under Xvfb (`pnpm updater-proof`,
7 checks, all green): the source-tree launch is classified not updatable, writes exactly one `update check:` line at
`info` for its one main window naming REQ-STARTUP-106, records no request, quits cleanly with nothing in flight, and a
proxy sink that every request of Chromium's stack would reach (`--proxy-server=127.0.0.1:<port>`) saw no connection for
`github.com`. **Not executed here, and not faked:** a check that goes out to the endpoint; an offer on screen; a
download; the installer and portable apply against a real artifact; the restart between two real processes. Every one
of them needs a packaged Windows artifact launched from its install directory or through its launcher, which IC-3
places on the Windows host; their first execution is owed to the next `pnpm package` on Windows, with the "assets"
rule's. **The proof found one thing beside the mechanism:** the sink recorded `CONNECT redirector.gvt1.com:443` —
Chromium's own component updater reaching out from the built application, a request no requirement names and
REQ-STARTUP-160's disclosure cannot carry — filed as
`../../defects/fixed/the-built-app-opens-a-connection-to-chromiums-component-updater.md`, not repaired here.
*Corrected 2026-09-28 by the repair (R-062): the cause named in that sentence was wrong.* A net-log of the same launch
named the request as Electron's spellchecker downloading a Hunspell dictionary
(`https://redirector.gvt1.com/edgedl/chrome/dict/en-us-10-1.bdic`), not the component updater, and
`--disable-component-update` was measured to change nothing. `apps/desktop/src/main/runtime-requests.ts` empties each
session's dictionary list and turns the spellchecker off in `session-created`, the one point measured to prevent the
download; `pnpm updater-proof` now asserts **zero** connections at the sink from launch to first paint and an orderly
quit (9 checks), beside its `github.com` check. OQ-93 asks whether any text field is spell-checked.

**Readings stated rather than left in code.** REQ-STARTUP-123's two hash outcomes follow the download as its sentences
say ("the download was discarded"), so an asset the manifest does not list is downloaded and then discarded rather than
refused before the download. A portable whose medium is gone since launch reads as "the directory holding it cannot be
reached", in REQ-STARTUP-125's shape for that case, and only an artifact missing from a directory that is there reads as
"not installed from a released artifact". The demo flavour (REQ-STARTUP-057) is a parameter of the activation, false
for every window until the demo entry (REQ-SHELL-162) is built. Every line the updater writes is `info`
(`PD-MONITOR-002`), a failed install `warning`, a successor that could not be started `error`. The installer's
auto-close and the restart's close destroy the main windows rather than asking the close guard: the user chose the
action, and after the record has passed the predecessor must not stay. That is a reading between two SHALLs —
REQ-STARTUP-119's "the window SHALL auto-close" and REQ-STARTUP-121's close against REQ-STARTUP-046's confirmation
"when a run is active" — and **OQ-86** asks which governs. **Nothing in this record's decision changes.**
*Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)), and built the same day (plan fin21): the reading
above no longer stands.* REQ-STARTUP-046's confirmation governs both closes and is asked when the action is clicked — before
the installer is spawned or the successor started, since declining after either could not keep the window — by
`UpdaterDeps.confirmClose` for `Restart now` and for `Update now` on the installer flavour alone (the portable's apply closes
nothing). Declined, nothing starts and the notice stays; accepted, the closes are made as before, without asking again.
*Falsified the same day by the build's verification:* "without asking again" let a run started during the installer's
download — minutes in which the window accepts input — be ended by the auto-close unasked. The count is now re-read
immediately before the installer is spawned or the successor started (`UpdaterDeps.activeRuns`, `runInstall`'s
`beforeApply`, `mustAskAtHandOff`): after a download, any run active then is asked about again; for `Restart now`, a run
past the count the click covered. Declined there, the verified download is discarded and the offer returns in place.

**Repaired at verification, 2026-09-28 (same item, R-062).** The independent verification found three defects in the
build above, and writing the third's test found a fourth; each is repaired with a test beside it, and nothing in this
record's decision moved. (1) *The classification order.* The AppImage test ran before the released-artifact test, so a
`pnpm dev` inheriting `APPIMAGE` from an AppImage-hosted terminal was the appimage flavour and contacted the feed
(reproduced in the built app), and the same variable on a packaged Windows build selected a flavour `PD-STARTUP-001`
never offers. REQ-STARTUP-106's "before any other flavour test" orders the **flavour** tests; the released-artifact
test is not one, and no variable overrides it. The packaged test now runs first and the AppImage test applies to a
packaged Linux build alone (`classify.ts`); `pnpm updater-proof` launches with `APPIMAGE` and
`ROTARIS_PORTABLE_ARTIFACT` set and still records no request. (2) *The record passed to anyone.* `passRecord` rewrote
the record for any well-formed successor on this host, whether or not a restart was waiting, so an unsolicited
`builtin:update-successor` launch became a second instance (REQ-STARTUP-161). The claim now takes `acceptSuccessor`, and
main answers true only while its restart waits; it does not match the spawned pid, because the portable's launcher
stands between that process and the one that announces itself. (3) *An installed update offered again.* A later
window's check after `Update installed` re-offered the same version, replaced the notice and made `Restart now`
unreachable; the check now stays silent while an update is applied or handed off for that version or a newer one.
(4) *The cleanup ran per window.* REQ-STARTUP-115's `<name>.old` cleanup ran at every window's check and so deleted the
backup the same process's apply had just made; it is launch-time, once per process. Also aligned: the copy port
replaces `<name>.update`, the updater's own sibling, as its contract now says. Unit: 152 cases in the same 14 files;
`pnpm updater-proof`: 8 checks, all green.

**Repaired at the second verification, 2026-09-28 (same item, R-062).** (5) *A refused pass left the restart waiting
for ever.* A successor that started and was accepted, but that the record could not be passed to — the record no
longer named this instance (a REQ-STARTUP-164 (3) reclaim meanwhile), or its atomic replacement failed (on Windows, a
scanner or indexer holding the file through the rename) — was answered not-passed and ended quietly, while main's wait
stayed armed: `Update not installed` never surfaced and every later `Update now`, `Try again`, `Restart now` and window
check answered `update.busy` for the rest of the process. REQ-STARTUP-121 puts that case on its failure branch, and it
is not ADR-0055's "successor that never signals", because the predecessor sees the refusal itself. The claim now takes
`onRecordPassFailed(successor, reason)`, fired only for an announcement `acceptSuccessor` accepted; main's wait
(`updater/successor.ts`) settles exactly once — passed, the spawn failed, or the pass failed — so the restart raises
`Update not installed` with the reason as its detail and the in-flight guard clears. The refusal's answer now carries
its reason, and the successor's `launch refused` line names the check that refused it. Pinned by `instance.test.ts`
(a failing replacement, and a record rewritten for another pid: the callback fires, the record is byte-for-byte
unchanged; an announcement never accepted does not fire it), `successor.test.ts` and `updater.test.ts`. Still not
decided here: an answer the successor no longer waits for — its 5 s bound expired while this process was blocked — is
recorded in `../../defects/` as a defect, not repaired. Unit: 162 cases in 15 files.

**Repaired — the two variables stay with the launch they describe, 2026-09-28 (same item, R-062).** (6) *A child
inherited this artifact's path.* `classify.ts` read `APPIMAGE` and `ROTARIS_PORTABLE_ARTIFACT` from `process.env`, and
both stayed there for the life of main, so every child of the product inherited them — the run host and the workspace
services by `utilityProcess.fork`'s default, and from the run host every tool, terminal, hook, MCP server and
code-intelligence branch. A packaged Rotaris started from a shell inside a portable Rotaris would have classified
itself portable from the other artifact's path and aimed its rename-aside at that file; REQ-STARTUP-147 calls such a
variable "set by the artifact's own runtime rather than by a user", and an inherited copy is neither. Observed before
the repair in the built app (a scripted `terminal` call's shell carried both). **Repaired at one seam:** main's own
environment, from which every child's is derived. The first statement of main's module body takes the two names out
of `process.env` and returns what they held (`takeArtifactVariables`, `packages/platform/src/artifact-environment.ts`,
where the names now live); the classification is handed that (`classifyThisInstallation(launchArtifact)`) and never
reads `process.env`. Nothing else is removed — the AppImage runtime's `APPDIR`, `ARGV0` and `OWD` name nothing the
product reads. What this record already decided is unchanged, and it is what makes one seam enough: the portable's
successor is started from the launcher stub, which publishes its own variable (item 2 above), so no launch depends on
inheriting one. Pinned by `artifact-environment.test.ts` and `apps/desktop/src/main/launch-artifact.test.ts` (the take
precedes every fork and spawn in main's body; the classification reads what it took), and by `pnpm updater-proof`'s
second stage — the built app launched with both variables set, one scripted `terminal` call writing its shell's
environment: neither variable, the launch's other variables kept; 11 checks, all green. Not executed: a packaged build
(IC-3); the hooks' and MCP servers' environments were not read separately — they are the run host's, which the
terminal's reading measures. **Raised: OQ-90** — REQ-STARTUP-147 names the variables written for child processes and
none removed from them, and REQ-HOOKS-032 says a run "sees exactly the environment the application itself was started
with"; the build proceeds on this record's reading that a variable describing the artifact is not part of the
environment a child is handed. The note: `../../defects/fixed/the-artifact-variables-reach-the-products-own-child-processes.md`.

**Repaired 2026-09-28 (R-062): (7) the record passed to a successor that had stopped waiting.** The defect the
paragraph above filed (`../../defects/fixed/the-record-can-pass-to-a-successor-that-stopped-waiting.md`) is repaired
by making the pass two steps, as ADR-0055's restart section now records (*Amended 2026-09-28*). The predecessor offers
the record. It rewrites the record only once the successor has acknowledged within the hand-over interval, on the
timer port. A successor that closed first, or whose acknowledgement is late, leaves the record intact and fails the
restart through `onRecordPassFailed`, so `Update not installed` surfaces and nothing closes. The updater's side is
unchanged: `updater/successor.ts` already rejects on any pass failure. Pinned by `instance.test.ts`: the offer
before the pass; a successor that closed before answering; an acknowledgement missing past the interval on a
`FakeClock`, and a late one refused; a predecessor loop blocked past the successor's bound, red against the one-step
pass; the successor's unbounded wait once it has acknowledged; its reading of the record when the predecessor ends
without a last word; and the ordinary hand-over unchanged.

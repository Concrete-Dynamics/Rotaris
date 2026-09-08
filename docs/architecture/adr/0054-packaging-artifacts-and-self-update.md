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
  argument vocabulary, no subcommand and no flag, and ADR-0055 already carries **OQ-43** for the one
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
dist-info; the notices generator (`REQ-STARTUP-141/142`) is still not built.
**IC-7 adopted 2026-09-06 (ESC-32, option 2):** the language servers are tools provisioned after installation;
`REQ-STARTUP-142`'s section now lists them after Git and ripgrep, from the same manifest, and the generator that
will write that section is the one still owed here — IC-7's second half is discharged when it does.

## Two assets the About page asks this record for — 2026-09-08 (Part AG)

`REQ-SHELL-140` reads the build identifier from **a bundled text asset** and `REQ-SHELL-142` opens **a bundled
third-party notices file**. No build in this tree produces either, so the About page ships each requirement's own
absent branch — an em dash for Build, and the caption "This build does not carry a third-party license bundle." Both
branches are built and exercised (`pnpm settings-proof`, launch 1), so nothing here is a stub: what is owed is the two
assets, not the surface. Main resolves them the way every other bundled resource is resolved — `process.resourcesPath`
for a packaged build, else `apps/desktop/resources/` — in `apps/desktop/src/main/about.ts`, which is where a packaging
change would land them. `shell.openThirdPartyLicenses` answers `licenses.absent` until then.

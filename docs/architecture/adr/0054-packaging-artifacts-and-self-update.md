# ADR-0054 — Packaging, the four artifacts, and self-update

- **Status:** proposed
- **Date:** 2026-08-31
- **Revised:** 2026-09-01. **Reopened and re-decided.** The packaging tool's own portable target cannot
  meet `REQ-STARTUP-155` at any bundle weight, including an empty one; SR-7 rules that the artifact
  prepares itself once and launches from that preparation, and `REQ-STARTUP-165` now states the contract
  that preparation must satisfy. Both escalations this record raised are also ruled and are converted
  from open questions into decisions.
- **Origin:** UI (ADR-UI-12)
- **Depends on:** ADR-0001, ADR-0002, ADR-0042, ADR-0049, ADR-0056
- **Governed by:** `owner-decisions.md` ESC-8, ESC-11, SR-7
- **Evidence:** `../spikes/packaged-first-paint.md`; `../spikes/windows-writer-handle-compaction.md` §3.2
  for the Windows replace semantics the update path depends on.

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
self-listed; **a release publishing no manifest is refused as unverifiable. No signature is verified.**
`REQ-STARTUP-152` and `REQ-STARTUP-035`: **every** asset a release publishes, every filename its
manifest lists, and every filename the update client asks for are values of that **one** naming scheme
and must agree, with the release body carrying exactly one row per published asset except the manifest.

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
and never the failure path; **(d)** preparing uses nothing but the artifact, issues no network request
and raises no elevation prompt; **(e)** the run can identify **the artifact file the launch started
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
- **The updater is a main-process module** with a strict sequence: fetch and parse the manifest; stream
  the asset into a fresh staging directory in chunks; verify; apply. It reports progress into the
  **same notice by identity, never by replacement**, at the specified granularity with a final settle
  update.
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
- **Native modules** — the pseudo-terminal binding above all (ADR-0020) — must be rebuilt against the
  shell's binary interface and shipped unpacked from the archive. The pseudo-terminal's platform floor
  becomes a stated system requirement.

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

**How a preparation is known to be complete — the directory name is the completion.** A preparation is
written into a sibling directory under a name that cannot be mistaken for a finished one, its contents
flushed, and then **renamed onto the token-named path as the last step**. A directory bearing the token
name therefore exists only if it was finished. This is what makes clause (c) cheap: incomplete means
absent, so the recovery path and the first-run path are the same code.

**What the fast path costs — one directory probe and one small read.** On every later run the stub
resolves the preparation root, checks for the token-named directory, reads a small marker inside it
recording the token and the launcher's own format version, and executes the payload. It reads none of
the payload and hashes nothing. **The measured cost of that check is required before the gate and is not
claimed here** (SR-7's spike 20).

**When it is redone — always, silently, on any doubt.** Clause (c) makes preparing the recovery path and
forbids it being the failure path. So: token-named directory absent, marker absent, marker unreadable,
marker naming a different token or an unrecognised format, or the payload's own entry point missing →
**prepare again**, with no message, no notice, no log line the user sees, and no failure. `REQ-STARTUP-150`
restates the same silence. A repeated preparation is a first run of that version for `REQ-STARTUP-155`'s
purpose, so recovering never makes a build non-conformant.

**Two launches racing to prepare, which SR-1 does not prevent.** The preparation happens in the stub,
**before** the Electron process exists and therefore before the instance claim of `REQ-STARTUP-164` can
resolve anything. Two double-clicks in quick succession produce two stubs both preparing. Each writes
its own unfinished directory, and the rename decides: the loser finds the token-named path already
present, **discards its own work and uses the winner's**, since by clause (b) an identical artifact's
preparation is interchangeable. The loser pays one wasted extraction; nothing is corrupted and nothing
is reported. Both then launch, and the ordinary single-instance resolution hands one to the other.

**Reclaiming superseded preparations.** Clause (b) requires only that a preparation be *identifiable* as
belonging to its artifact so it can be removed. Left alone, an update would leave roughly a payload's
worth of disk behind per version. So: after the window is shown and off the critical path, a run started
from a preparation removes preparations under the same root bearing **other** tokens. It is best-effort —
a deletion that fails is retried on a later launch and never reported, exactly as `REQ-STARTUP-115`
treats its own leftover — and it is **not** part of the closed background activation `REQ-STARTUP-043`
enumerates, so it must not be scheduled as though it were.

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

**How the artifact is identified for the update path — from the environment the stub sets, never from
the running image's own path.** Clause (e) and `REQ-STARTUP-106` both require the artifact the launch
started from. Under a preparation the running image's executable path points **into the preparation**,
so it answers the wrong question; the launcher passes the artifact's full path to the application in a
declared environment variable, and that value is the sole input to flavour classification and to the
update target. Three consequences fall out and each is desirable:

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

**What the ruling obliges this record to own:**

- **The verification step gains a signature check over the manifest, before any digest in it is
  trusted.** The manifest remains the sole source of asset digests (`REQ-STARTUP-108`,
  `REQ-STARTUP-032`), so its authenticity gates everything downstream of it. A release whose manifest
  fails the signature check is refused on the same footing as a release publishing no manifest at all:
  unverifiable, offering nothing.
- **The signature must not become a fifth published asset.** `REQ-STARTUP-152` and `REQ-STARTUP-035`
  require every filename a release publishes to be a value of the one naming scheme, with exactly one
  release-body row per published asset except the manifest. A detached signature file would be a
  filename the scheme does not name. The signature therefore travels **inside** the manifest, as content
  the checking tool `REQ-STARTUP-032` names still tolerates, or the manifest's own format is not changed
  at all and the signature is carried in the release body's manifest row — this is a format decision the
  release pipeline and the updater must agree on, and it is the one part of the ruling that still needs
  writing down precisely. **The constraint it must satisfy is that no new filename appears.**
- **The verification key is shipped in the application**, which makes key rotation a **release**
  question rather than a runtime one: a client can only verify with the key it was built with, so an
  older client cannot verify a release signed with a newer key and will report the release
  unverifiable — an invisible failure under `REQ-STARTUP-110` if it happens at check time, and a visible
  one under `REQ-STARTUP-120` if it happens at install time. **Rotation therefore requires a period in
  which the manifest carries signatures under both the outgoing and the incoming key**, long enough to
  cover the versions still in the field. This is the architecture obligation the ruling names, and it is
  recorded here rather than discovered at the first rotation.
- **The key material is a release-pipeline secret and never ships**; only the public half is in the
  application. Nothing about this changes the unsigned-binary decision or the platforms' first-launch
  warnings.

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
   Its build is ADR-0056's obligation. Two properties are non-negotiable and both come from the
   measurements: it must place the payload at file-copy speed rather than at the 30–39 MB/s the tool's
   own stub achieves, and its steady-state path must not read or hash the payload.
6. **A first run of each version is slow, and nothing tells the user why.** `REQ-STARTUP-165` (c) and
   `REQ-STARTUP-150` forbid reporting anything about preparing, reusing, superseding or redoing a
   preparation — so a user who updates and then waits while their machine writes several hundred
   megabytes sees only a slow launch. That is the specification's deliberate choice and this record
   implements it; it is named here because it is the most likely user-visible surprise the design
   creates, and because the temptation to add a splash will recur.
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

## Revisit if

Spike 20 shows the prepared launch does not reach first paint inside `REQ-STARTUP-155` on the steady-state
path — in which case the fast path's cost, not the artifact form, is what has to change, since the
0.7-second copy baseline says the extraction itself is not the obstacle. Or the preparation root proves
unavailable or unwritable on a real deployment shape this record has not anticipated — a locked-down
per-user profile above all — in which case clause (c)'s "prepare again, never fail" degenerates into
preparing on every launch, and the artifact silently returns to P1's behaviour without returning to P1's
honesty; that case needs a stated outcome and does not have one. Or the product ever acquires code
signing, at which point signature verification of the artifacts themselves becomes possible, ESC-8's
manifest signature is subsumed by it, and `REQ-STARTUP-123`'s explicit note would be worth revisiting as
a requirement.

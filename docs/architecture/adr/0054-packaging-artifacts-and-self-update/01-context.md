# ADR-0054 — Packaging, the four artifacts, and self-update — Context

Part 1 of 22 of [ADR-0054](../0054-packaging-artifacts-and-self-update.md), which indexes every part.

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

# ADR-0066 — The Linux artifact is built on a developer host, and accepted against stated criteria

- **Status:** accepted (the owner, 2026-10-26); awaiting its first execution
- **Date:** 2026-10-26
- **Origin:** [R-087](../../product/requests.md#r-087), the owner's ruling that no implementation condition may prevent a
  Linux build: "das IC, also Implementation Conditions sollten keine Linux-Builds verhindern, weil du, Philipp, willst
  ja Linux-Builds machen, danach auf deinem PC und die auch noch später publishen, heißt deine Arbeit darf nicht
  blockiert werden dadurch. … Müsste ein AC sein und eine Architekturentscheidung." It narrows
  [IC-3](../implementation-conditions/ic-3-the-build-host-obligations.md) to macOS and amends GD-5 and GD-6
  ([`owner-decisions.md`](../owner-decisions.md)) in place.
- **Depends on:** ADR-0054 (packaging, and its "Linux and macOS configuration prepared" section), ADR-0056 (the build
  toolchain and its load proof), ADR-0022 (OS-level confinement, which IC-8 binds).
- **Requirements:** `REQ-STARTUP-024`, `REQ-STARTUP-025` (the AppImage and its build base); `REQ-STARTUP-155` (first
  paint); `REQ-STARTUP-156` (release acceptance); `PD-STARTUP-001` governing what a release publishes.

## Context

GD-5 (2026-09-02) deferred four obligations to hardware the record did not have and bound them as IC-3: spike 12 (the
AppImage's runtime on a host that never had `libfuse.so.2`), spike 17's macOS and Linux first paint, ADR-0056's load
proof on the macOS and Linux runners, and the instance claim on both. GD-6 then read IC-3 as "no Linux or macOS
artifact before the build hosts do", and `CLAUDE.md` carried that as the one bound no agent may treat as advice. In
code, `build-hooks.cjs` refuses every platform but `win32` with an IC-3 message.

The obligations were right and stay right. What changed is the premise that a Linux build host does not exist: a
developer of this project has one and wants to build, and later publish, the Linux artifact. A deferral to hardware
that blocks the person who has the hardware has stopped being a scheduling fact. The owner set IC-3 and removes its
Linux half.

**Why an ADR and not a directive.** A product directive (`docs/product/README.md`) is for behaviour the owner wants
*instead of* what a live requirement states. Nothing here contradicts a requirement: `REQ-STARTUP-024` and
`REQ-STARTUP-025` already require the Linux artifact. What blocked it was a condition in the architecture record, set
by an owner ruling, so it is lifted where it was set — GD-5 and GD-6 amended in place, IC-3 narrowed — and what the
condition guarded is restated here, as acceptance criteria on the artifact, which is the form the owner named.
Publication is a different matter and does touch requirements: `PD-STARTUP-001` narrows `REQ-STARTUP-026`, `030`,
`035` and `156`, and changing what a release publishes stays a directive of its own.

## Decision

**1. A Linux x86_64 artifact may be built.** On any Linux host a developer has, from this repository, with the
configuration `apps/desktop/scripts/lib/platform-targets.mjs` prepares (`linux-x86_64`: an `x64` AppImage, the
static runtime `toolsets.appimage` "1.0.3", `REQ-STARTUP-024`'s desktop entry). No implementation condition binds
the act of building it. IC-3 binds macOS alone; IC-8 binds confinement claims, not builds.

**2. Building is not accepting, and accepting is not publishing.** Three states, each with its own gate:

| State | What it takes | Who decides |
| --- | --- | --- |
| **built** | the build completes on a Linux host | the developer |
| **accepted** | AC-1 to AC-4 below, each recorded whether it passed or not | the record — this ADR's notes |
| **published** | a directive withdrawing or narrowing `PD-STARTUP-001` for `linux-x86_64`, and `REQ-STARTUP-156`'s gate run for that key | the owner |

A built artifact that has not met AC-1 to AC-4 is an **untested artifact** and is described as one wherever it is
handed to anyone. GD-5's warning holds for it word for word: it is shipping on an untested platform.

**3. The acceptance criteria.** Each is IC-3's Linux half, moved here and not reduced. Each is discharged into a
dated spike report in `docs/architecture/spikes/`, a note on this ADR and on the ADR the obligation belongs to, and a
row in [`first-executions.md`](../first-executions.md) — pass or fail.

- **AC-1 — spike 12: the AppImage runs on a host that never had the legacy FUSE library** (was IC-3 item 1).
  Launch the built AppImage, unextracted, on an unmodified Ubuntu 24.04 installation that has **never** had
  `libfuse.so.2` installed — not one where it was removed. Shows whether ESC-11's decided option holds — the stable line
  with the static runtime pinned explicitly (ESC-11 option 2; "option (b)" in `platform-targets.mjs`); if it does
  not, ESC-11's fallback is option 1, the pre-release line. Counts as failing: the image
  not starting, or starting only once a FUSE 2 library is installed.
- **AC-2 — spike 17 for the Linux key: first paint within `REQ-STARTUP-155`'s bound** (was IC-3 item 2, Linux half).
  The main window painted within 5 seconds of launch on `REQ-STARTUP-024`'s baseline, measured as spike 17 measured
  the two Windows artifacts.
- **AC-3 — ADR-0056's load proof constructible on Linux** (was IC-3 item 3, Linux half, and "the store binding's
  acceptance" on Linux). Rule 1a finds a Linux binary newer than the rebuild marker, rule 4 loads the binding the
  packaged Electron's loader actually reaches, and **D10's counterfactual is refused**: a rebuild that exits 0 and
  compiles nothing fails the build, and so does a prebuild sitting in the loader's path. A rule that passes only when
  everything is already fine has not been shown (IC-6's own criterion, on this platform).
- **AC-4 — the instance claim on Linux** (was IC-3 item 4, Linux half). Launch the entry point twice on one user
  account and show the second launch is handed to the first (`REQ-STARTUP-164`) rather than opening a second
  instance against the same store.

**4. What this decision does not decide.**

- **Publication.** `PD-STARTUP-001` stands: `release.yml`'s matrix and `PUBLISHED_PLATFORMS` hold `windows-x64` alone,
  and nothing here adds a key. Its own text makes its withdrawal wait on "IC-3 and IC-8"; after the narrowing, IC-3
  no longer covers Linux, and IC-8 still requires a macOS host as well as a Linux one. Whether a Linux-only
  publication may proceed with the macOS halves of both open is the owner's, and is raised in R-087.
- **Confinement.** IC-8 is unchanged. Its Linux half held on 2026-09-29; a Linux artifact may not be described as
  having working confinement on the strength of that alone, because IC-8 is undischarged until macOS runs too.
- **macOS.** IC-3 binds it exactly as before.

**5. The wiring is owed, and is not done by this record.** `build-hooks.cjs` still refuses `linux` with an IC-3
message ([the defect note](../../defects/the-build-hooks-refuse-a-linux-artifact-in-the-name-of-ic-3.md)). Building
on Linux takes the first two of ADR-0054's three "wiring" changes, for the Linux key only: `package.mjs`'s platform
switch rendering the configuration through `preparedConfiguration`, and the hooks' rules 1a and 4 written for Linux
binaries and a Linux launch — written on the Linux host that can run them, which is AC-3. The third change, the
release matrix and `PUBLISHED_PLATFORMS`, is publication and waits on point 4.

## Consequences

1. `CLAUDE.md`'s bound, `docs/architecture/README.md`'s status line and every current-word statement that "no Linux
   artifact may be produced" are corrected in place in the change that records this decision, with their prior
   wording kept. History — the gate record, the fixed defect notes, first-execution reports — is not rewritten.
2. The power-loss test's Linux row (`implementation-conditions/decision-3-the-unstarted-spikes-and-first-executions.md`)
   is no longer "blocked while IC-3 stands"; it is owed, as Windows is.
3. `.github/workflows/ci.yml` says "no macOS or Linux job (IC-3)" and `release.yml` names IC-3 for the prepared
   matrix entries. Both comments are now partly stale. The workflows were not edited by the change that records this
   decision; correcting them is owed.
4. An obligation that moved can be forgotten in its new place. AC-1 to AC-4 are therefore indexed in
   [`implementation-conditions.md`](../implementation-conditions.md) beside IC-3, as owed, so a reader of the register
   still meets them.

## Revisit if

- AC-1 fails: ESC-11's option 1 (the pre-release line) is taken and the configuration changes before anything is
  published.
- The owner directs a Linux-only publication: `PD-STARTUP-001` is revised or withdrawn for `linux-x86_64`, and this
  ADR's point 4 is amended to say under what IC-8 standing.

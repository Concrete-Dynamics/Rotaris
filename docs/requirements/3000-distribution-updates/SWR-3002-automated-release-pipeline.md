---
req-id: SWR-3002
status: approved
trace: required
test: required
title: "Automated Release Pipeline"
epic: SWR-3000
date: 2026-08-11
---

# SWR-3002 — Automated Release Pipeline

Pushing a version tag must trigger an automated CI/CD pipeline that builds every
standalone binary on its native platform, creates a GitHub Release with all
artifacts, and publishes updated pip packages to PyPI for both `rotaris-core`
and `rotaris`. The pipeline must fail cleanly — a build failure on one platform
must not block successful artifacts from the others, and the Release must
clearly distinguish which platforms succeeded.

## Scope

- **In scope**: Tag-triggered GitHub Actions workflow. Matrix build across the
  platforms SWR-3001 can actually produce: Windows x64, macOS ARM64, Linux x64.
  GitHub Release creation with attached platform binaries and a generated
  checksum file. PyPI publish for `rotaris-core` and `rotaris`. Version number
  sourced from the tag and checked against both `pyproject.toml` files.
- **Out of scope**: Pre-release / release-candidate channels. Signed commits or
  SLSA provenance. Homebrew cask, Chocolatey, WinGet, or Snap publication. Code
  signing and notarization (inherited from SWR-3001: the artifacts trip
  SmartScreen and Gatekeeper on first launch).
- **Out of scope — Windows ARM64 and Intel macOS (deferred 2026-08-13).**
  Windows ARM64 has no buildable target at all while PySide6 ships no
  `win_arm64` wheel (SWR-3001). Intel macOS is dropped for a different reason: a
  universal2 build requires *every* native dependency to be installed as a
  universal2 wheel, and uv resolves host-matched wheels, so the pipeline builds
  natively on Apple Silicon instead. Both are revisited when a second runner or
  a native wheel makes them real rather than aspirational.

## Acceptance criteria

- **AC-001**: Pushing a tag matching `v*.*.*` triggers the full release
  workflow. Pushing any other tag or branch does not.
- **AC-002**: The workflow builds every standalone binary on a native runner for
  its platform — `windows-latest`, `macos-latest` (Apple Silicon) and a pinned
  `ubuntu-24.04`. The Linux runner is pinned rather than `-latest` so a runner
  upgrade cannot silently raise the glibc floor the AppImage carries.
- **AC-003**: If a platform build fails, the surviving artifacts are still
  published to the Release and the failure is noted in the Release body. The
  overall workflow status reflects the partial failure.
- **AC-004**: The GitHub Release body lists every artifact with its SHA256
  hash, the source tag, and the changelog (derived from commit history since
  the previous tag).
- **AC-005**: On success, `rotaris-core` and `rotaris` are published to PyPI
  with the version from the tag. A PyPI publish failure does not roll back the
  GitHub Release.
- **AC-006**: The version declared in the tag, `pyproject.toml` (root), and
  `apps/rotaris/pyproject.toml` must agree. A mismatch aborts the pipeline
  before any artifacts are built, and the failure names all three values.
  Rotaris therefore carries **one product version**: `rotaris` and `rotaris-core`
  are released together and bump together (the desktop package left its own
  `0.17.x` line on 2026-08-13). One number is what the CLI prints, what the
  desktop shows, what titles the Release, and what SWR-3003 compares against —
  two lines would make "am I up to date?" unanswerable.

## Test portfolio

| Level         | Productive scenario                                                                                                                | Exercised boundary                             | Planned/covering test                              |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------- |
| Unit          | A maintainer tags a version the packages do not carry and is told all three numbers; a user verifies a download against the published hash; a release with a failed platform still says which artifact is missing | Version guard, checksum manifest, release body   | `tests/unit/packaging/test_release_metadata.py`     |
| Integration   | A maintainer runs the documented guard command against the checkout and the workflow is wired to the platforms the code declares    | `python -m rotaris_core.packaging` → `release.yml` | `tests/integration/test_release_pipeline.py`        |
| User-flow E2E | N/A — the product boundary is a pushed tag, which cannot be exercised hermetically and cannot be undone                             | —                                               | —                                                   |

The release logic that can be wrong — version agreement, artifact naming,
checksums, changelog, partial-failure notes — lives in
`src/rotaris_core/packaging/release.py` rather than in `run:` blocks, precisely
so the unit row above can exist. Anything expressed only in YAML is untestable
until a tag is pushed.

Epic: [Distribution & Updates](../3000-distribution-updates.md)

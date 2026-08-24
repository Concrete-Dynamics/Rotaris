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

Pushing a supported product-version tag shall trigger an automated CI/CD
pipeline that builds every standalone binary on its native platform and creates
or updates the matching GitHub Release with all available artifacts and a
checksum manifest. Stable tags also publish `rotaris-core` and `rotaris` to
PyPI. Prerelease tags publish native GitHub artifacts, retain GitHub's
prerelease state, and leave the stable package channel unchanged.

## Scope

- **In scope**: Tag-triggered GitHub Actions workflow for stable versions and
  PEP 440 prereleases using `v<major>.<minor>.<patch>`,
  `v<major>.<minor>.<patch>a<number>`,
  `v<major>.<minor>.<patch>b<number>`, or
  `v<major>.<minor>.<patch>rc<number>`. Matrix builds across Windows x64,
  macOS ARM64, and Linux x64. GitHub Release creation or update with platform
  binaries, console archives, and `SHA256SUMS.txt`. Version agreement across
  the tag and both package manifests. Stable-release publication of both Python
  packages through PyPI trusted publishing.
- **Out of scope**: Signed commits, SLSA provenance, Homebrew, Chocolatey,
  WinGet, Snap, code signing, and notarization.
- **Deferred platforms**: Windows ARM64 remains deferred while PySide6 lacks a
  `win_arm64` wheel. Intel macOS remains deferred while the dependency set
  lacks a complete universal2 wheel path.

## Acceptance criteria

- **AC-001**: Pushing a supported stable or prerelease version tag triggers the
  full release workflow. Branch pushes and tags outside the supported grammar
  leave the release workflow idle.
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
- **AC-005**: Stable tags publish `rotaris-core` and `rotaris` to PyPI through
  trusted publishing. Prerelease tags retain GitHub prerelease status and
  publish their native artifacts through GitHub Releases.
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
| Unit          | A maintainer supplies a stable or prerelease tag and receives an agreed product version; malformed and mismatched versions receive actionable failures | Version-tag grammar, manifest agreement, checksum and release metadata | `tests/unit/packaging/test_release_metadata.py`     |
| Integration   | A maintainer's tag drives the native matrix, release upload, prerelease flag, and stable-only PyPI gate declared by the workflow | Packaging CLI → `.github/workflows/release.yml` | `tests/integration/test_release_pipeline.py`        |
| User-flow E2E | N/A — a pushed release tag creates durable external publication state and therefore has no hermetic reversible product boundary | — | — |

The release logic that can be wrong — version agreement, artifact naming,
checksums, changelog, partial-failure notes — lives in
`src/rotaris_core/packaging/release.py` rather than in `run:` blocks, precisely
so the unit row above can exist. Anything expressed only in YAML is untestable
until a tag is pushed.

Epic: [Distribution & Updates](../3000-distribution-updates.md)

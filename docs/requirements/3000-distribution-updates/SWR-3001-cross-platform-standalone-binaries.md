---
req-id: SWR-3001
status: approved
trace: required
test: required
title: "Cross-Platform Standalone Binaries"
epic: SWR-3000
date: 2026-08-11
---

# SWR-3001 — Cross-Platform Standalone Binaries

Rotaris must be distributable as platform-native standalone executables built
with PyInstaller, so that users can run the application without installing
Python or any dependencies. A standalone binary must deliver the same
user-observable behavior as the pip-installed equivalent.

## Scope

- **In scope**: Windows (x64) as portable `.exe` and NSIS-based installer; macOS
  (ARM64) as an `.app` bundle inside a DMG; Linux (x64) as AppImage. Entry
  points: `rotaris` (desktop), `rotaris-cli`, and
  `rotaris-headless`. PyInstaller spec files or equivalent build configuration
  that produce these artifacts deterministically from a tagged commit.
- **Out of scope**: Code signing or notarization. Windows Store / Mac App Store
  / Linux package manager distribution. Installer customization beyond defaults
  (start-menu shortcuts, file associations). Cross-compilation — each target is
  built on its native OS.
- **Out of scope — Windows ARM64 (deferred 2026-08-13).** The pinned PySide6
  6.8.3 publishes wheels for `macosx_12_0_universal2`, `manylinux_2_28_x86_64`,
  `manylinux_2_39_aarch64` and `win_amd64` only; there is no `win_arm64` wheel, so
  the desktop app cannot be frozen for that target without building Qt from
  source. Windows ARM64 users run the x64 build under emulation. Revisit when
  PySide6 ships a native wheel.
- **External prerequisites.** The bundle carries Python, its runtime
  dependencies, and the pinned Serena runtime defined by SWR-3724. `git` remains
  required for worktrees and checkpoints, `npx` launches the default Playwright
  MCP server, and `rg` backs textual search. User-configured `uvx` MCP servers
  use a user-supplied `uvx` executable. Missing external tools degrade their
  dependent features with the existing warnings while the application launches.

## Acceptance criteria

- **AC-001**: Running `rotaris` from the standalone binary on any supported
  platform launches the Rotaris desktop application with the same visible
  behavior as `uv run rotaris` from source.
- **AC-002**: Running `rotaris-cli` from the standalone binary accepts the same
  CLI arguments and produces the same output as the pip-installed entry point.
- **AC-003**: The Windows installer places the executable in a user-chosen
  directory, creates Start Menu shortcuts, and registers an uninstaller.
- **AC-004**: The Windows portable `.exe` runs without installation when
  double-clicked from any location. It is the one `onefile` artifact: a PySide6
  tree is several hundred megabytes and `onefile` re-extracts it on every launch,
  so the installer, DMG and AppImage all wrap fast `onedir` builds and only the
  portable executable pays that cold start. The delay is documented for the user.
- **AC-005**: The macOS `.app` bundle is self-contained and launches via
  double-click or `open` from the terminal. It is a **native ARM64** build
  (amended 2026-08-13): the original universal2 wording assumed every native
  dependency — PySide6, pydantic-core, xxhash, mistune — could be installed as a
  universal2 wheel, but uv resolves host-matched wheels, so `target_arch`
  `universal2` cannot be satisfied without hand-assembling the environment. Intel
  Macs are not covered; see SWR-3002 for where that decision is enforced.
- **AC-006**: The Linux AppImage is executable without extraction and runs on a
  stock Ubuntu 24.04 / equivalent glibc-based distribution.
- **AC-007**: The PyInstaller configuration is version-controlled alongside the
  source and can be built by a developer with a single command on each target
  OS.
- **AC-008**: The bundle contents are derived, not hand-listed. Every non-Python
  file inside the shipped packages, the data files of the dependencies that read
  their own package directory, the modules imported dynamically by string, and
  the distribution metadata both packages need to report their version are
  included by construction — so adding a prompt, a theme, or a provider module
  cannot silently drop it out of the binary.

## Test portfolio

| Level         | Productive scenario                                                                                                            | Exercised boundary                              | Planned/covering test                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Unit          | A maintainer adds a prompt file or a dynamically imported module and the bundle still carries it; each entry point resolves    | Bundle-content derivation (datas, hidden imports) | `tests/unit/packaging/test_pyinstaller_bundle.py`                                          |
| Integration   | A developer runs the documented build command and is told which artifact was produced, with the external build tool faked      | `python -m rotaris_core.packaging` → build runner  | `tests/integration/test_standalone_build.py`                                               |
| User-flow E2E | User launches the built standalone binary and it reports its real version and starts, exactly as the pip-installed entry point | Standalone binary → subprocess invocation         | `tests/integration/test_standalone_build.py::test_real_build_smoke` (opt-in: `ROTARIS_BUILD_STANDALONE=1`, run per platform in CI) |

The E2E row is opt-in rather than hermetic by nature: the product boundary *is*
the built artifact, and producing it takes minutes. The hermetic half of that
flow — the build command's own contract — is the integration row above it.

Epic: [Distribution & Updates](../3000-distribution-updates.md)

Extended by: [SWR-3724 — Standalone distributions carry the pinned Serena runtime](SWR-3724-bundled-serena-runtime.md)

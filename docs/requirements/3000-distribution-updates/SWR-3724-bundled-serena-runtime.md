---
req-id: SWR-3724
status: approved
trace: required
test: required
title: "Standalone distributions carry the pinned Serena runtime"
epic: SWR-3000
date: 2026-08-23
---

# SWR-3724 — Standalone distributions carry the pinned Serena runtime

Every Rotaris standalone distribution shall carry the exact `serena-agent`
release used by its default MCP configuration and launch that copy directly.
A fresh installation shall provide Serena semantic navigation without installing
`uv`, downloading Python packages, or warming an `uvx` cache.

## Required behaviour

- The exact Serena release is a direct, exact-version runtime dependency of
  `rotaris-core`; the installed distribution metadata is the authoritative pin.
- The default Serena MCP entry uses a Rotaris-owned launcher. In an installed
  Python environment it runs Serena from the active interpreter. In a frozen
  application it re-enters the current Rotaris executable through an internal
  Serena dispatch path that preserves MCP standard input and output.
- PyInstaller derives and includes Serena’s modules, package data, native
  dependencies, and distribution metadata in every desktop, CLI, and headless
  standalone build.
- Serena server launches and deterministic project setup use the same bundled
  copy. Per-run workspace binding and custom Serena overrides remain effective.
- First-run machine setup provisions Git, Node, and ripgrep and warms configured
  JavaScript MCP packages. Its manifest, progress copy, and default plan contain
  no `uv` tool or Serena package warm-up.
- User-configured `uvx` MCP entries remain supported through the existing MCP
  command resolver and use a user-supplied `uvx` executable.
- The native Windows, macOS, and Linux release jobs exercise the bundled Serena
  entry before publishing their artifacts.

## Acceptance criteria

- **AC-001**: The default Serena server resolves to the active interpreter and
  Rotaris Serena module in an installed environment, and to the current frozen
  executable plus its internal dispatch flag in a standalone build.
- **AC-002**: The exact installed `serena-agent` version matches the direct
  `rotaris-core` dependency pin and is available through one authoritative
  version value.
- **AC-003**: Bundle-content derivation includes Serena’s complete import/data
  surface and dependency metadata.
- **AC-004**: A resolved default server launch retains `start-mcp-server`,
  `--context ide`, `--transport stdio`, and the per-run `--project` path.
- **AC-005**: The default setup manifest and plan contain no `uv` installation
  and no Serena `uvx` warm-up; setup completion still makes default Serena
  available from the standalone artifact.
- **AC-006**: A custom `uvx` MCP entry still resolves and is available whenever
  the user supplies `uvx`.
- **AC-007**: A native standalone artifact can invoke the internal Serena entry
  and receive successful CLI output without network access.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | A maintainer changes packaging or setup and every artifact still carries the pinned Serena runtime while machine setup stays free of `uv` | Default MCP resolution, setup manifest/plan, PyInstaller bundle derivation | `tests/unit/test_config_defaults.py`, `tests/unit/test_mcp_resolution.py`, `tests/unit/setup/test_setup_plan.py`, `tests/unit/packaging/test_pyinstaller_bundle.py` |
| Integration | A native artifact launches the embedded Serena CLI and the resolved default server keeps its workspace binding | Frozen launcher/build output → Serena CLI; resolved MCP configuration | `tests/integration/test_native_artifact_smoke.py`, `tests/integration/test_serena_mcp_discovery.py` |
| User-flow E2E | A first-time desktop user completes machine setup without an `uv` or Serena-download step and reaches a Serena-capable application | Real setup window → setup coordinator/runner → application handoff | `apps/rotaris/tests/test_first_run_setup_flow.py` |

Depends on: [SWR-3001 — Cross-Platform Standalone Binaries](SWR-3001-cross-platform-standalone-binaries.md)

Related: [SWR-3715 — A bundled install provisions the machine once, before the app opens](SWR-3715-first-run-machine-setup.md)

Epic: [Distribution & Updates](../3000-distribution-updates.md)

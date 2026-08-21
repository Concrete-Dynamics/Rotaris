---
req-id: SWR-2503
status: approved
trace: required
test: required
title: "Permission mode presets & config layering"
epic: SWR-2500
priority: P0
date: 2026-08-03
source: docs/research/marktanalyse-agentic-harnesses-2026-08.md
---

# SWR-2503 — Permission mode presets & config layering

The policy engine (SWR-2501) MUST offer named mode presets that supply the
default decision when no explicit rule matches, and the active mode plus rules
MUST be configurable through the existing layered config
(`~/.config/rotaris/` < `<workspace>/.rotaris/`), overridable per persona.

- Minimum presets: `restricted` (default `deny` for mutating tools, `ask` for
  reads outside the workspace), `ask` (default `ask` for mutating tools,
  `allow` for read-only tools), `autonomous` (default `allow`; the destructive
  `deny` rules from SWR-2502 still apply). `autonomous` MUST NOT carry `ask`
  rules: unattended there is nobody to answer one (it would resolve fail-safe
  to deny), attended it would prompt the one mode chosen to avoid prompts, and
  either way it must never resolve a request more strictly than the `ask`
  preset (SWR-2509 ordering). The workspace path boundary stays enforced at
  the tool layer (`PathAuth`, `runtime.allow_outside_workspace`), which
  errors instead of prompting.
- Mode selection is visible at session start and recorded in the session
  snapshot; changing the mode mid-session takes effect on the next tool
  dispatch and is audit-logged (SWR-2506).
- Config merge follows the established field-wise overlay semantics; rule
  lists replace rather than deep-merge, consistent with existing config
  behavior.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Preset defaults per tool class; per-persona override; overlay semantics | Config schema + policy resolution | `tests/unit/test_permission_presets.py`, `tests/unit/test_permission_mode_wiring.py`, `tests/unit/test_config_loader.py::test_workspace_permission_mode_overrides_global`, `::test_persona_permission_mode_is_independent_of_runtime_default` |
| Unit | Mid-session mode change: live engines swap policy, later-built agents inherit it, persona pins survive | Session mode override + engine registry | `tests/unit/test_permission_mode_change.py`, `tests/unit/test_permission_mode_wiring.py::test_a_session_mode_override_beats_the_runtime_default`, `::test_a_persona_override_beats_a_session_mode_override` |
| Integration | Workspace config changes the effective decision for the same call | Config loader → policy engine | `tests/integration/test_permission_dispatch.py`, `tests/unit/test_session_manager.py::test_create_session_records_the_effective_permission_mode` |
| User-flow E2E | Switching the mode mid-run changes the outcome of the very next tool dispatch | Public product boundary → user-observable result | `tests/integration/test_permission_mode_midsession.py::test_switching_to_autonomous_mid_run_allows_the_next_dispatch` |
| User-flow E2E | Launching a session in `restricted` mode blocks a write that `autonomous` mode permits | Public product boundary → user-observable result | `tests/integration/test_permission_denial_e2e.py::test_restricted_mode_blocks_a_write_that_autonomous_mode_permits` |

Epic: [Secure Execution: Permissions & Sandbox](../2500-secure-execution.md)

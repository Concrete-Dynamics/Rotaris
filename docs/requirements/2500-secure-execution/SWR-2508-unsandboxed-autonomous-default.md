---
req-id: SWR-2508
status: approved
trace: required
test: required
title: "Ask-mode default for unsandboxed autonomous runs"
epic: SWR-2500
priority: P0
date: 2026-08-03
source: docs/research/marktanalyse-agentic-harnesses-2026-08.md
---

# SWR-2508 — Ask-mode default for unsandboxed autonomous runs

When a session runs an autonomous loop (Ralph Loop) **without** the container
sandbox (SWR-2507), the effective permission mode (SWR-2503) MUST default to
`ask` or stricter. Selecting `autonomous` mode without a sandbox requires an
explicit, per-workspace opt-in config field; the choice is shown at session
start and recorded in the session snapshot and audit log (SWR-2506).

The downgrade applies to **unattended** runs: a session whose approval host
(SWR-2504) can present a prompt has a human who can answer it and keeps the
mode it asked for. Sessions with no approval host, or with a host registered
for lifecycle reasons only (CLI `--background`, headless, and the TUI), are
unattended.

Rationale: an autonomous loop with unrestricted host-shell access is the
highest-risk configuration; it must never be the silent default.

The downgrade is correct and must stay, but it must not be *silent to the user
who is waiting on it*. An unattended run under `ask` reaches a host with no one
to answer, so every mutating call is denied and the run finishes having changed
nothing. A surface that launches such a run states the condition — and the
settings that resolve it — when the run starts, rather than leaving the evidence
in a log. It does not refuse: `ask` is the shipped default, so refusing would
refuse every workspace nobody has configured.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Effective-mode resolution: unsandboxed + autonomous-requested → ask unless opt-in present | Mode resolution logic | `tests/unit/test_permission_modes.py`, `tests/unit/test_permission_mode_wiring.py::test_autonomous_is_downgraded_when_no_one_can_approve`, `::test_workspace_opt_in_keeps_autonomous_on_an_unattended_run`, `tests/unit/test_config_loader.py::test_workspace_opt_in_for_unsandboxed_autonomy_overrides_global` |
| Integration | Session bootstrap applies the downgrade and records it | Run bootstrap → policy engine | `tests/integration/test_permission_mode_announcement.py` |
| User-flow E2E | Releasing a requirement in an unconfigured workspace still starts the run and states that its tool calls will be denied; a workspace that opted in is told nothing | Public product boundary → user-observable result | `apps/rotaris/tests/test_requirements_board_actions.py::test_a_release_in_a_default_workspace_says_the_run_will_be_denied_its_tools`, `::test_a_workspace_that_opted_in_to_unattended_work_is_told_nothing` |
| User-flow E2E | Starting an unsandboxed background run without opt-in yields ask-mode behavior on the first mutating command | Public product boundary → user-observable result | `tests/integration/test_permission_denial_e2e.py::test_unsandboxed_background_run_falls_back_to_ask_without_the_opt_in` |

Epic: [Secure Execution: Permissions & Sandbox](../2500-secure-execution.md)

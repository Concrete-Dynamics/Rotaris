---
req-id: SWR-1827
status: approved
trace: required
test: optional
type: technical
derived-from: SWR-1800
title: "CLI configuration-load error presentation"
epic: SWR-1800
date: 2026-07-20
---

# SWR-1827 — CLI configuration-load error presentation

When configuration fails to load or validate, the CLI (SWR-1800) MUST present
the failure as actionable, field-level text rather than a raw traceback, and
carry those messages as a dedicated error type so the entry points can decide
recovery/exit behavior (SWR-1817/SWR-1820) uniformly.

The helper provides:

- `CLIConfigLoadError` — a structured exception carrying a list of
  human-readable messages, raised in place of leaking a pydantic
  `ValidationError` to the terminal.
- `format_config_validation_errors` — turns a pydantic `ValidationError` into a
  list of field-anchored, human-readable messages.
- `wrap_config_validation_error` — adapts a raised validation error into the
  `CLIConfigLoadError` contract.

This is presentation substrate: it carries no product behavior of its own; the
CLI entry points build their error reporting and exit handling on it.

## Acceptance criteria

- A configuration `ValidationError` surfaced through the CLI is rendered as
  field-level messages, not a raw traceback.
- `CLIConfigLoadError` exposes the formatted messages for the entry point to
  report and to select an exit code.

Derived from: [SWR-1800 — CLI & Headless Mode](../1800-cli-headless.md)

Epic: [CLI & Headless Mode](../1800-cli-headless.md)

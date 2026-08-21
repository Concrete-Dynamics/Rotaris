---
req-id: SWR-1830
status: approved
trace: required
test: required
title: "Python SDK entry point over the same runtime"
epic: SWR-1800
priority: P1
date: 2026-08-03
source: docs/research/marktanalyse-agentic-harnesses-2026-08.md
---

# SWR-1830 — Python SDK entry point over the same runtime

A public Python API MUST allow embedding rotaris-cli runs programmatically,
using the same runtime as the CLI/TUI (no forked behavior).

- Minimum surface: start a run for a workspace+task+config, receive the
  events of SWR-1829 as an async iterator, await the final result (terminal
  status + report), and cancel a running session.
- The SDK path goes through the same run lifecycle and session persistence as
  the CLI; sessions started via SDK are resumable and inspectable like any
  other session. When this was written the run lifecycle was assumed to live in
  `ralph/bootstrap.py`; it does not. That module is a factory toolkit
  (agent/summary/improvement factories, model resolvers) with no run entry
  point, and the lifecycle itself lived inside the synchronous, typer-coupled
  `cli/background.py::run_background`. It was therefore extracted to
  `rotaris_core.run_host.execute_run`, which is host-neutral and is the single
  entry point the CLI and the SDK both call. Rotaris (desktop) drives the loop
  itself and composes the same pieces rather than calling `execute_run` — see
  `apps/rotaris/src/rotaris/services/run_bridge.py`.
- The API is exported from a dedicated public module with a documented
  stability contract; internal modules remain private.
- Headless approval policy (SWR-2504) applies; the SDK may register a
  callback to resolve `ask` decisions programmatically.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Run-request validation, cancellation semantics and result derivation, on the host-neutral entry point both hosts share | `rotaris_core.run_host` | `tests/unit/test_run_host.py` |
| Integration | An SDK run produces the same event sequence and session artifacts as a CLI run of the same task, and a headless approval callback resolves `ask` decisions | SDK → `run_host.execute_run` seam | `tests/integration/test_python_sdk.py` |
| User-flow E2E | A script consuming the SDK runs a hermetic task to completion and reads the final report | Public product boundary → user-observable result | `tests/integration/test_python_sdk.py` |

Epic: [CLI & Headless Mode](../1800-cli-headless.md)

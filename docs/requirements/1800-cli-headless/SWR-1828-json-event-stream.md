---
req-id: SWR-1828
status: approved
trace: required
test: required
title: "Structured JSON event stream for headless runs"
epic: SWR-1800
priority: P0
date: 2026-08-03
source: docs/research/marktanalyse-agentic-harnesses-2026-08.md
---

# SWR-1828 — Structured JSON event stream for headless runs

Headless runs (SWR-1800) MUST support a machine-readable output mode:
`--output-format stream-json` emits one JSON object per line (JSONL) on stdout
for every runtime event, and nothing else on stdout. The flag is available on
both entry points — `rotaris-cli run` and `rotaris-headless run`.

- Human-readable output remains the default; the flag switches the channel,
  it does not change runtime behavior. `--output-format text` prints what the
  CLI printed before the flag existed, and remains the default.
- Diagnostics/log noise goes to stderr or log files, never interleaved into
  the stdout stream — including the interrupt handler's own messages.
- The final event of a run is a `result` event carrying the terminal status,
  final report reference, and aggregate token/cost figures, and the process
  exit code reflects the run outcome. Both are read from one `RunResult`
  (`src/rotaris_core/run_result.py`), so they cannot disagree: `completed` → 0,
  `failed`/`error` → 1, `max_iterations` → 2, `interrupted` → 130.
- Every exit path owes the consumer a terminal `result` event — an argument
  error before the session exists, a crash inside the run, and a Ctrl-C all
  close the stream rather than truncating it, and none of them leaves an event
  sink registered for the next run in the same process.
- The stream is the programmatic contract that the SDK (SWR-1830, not yet
  built) will consume.

## Acceptance criteria

- Every non-empty stdout line of a `stream-json` run parses as JSON and
  round-trips through the published schema (SWR-1829).
- The first event is `session.start` and the last is `result`; there is exactly
  one `result`.
- The process exit code is derived from the status inside that `result` event.
- No human-readable progress text appears on stdout in `stream-json` mode, and
  no JSON appears on stdout in `text` mode.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Event serialization to exactly one line; per-line flush and lock guarding; exit-code derivation from the run outcome | Stream writer API, `RunResult` | `tests/unit/test_event_stream_writer.py`, `tests/unit/test_run_result.py` |
| Integration | A faked run emits parseable JSONL ending in a result event; the sink is discarded on every exit path; the observer publishes iteration and child events | Background CLI entry point, event bus | `tests/integration/test_event_emission.py`, `tests/unit/test_event_bus.py`, `tests/unit/test_event_observer.py` |
| User-flow E2E | `rotaris-headless run --output-format stream-json` on a hermetic task yields a parseable stream, keeps prose on stderr, and exits with the status the stream reported | Public product boundary → user-observable result | `tests/integration/test_headless_stream.py` (canonical flow: `test_a_headless_stream_json_run_is_consumable_end_to_end`) |

Epic: [CLI & Headless Mode](../1800-cli-headless.md)

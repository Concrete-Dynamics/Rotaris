---
req-id: SWR-1829
status: approved
trace: required
test: required
title: "Versioned event schema & coverage"
epic: SWR-1800
priority: P0
date: 2026-08-03
source: docs/research/marktanalyse-agentic-harnesses-2026-08.md
---

# SWR-1829 — Versioned event schema & coverage

The event stream (SWR-1828) MUST follow a versioned, documented schema.

- Every event carries: `schema_version`, `event` (type name), `timestamp`
  (ISO-8601 UTC), `session_id`, and type-specific payload. `event` is the
  discriminator, so a consumer reconstructs the exact model from one line
  without guessing.
- Minimum event coverage, all of it emitted: session started/ended, iteration
  started/ended, child spawned/state-transition/completed (with
  `ChildReportArtifact` payload), tool call started/finished (redacted
  arguments, outcome classification), permission decisions (SWR-2506), verifier
  results (SWR-2602/SWR-2604 gate decisions), token/cost updates, errors, and
  the terminal `result`.
- Payloads reuse the existing structured models (`ChildReportArtifact`,
  terminal outcomes, `TokenSnapshot`, `CostSnapshot`) rather than inventing
  parallel shapes, carried as already-serialized dicts so a consumer does not
  drag in the agent SDK to parse a line.
- **Secrets stay structurally redacted**: masking is the schema's job, enforced
  by validators on `tool.start.arguments` and `permission.decision.summary` that
  run on construction *and* on assignment, so a caller cannot leak a credential
  by building or mutating a model directly. One redactor serves both the stream
  and the approval dialog (SWR-2504).
- Schema changes bump `schema_version`; additions are backward-compatible
  within a major version, which the envelope's `extra="ignore"` makes real — a
  consumer pinned to version 1 still parses a stream produced by a later build.
- `EVENT_SCHEMA_VERSION` is deliberately independent of the on-disk
  `SESSION_SCHEMA_VERSION`: two contracts, two audiences, two cadences.

**Scope boundary.** This requirement governs the *wire* stream. The on-disk
diagnostics artifact `<session_dir>/evidence/tool-calls.jsonl` is a separate
surface written by `session/diagnostics.py`; it stores tool arguments verbatim
and is not covered here.

## Acceptance criteria

- Each of the covered event types validates against the published schema and
  round-trips through `parse_event`.
- A credential in a tool argument does not appear in any serialized event.
- An event carrying an unknown extra field still parses under version 1.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Schema validation per event type; version stamping; redaction on construction and on assignment; one-line serialization | Event model definitions | `tests/unit/test_event_schema.py` |
| Integration | A run touching delegation, tools, permissions and completion emits the covered event types with valid payloads | Event emission seams (diagnostics writers, Ralph loop, stream observer) | `tests/integration/test_event_emission.py`, `tests/unit/test_event_observer.py` |
| User-flow E2E | Covered by the SWR-1828 E2E flow — the stream parses against the published schema and carries no credential | Public product boundary → user-observable result | `tests/integration/test_headless_stream.py::test_a_headless_stream_json_run_is_consumable_end_to_end` (shared with SWR-1828) |

Epic: [CLI & Headless Mode](../1800-cli-headless.md)

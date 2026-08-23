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
- **What the run said**, not only what it did: the rows of the run's own
  transcript, each carrying the position it occupies. A stream that describes a
  run's mechanics and omits its conversation cannot be rendered as a run — which
  is what kept a session executing in another process off any bounded-cost view
  of it (SWR-2454). Emitted from below the host boundary, so every entry point
  produces it and none can replace it: a headless run, a CLI run, an SDK run and
  the desktop leave the same account of what was said.
- Those rows are **the run's own rows, carried verbatim**, not a shape invented
  for the wire. That is what makes a view built from the stream and a view built
  from the session record afterwards the same view. A row is published when it
  is created and again when it settles, so a consumer replaces at the position
  the row names rather than appending; intermediate mutations are deliberately
  not published, because a streamed row changes once per token.
- Row text is **bounded as well as redacted**. A field whose size follows the
  model's output is the one way a single event can make a session's history
  unreadable, since the store caps lines rather than bytes (SWR-2901). Text that
  exceeds the bound is clipped visibly, so a consumer can tell a clipped message
  from a short one. Redaction reaches every string in the row, at any depth: a
  rule that named the row's keys would leak the first time a row grew one.
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
- A credential in a tool argument does not appear in any serialized event, nor
  in message text an agent quoted it into.
- An event carrying an unknown extra field still parses under version 1.
- A run reports what its agents said, whatever host started it, and the rows a
  consumer places from the stream are the rows the session record holds.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Schema validation per event type; version stamping; redaction on construction and on assignment; message-text bounding; one-line serialization | Event model definitions | `tests/unit/test_event_schema.py` |
| Unit | Which conversation events become which rows, when a row settles, and that a broken consumer leaves the run's own record untouched | The transcript recorder | `tests/unit/session/test_transcript_recorder.py` |
| Integration | A run touching delegation, tools, permissions and completion emits the covered event types with valid payloads; a child conversation's messages reach the stream from below every host | Event emission seams (diagnostics writers, Ralph loop, stream observer, child conversation) | `tests/integration/test_event_emission.py`, `tests/unit/test_event_observer.py`, `tests/unit/test_scheduler.py` |
| User-flow E2E | Covered by the SWR-1828 E2E flow — the stream parses against the published schema and carries no credential | Public product boundary → user-observable result | `tests/integration/test_headless_stream.py::test_a_headless_stream_json_run_is_consumable_end_to_end` (shared with SWR-1828) |

Epic: [CLI & Headless Mode](../1800-cli-headless.md)

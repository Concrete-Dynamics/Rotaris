# ADR-021 — Deterministic child-result handoff

## Decision

Select a completed child’s handoff from an explicitly authored artifact, then
terminal assistant text, then its latest assistant response. Do not invoke a
terminal `SummaryAgent`, enter a `SUMMARIZING` lifecycle state, or persist an
automatic `child_report` artifact.

## Rationale

A second model call delays parent progress and can alter the child’s meaning.
Deterministic transcript extraction preserves the result actually produced by
the child. Non-artifact results are only needed while the active parent can
consume them; durable structured handoff remains the explicit `artifact_write`
contract.

## Alternatives considered

- Generate a model summary for every child: adds latency, can distort the
  result, and creates unintended durable artifacts.
- Persist every transcript-derived result: expands session storage without an
  explicit authoring decision.

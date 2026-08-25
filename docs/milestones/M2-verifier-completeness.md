---
milestone: M2
title: "Verifier Completeness"
status: planned
branch: milestone/m2-verifier-completeness
target-version: "0.122.0"
opened: 2026-08-25
epics: [SWR-2600]
requirements: []
excludes: []
---

# M2 — Verifier Completeness

Closes out the deterministic completion verifier: a bounded, non-duplicated
check suite, scope-drift reporting for changes that answer to no requirement,
and live visibility into a verification while it runs.

## Scope

[Epic SWR-2600](../requirements/2600-completion-verifier.md) is mostly shipped —
the three requirements still `draft` (SWR-2607, SWR-2608, SWR-2609) are what is
left. The whole epic is named rather than those three ids, because the milestone
is "epic 2600 is finished", and members that are already `approved` simply pass
the gate. Naming the epic also means a requirement added to it later joins this
milestone automatically instead of being silently missed.

## Exit criteria

- [ ] the mechanical gate: `uv run python devtools/milestone.py gate M2 --tests-passed`
- [ ] scope-drift reporting run once against a real feature branch, to confirm it
      is quiet enough to leave on

## History

- 2026-08-25 — Declared alongside M1 as the second milestone. Deliberately shaped
  as "finish an existing epic" to contrast with M1's "several sources, one
  theme", so both membership axes are exercised by real data.

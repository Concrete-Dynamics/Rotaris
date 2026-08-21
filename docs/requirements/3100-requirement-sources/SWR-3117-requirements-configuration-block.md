---
req-id: SWR-3117
status: approved
trace: required
test: required
title: "Requirements configuration block"
type: technical
derived-from: SWR-3102
epic: SWR-3100
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3117 — Requirements configuration block

Everything the requirement feature needs to be told — which sources exist, how
they map, which branch naming strategy execution uses, which evidence
obligations are mandatory, whether scheduling is automatic, how many units may
run at once — is configuration. Scattering it across six separate schema
additions would make `config/schema.py` a file every slice edits, and merges in
a 54 KB validated schema are exactly the kind of conflict this plan is arranged
to avoid.

Requirement: one `requirements:` block is added to `RotarisConfig`, complete for
the whole feature, at the point the source layer lands. It carries the source
declarations (SWR-3104), the evidence obligation defaults (SWR-3206), the
branch naming strategy (SWR-3405), the scheduling limits (SWR-3412) and the
board defaults (SWR-3309). Absent or partially specified, every field falls back
to a documented default, and a workspace that never configures anything gets the
built-in source and manual scheduling. Later slices read the block; none of them
extends it.

## Test coverage

Unit tests cover defaults for an absent block, field-wise overlay of a partial
workspace block over the user block (the precedence rule in AGENTS.md), and
rejection of an unknown source type. An integration test loads a real
`.rotaris/config.yaml` carrying the block. The originating product flow enabled
by `derived-from` is source configuration (SWR-3104).

Derived from: [SWR-3102 — Requirement source adapter interface](SWR-3102-requirement-source-adapter-interface.md)

Epic: [Requirement Sources and Canonical Model](../3100-requirement-sources.md)

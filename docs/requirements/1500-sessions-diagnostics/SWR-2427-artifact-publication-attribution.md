---
req-id: SWR-2427
status: approved
trace: required
test: required
type: technical
derived-from: SWR-1524
title: "Artifact publication attribution"
epic: SWR-1500
date: 2026-07-26
---

# SWR-2427 — Artifact publication attribution

`SWR-1524` says which personas may call `artifact_write`, but not how a
published artifact is attributed back to the agent that published it. Attribution
is what makes the artifact store auditable: `artifacts/<id>.json`,
`state/resume.json::produced_artifact_ids`, `timeline.jsonl` and
`evidence/tool-calls.jsonl` are only joinable if they agree on who published
what.

Two sibling children can share a persona, so persona alone cannot identify a
publisher. `SessionArtifactStore.publish` already records `canonical_name` and
`source_task_id` on the record, but emitted its `artifact_published` timeline
event with `actor=persona`, unlike `add_child_report`, which uses the canonical
name. The `ArtifactReadTool` / `ArtifactWriteTool` `create()` classmethods also
dropped the identity their executors accept.

## Acceptance criteria

- An `artifact_published` timeline event for an agent-published artifact carries
  the publishing agent's canonical name as `actor`, falling back to `created_by`
  and then the persona when no canonical name is known.
- The `artifact_published` event metadata carries the publishing agent's
  `task_id` so the timeline joins against `evidence/tool-calls.jsonl`.
- `ArtifactWriteTool.create` and `ArtifactReadTool.create` pass `persona`,
  `canonical_name`, `task_id` and `child_manager` from their kwargs through to
  the executor, so the abstract `ToolDefinition.create` contract cannot silently
  drop identity.
- An artifact published by an agent appears in that agent's
  `produced_artifact_ids` and in no sibling's.

Derived from: [SWR-1524 — `artifact_write` tool](../1500-sessions-diagnostics.md)

Epic: [Session Persistence & Diagnostics](../1500-sessions-diagnostics.md)

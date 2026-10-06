## A root named like an earlier child is presented as that child too

The surfaces know an agent by its name. A root's rows carry the persona its iteration was opened with, and the run-level
agent owns every named row carrying the entry persona or any root's name (`ownRow`; `SessionRecord.entryRoots`). A child's
instance tab owns every row carrying its canonical name. When the entry persona is changed between runs of one session to a
persona whose id an earlier child's canonical name already spells (a child the model named `planner` in the first run, and
`planner` the entry role of the next), the next root's rows carry that child's name. Its rows are then the earlier child's
in that child's instance tab and "This task" scope, and the child's rows are the run-level agent's. The artifact links mix
the same way (`artifactNames`), since the root's canonical name is the persona canonicalised.
The autopsy reader is misled the same way (added 2026-10-01, fin3 repair round 2): it knows a child by its canonical
name (`childModelKeys`), so such a root's tool calls print under the earlier child's `model_key`, and the ladder's
fallbacks of the root (`quota_fallback_model`, `llm_unresponsive`) are read as that child's and skipped by `entryModelKeys`.

**Repaired in part (2026-10-02, fin5, harness-readers): the autopsy reader's share.** The reader now attributes a record by
its name and its instant: a child keeps its `[spawned_at, completed_at]` window, and a tool call or a ladder entry of that
name outside every such window is the root's (`childModelKeys`, `childKeyAt`). So the case above — the child in one run,
the root of its name in the next — prints the root's calls under the root's own key and reads its fallbacks as the root's
([the-autopsy-reader-puts-two-children-sharing-a-canonical-name-under-one-model-key.md](the-autopsy-reader-puts-two-children-sharing-a-canonical-name-under-one-model-key.md),
pinned in `packages/engine/src/autopsy.test.ts`). Two cases are still not told apart:
- A root that is alive while a child of its name is alive.
- A child that never records a completion, because the run crashed or the child was paused and never resumed. Its window
  stays open, so a later root of its name has its calls and fallbacks attributed to that child **silently**. They are not
  printed as ambiguous, because only one window holds the instant.

The surfaces' share is unchanged, and the note stays open for both under OQ-158.

The ledger cannot prevent it. It names children and keeps every child off every root's names (OQ-158), but a root's name is
its persona, which no ledger chooses, and the child was named before the root existed.

Noticed 2026-10-01 while repairing
[`a-child-named-like-a-root-is-presented-as-the-run-level-agent-too.md`](a-child-named-like-a-root-is-presented-as-the-run-level-agent-too.md)
under R-067. Read from the code; not driven.

## Specs

REQ-MONITOR-071 (each instance tab shows only its own agent's rows), REQ-CHAT-069 ("This task" keeps the selected agent's
rows) and REQ-MONITOR-044 (an agent's produced and received artifacts) are not met for either agent in the collision.
OQ-158's second reading, rows that carry an identity the surfaces match instead of the name, is the repair that reaches it.

## Relevant files

- `packages/ui/src/agents.ts`: `ownRow`, `rowsOf`, `artifactNames`, `followedAgent`.
- `packages/engine/src/sessions.ts`: `entryRootsOf`, which names a root by its persona.
- `packages/engine/src/run/run.ts`: `Run.turn`, where a root's name and canonical name are its persona's.
- `packages/engine/src/autopsy.ts` and `apps/desktop/scripts/lib/autopsy-entry-model.mjs`: `childModelKeys`, `entryModelKeys`.

## Ruled as built — 2026-10-06 ([R-071](../../product/requests.md#r-071)); closed

The owner accepted the current renaming and left this edge, a root named like an earlier child, until after the first release (OQ-158, ruled in [`open-questions.md`](../../architecture/open-questions.md); [`PD-ORCH-010`](../../product/directives.md#pd-orch-010) narrows REQ-ORCH-044 and states the edge as accepted). The surfaces' share described above stays as it is for the first release, and the autopsy reader's two untold cases with it. Nothing is changed in the code.

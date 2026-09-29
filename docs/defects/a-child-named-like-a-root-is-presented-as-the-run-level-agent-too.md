## A child named like a root is presented as the run-level agent too

The surfaces know an agent by its name. A child's rows carry its canonical name. The run-level agent owns every named row
carrying the entry persona or any root's name, and every artifact whose producer or consumer is the entry persona, a
root's name or a root's canonical name (`ownRow`, `artifactNames`; `SessionRecord.entryRoots`). A child whose canonical
name is one of those names is therefore presented twice. Its rows are in its own instance tab and also in the run-level
agent's "This task" scope and persona window (`rowsOf`, `scopedRows`), and its artifacts are the run-level agent's links
as well as its own. Only `followedAgent` prefers the child, since it looks a row's name up among the children first.

The ledger keeps a direct child of the root off the current root's canonical name (`siblingNames.add(root.canonicalName)`
in `ChildLedger.spawn`). It does not keep a grandchild off that name. Nor does it keep a child off the name of an earlier
root that differs from the current one, as a root resumed as the entry role does (OQ-97): such a child is named after the
earlier root when its model-chosen task name canonicalises to it.

For the entry persona this was already so before the repair of
[`the-run-level-agent-is-known-by-its-entry-persona-alone.md`](fixed/the-run-level-agent-is-known-by-its-entry-persona-alone.md),
which widened it to every root's names. Preferring the child's own match is not a plain repair. When a grandchild takes
the entry persona's name, the root's own rows carry that name too, so a name-only rule gives one agent's rows to the
other either way. Only a row's `persona` column tells the two apart, and only when their personas differ. A repair needs
the rows to carry an identity the ledger keeps unique across the session, or the ledger to keep every child off every
root's names.

Found by the fifth review of that repair as a lesser finding, and confirmed by reading the code on 2026-09-29. Not driven.

## Specs

REQ-MONITOR-071 (each instance tab shows only its own agent's rows) and REQ-CHAT-069 ("This task" keeps the selected
agent's rows) are not met for the run-level agent in the collision. REQ-MONITOR-044 (an agent's produced and received
artifacts) is not met either. REQ-ORCH-044 makes a name unique only under its parent.

## Relevant files

- `packages/ui/src/agents.ts` — `ownRow`, `rowsOf`, `artifactNames`, `agentArtifacts`, `personaArtifacts`, and
  `followedAgent`, the one reading that prefers a child.
- `packages/ui/src/TranscriptSurface.tsx` — `scopedRows`.
- `packages/engine/src/children/ledger.ts` — `ChildLedger.spawn`'s sibling names, which hold the current root's canonical
  name for a root's child only.

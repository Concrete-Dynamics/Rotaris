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
[`the-run-level-agent-is-known-by-its-entry-persona-alone.md`](the-run-level-agent-is-known-by-its-entry-persona-alone.md),
which widened it to every root's names. Preferring the child's own match is not a plain repair. When a grandchild takes
the entry persona's name, the root's own rows carry that name too, so a name-only rule gives one agent's rows to the
other either way. Only a row's `persona` column tells the two apart, and only when their personas differ. A repair needs
the rows to carry an identity the ledger keeps unique across the session, or the ledger to keep every child off every
root's names.

Found by the fifth review of that repair as a lesser finding, and confirmed by reading the code on 2026-09-29. Not driven.

**The engine's figures share the collision (added 2026-10-01).** The writer's activity tracker is keyed by an agent's name
(`AgentActivity`, `packages/engine/src/children/activity.ts`), and the run-level agent's live figures are read from it under
the name the root dispatches as (`Run.rootName`): its called and active tools (`Run.entryTools`, `entryToolsOf`) and, since
the repair of A20, the calls its live root has not yet counted (`Run.entryUncountedToolCalls`, read into
`SessionRecord.entryToolCalls`). A grandchild whose canonical name equals the root's persona has its calls entered under
the same key, so while the root's execution runs they are counted in the run-level agent's live figure and its chips too.
The persisted half is not affected: it subtracts every child's own `children.tool_calls`. Found by the verification of the
A20 repair as a lesser finding, and confirmed by reading the code. Not driven. It was recorded on its branch while the ledger repair below was built on another, and the two met at the merge: that repair covers it, since `ChildLedger.spawn` now keeps every child off its root's persona, the name (`Run.rootName`) the tracker reads the run-level agent's live figures under, so no child's calls enter under that key.

**Outcome.** Repaired 2026-10-01 under R-067 (acceptance finding A23), by the note's second route: the ledger keeps every
child off every root's names. Confirmed first on the branch by two failing cases: a grandchild the model named
`orchestrator` under a root of that name was recorded `orchestrator`, and a grandchild named `Lead Planner` under a root
resumed with that canonical name was recorded `Lead-Planner`. `ChildLedger.spawn` now counts as taken, beside the parent's
children's names, its root's canonical name and the entry persona it runs as, and every recorded root's persona and
canonical name, at every depth (`recordedRootNames` in `packages/engine/src/children/naming.ts`, read from the sources
`entryRootsOf` reads). A colliding name is renamed `<name>_<n>` by REQ-ORCH-044's own rule. That renames a child no
sibling shares a name with, which REQ-ORCH-044 does not say. The reading is
[OQ-158](../../architecture/open-questions.md), raised and built, open. The surfaces' rules (`ownRow`, `artifactNames`,
`followedAgent`) are unchanged: no child the ledger names now carries a name they give the run-level agent.

Pinned by two cases in `packages/engine/src/children/children.test.ts` ("REQ-ORCH-044 … (OQ-158)"), both red before the
repair: one has a grandchild named after the current root, direct and deep children named after an earlier iteration's
root, and names no root carries left as the model gave them. The other has a resumed root's canonical name and its entry
persona. One assertion in `packages/engine/src/session-resume.test.ts` ("entryRootsOf …") holds `recordedRootNames` equal to
the names `entryRootsOf` gives a stored session, so a source added to one and not the other fails. No proof or live-run
scenario found this defect. None can show it, since it needs the model to give a child a root's name; the unit cases are the
evidence.

Two edges remain. A child named before the repair keeps its name. And a root named like an earlier child, after the entry
persona is changed to a persona an earlier child's name already spells, is recorded as its own defect:
[`a-root-named-like-an-earlier-child-is-presented-as-that-child-too.md`](../a-root-named-like-an-earlier-child-is-presented-as-that-child-too.md).

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
- `packages/engine/src/children/activity.ts` — `AgentActivity`, keyed by name; `packages/engine/src/run/run.ts` —
  `Run.entryTools` and `Run.entryUncountedToolCalls`, which read it under `rootName`.

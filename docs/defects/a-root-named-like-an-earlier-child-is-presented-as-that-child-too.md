## A root named like an earlier child is presented as that child too

The surfaces know an agent by its name. A root's rows carry the persona its iteration was opened with, and the run-level
agent owns every named row carrying the entry persona or any root's name (`ownRow`; `SessionRecord.entryRoots`). A child's
instance tab owns every row carrying its canonical name. When the entry persona is changed between runs of one session to a
persona whose id an earlier child's canonical name already spells (a child the model named `planner` in the first run, and
`planner` the entry role of the next), the next root's rows carry that child's name. Its rows are then the earlier child's
in that child's instance tab and "This task" scope, and the child's rows are the run-level agent's. The artifact links mix
the same way (`artifactNames`), since the root's canonical name is the persona canonicalised.

The ledger cannot prevent it. It names children and keeps every child off every root's names (OQ-158), but a root's name is
its persona, which no ledger chooses, and the child was named before the root existed.

Noticed 2026-10-01 while repairing
[`a-child-named-like-a-root-is-presented-as-the-run-level-agent-too.md`](fixed/a-child-named-like-a-root-is-presented-as-the-run-level-agent-too.md)
under R-067. Read from the code; not driven.

## Specs

REQ-MONITOR-071 (each instance tab shows only its own agent's rows), REQ-CHAT-069 ("This task" keeps the selected agent's
rows) and REQ-MONITOR-044 (an agent's produced and received artifacts) are not met for either agent in the collision.
OQ-158's second reading, rows that carry an identity the surfaces match instead of the name, is the repair that reaches it.

## Relevant files

- `packages/ui/src/agents.ts`: `ownRow`, `rowsOf`, `artifactNames`, `followedAgent`.
- `packages/engine/src/sessions.ts`: `entryRootsOf`, which names a root by its persona.
- `packages/engine/src/run/run.ts`: `Run.turn`, where a root's name and canonical name are its persona's.

## The Mission view's confirmation for a paused child omits that it cannot be undone

`PD-ORCH-005` clause 16's confirmation for one paused child reads differently on two surfaces. The Workspace (the agents
header and the inspector) and a persona window say "Cancellation cannot be undone: the agent will not resume, and its
paused descendants are cancelled with it:" above one line per paused descendant. The Mission view says "one (lead) will
be cancelled and will not resume. Cancelling cascades to 1 paused descendant." Both name the child, list one line per
paused descendant and dismiss with "Keep it paused"; only the Mission view's leaves out that the cancel is final.

Found 2026-09-28 by the built-app drive of the merged revision 4 build (R-064), comparing the two confirmations for the
same paused child with a paused descendant.

## Specs

None contradicted outright: REQ-MONITOR-128 fixes the naming and the lines, and both surfaces meet it. Clause 16 makes the
cancel "final as clause 3 says", and the surfaces state that finality differently for the same act.

## Relevant files

- `packages/ui/src/MissionView.tsx` — `missionConfirmation` and `missionCancelBody`.
- `packages/ui/src/agents.ts` — `cancelConfirmation`, the Workspace's and a persona window's wording.
- `packages/ui/src/cancel-paused.test.ts` — pins both wordings as they stand.

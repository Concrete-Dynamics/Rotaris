## The Mission view's confirmation for a paused child omits that it cannot be undone

`PD-ORCH-005` clause 16's confirmation for one paused child reads differently on two surfaces. The Workspace (the agents
header and the inspector) and a persona window say "Cancellation cannot be undone: the agent will not resume, and its
paused descendants are cancelled with it:" above one line per paused descendant. The Mission view says "one (lead) will
be cancelled and will not resume. Cancelling cascades to 1 paused descendant." Both name the child, list one line per
paused descendant and dismiss with "Keep it paused"; only the Mission view's leaves out that the cancel is final.

Found 2026-09-28 by the built-app drive of the merged revision 4 build (R-065), comparing the two confirmations for the
same paused child with a paused descendant.

## Specs

None contradicted outright: REQ-MONITOR-128 fixes the naming and the lines, and both surfaces meet it. Clause 16 makes the
cancel "final as clause 3 says", and the surfaces state that finality differently for the same act.

## Relevant files

- `packages/ui/src/MissionView.tsx` — `missionConfirmation` and `missionCancelBody`.
- `packages/ui/src/agents.ts` — `cancelConfirmation`, the Workspace's and a persona window's wording.
- `packages/ui/src/cancel-paused.test.ts` — pins both wordings as they stand.

## Repaired — 2026-09-29

Repaired 2026-09-29 under R-067. `missionCancelBody` states a paused child's cancel in the words the Workspace and a
persona window use. After the name and persona it reads `pausedCancelWith` ("Cancellation cannot be undone: the agent
will not resume, and its paused descendants are cancelled with it:") above the lines, or `PAUSED_CANCEL_ALONE` when
nothing cascades. So the Mission view reads, for example, "one (coding-agent) will be cancelled. Cancellation cannot be
undone: …". A live agent's body is unchanged. The title, the lines and "Keep it paused" were already
`cancelConfirmation`'s, so every surface now states clause 16's cancel as final, as clause 3 says.

The pins are in `packages/ui/src/cancel-paused.test.ts`:
- "the Mission view states a paused child's cancel final in the words the Workspace and a persona window use (clauses
  3 and 16)", which checks that the body ends with `cancelConfirmation`'s body, with the same lines, with and without a
  descendant;
- the two wordings as they now stand.

Both are red on the unrepaired view.

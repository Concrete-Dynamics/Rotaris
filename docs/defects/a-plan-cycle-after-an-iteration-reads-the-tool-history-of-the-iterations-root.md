## A plan cycle after an iteration reads the tool history of the iteration's root

With no run live, `entryToolsOf` reads the run-level agent's called tools from the tracker, under one of two names:

- the persona the latest iteration's root ran as, when any iteration is recorded;
- otherwise, every name that is no child's, since a plan cycle's root has no iteration row (REQ-ORCH-153).

The second case was added on 2026-09-29, in the repair of
[`fixed/the-run-level-agents-tool-history-is-empty-at-a-plan-gate-no-iteration-precedes.md`](fixed/the-run-level-agents-tool-history-is-empty-at-a-plan-gate-no-iteration-precedes.md).

A session can be held at a plan gate after it has run an iteration: PD-ORCH-003 lets the user re-arm `plan` on the
run-start chip. A plan cycle's root always runs as a fresh root under the run's persona. Suppose the entry persona
changed between that iteration and the plan cycle. The root then dispatched under a name no iteration row records. At
the gate, once the run has let go, the chips are marked from the earlier iteration root's calls, not from the plan
cycle root's. Where the persona is unchanged, the two names are the same, and the reading is right.

It needs all of the following:

- an iteration recorded;
- `plan` re-armed;
- the entry persona changed before the next prompt;
- a surface that reads the session after the cycle parked or ended.

Noticed 2026-09-29 while repairing that note, by reading `entryToolsOf`. It has not been driven. Not repaired: no row
records a plan cycle root's name or when it ran. The `plan_cycles` row names no root, and a cycle that ends before its
gate leaves no row (OQ-106).

## Specs

REQ-MONITOR-060 says each chip is marked "derived from live and historical tool-call records". The record holds the plan
cycle root's calls under its own name, and the chips read another root's. REQ-MONITOR-069's tools-and-artifacts card
shows the same resolved set the inspector shows.

## Relevant files

- `packages/engine/src/sessions.ts` — `entryToolsOf`, whose iteration branch names the latest iteration's
  `root_persona`.
- `packages/engine/src/session-writer.ts` — `openPlanGate`: the `plan_cycles` row names no root.
- `packages/engine/src/children/activity.ts` — the tracker, keyed by the name an agent dispatches under.

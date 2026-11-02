## A plan cycle after an iteration reads the tool history of the iteration's root

With no run live, `entryToolsOf` reads the run-level agent's called tools from the tracker, under one of two names:

- the persona the latest iteration's root ran as, when any iteration is recorded;
- otherwise, every name that is no child's, since a plan cycle's root has no iteration row (REQ-ORCH-153).

The second case was added on 2026-09-29, in the repair of
[`the-run-level-agents-tool-history-is-empty-at-a-plan-gate-no-iteration-precedes.md`](the-run-level-agents-tool-history-is-empty-at-a-plan-gate-no-iteration-precedes.md).

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

## Outcome — repaired 2026-10-01

**The blocker went first.** Store v30 (2026-09-30, acceptance A22) records every plan cycle's root in `plan_roots` when its
turn starts — its task id, canonical name, the persona it dispatches under and `opened_at` — so the name and the time this
note found missing are on record.

**Confirmed on the branch.** A session ran one iteration as `Builder`, `plan` was chosen and the entry persona switched to
`Reviewer` before the next prompt, and the plan cycle's root called `grep` and parked: the record read `called: ['glob']`,
the iteration root's call, in the process that parked it and in a fresh one.

**What changed** (`packages/engine/src/sessions.ts`, `entryToolsOf`): with no run live and an iteration recorded, the
history is read under the latest plan cycle root's persona when that root opened after the latest iteration, and under
the iteration root's otherwise; a tie goes to the iteration, since an approved plan's iteration opens after its cycle.

**Pinned by** `agent-links.test.ts` ("PD-ORCH-003 with REQ-ORCH-153: after an iteration the history is the tracker's under
whichever root ran last …") and `session-resume.test.ts` ("a plan cycle re-armed after an iteration, under a switched entry
persona …"), both failing before the repair; and in the built app by `plan-gate-proof`'s persona-switch step (`persona-switch-iteration`,
`persona-switch-plan`, `persona-switch-reopened`): an iteration as `orchestrator` in `auto` mode reads the README, the
configuration then chooses `plan` and `default_persona: reviewer`, the plan cycle root lists the files and parks, and the
reopened inspector marks `glob` used and not `read_file`. On the code before the repair the same launch failed with
`read_file:used` and `glob:not used`.

**Noticed while building it, not repaired:** the reopened inspector names that run-level agent `orchestrator` and draws
`orchestrator`'s declared tools, the first root's persona rather than the latest's —
[`after-an-entry-persona-switch-the-run-level-agent-is-drawn-as-the-first-roots-persona.md`](after-an-entry-persona-switch-the-run-level-agent-is-drawn-as-the-first-roots-persona.md) (repaired since).

## Specs

REQ-MONITOR-060 says each chip is marked "derived from live and historical tool-call records". The record holds the plan
cycle root's calls under its own name, and the chips read another root's. REQ-MONITOR-069's tools-and-artifacts card
shows the same resolved set the inspector shows.

## Relevant files

- `packages/engine/src/sessions.ts` — `entryToolsOf`, whose iteration branch names the latest iteration's
  `root_persona`.
- `packages/engine/src/session-writer.ts` — `openPlanGate`: the `plan_cycles` row names no root.
- `packages/engine/src/children/activity.ts` — the tracker, keyed by the name an agent dispatches under.

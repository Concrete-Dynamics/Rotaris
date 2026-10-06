## The `swarm` run override changes no instruction text

Choosing `swarm` as the delegation strategy (`rotaris.delegation_strategy`, offered by the Mission view's strategy
selector) reaches the run as `runOverride: 'swarm'` and changes nothing the run does or says. REQ-ORCH-025 gives the
`swarm` override one effect, instruction text demanding maximum parallel delegation, and the build renders no such text:
the entry role's instructions (`entryInstructionsFor`) read the grant and the persona, never the override; the playbook
resolution reads no override; and the only readers of `runOverride` are the intent gate (where `swarm` is, rightly, not an
input) and the `single` checks (`run-host/tools.ts`, `sessions.ts`'s `coordinating`). A `swarm` run is therefore the same
run as an `orchestrator` one.

Noticed 2026-10-06 (fin22, bundle `fin22-record-tidy`) while naming the `swarm` case in `PD-ORCH-006`'s reading, a
verifier finding of fin20. Not repaired: the bundle is wording only.

A repair has one interaction to settle: on the intents the mapping grants the direct-work bundle (`explicit_trivial`,
`single_file_change` with the built-in mapping), [`PD-ORCH-006`](../product/directives.md#pd-orch-006) tells the entry role
to do the work itself, and a `swarm` demand for maximum delegation beside that statement would put back the contradiction
the directive removed (finding G2 of the default live run at `27a5127`). Which of the two a granted `swarm` run is told is
not decided by REQ-ORCH-016, REQ-ORCH-025 or the directive; a repair raises it as an open question with the reading it
builds under.

## Specs

- REQ-ORCH-025: "A `swarm` override demands maximum parallel delegation (overlapping ownership of the same work slice
  remains forbidden); it changes instruction text only". No text changes, so the override demands nothing.
- REQ-ORCH-150: the run override is "available to every run alike"; it is offered and saved, and has no effect.

## Relevant files

- `packages/engine/src/children/personas.ts` — `entryInstructionsFor` and the orchestrator's built-in prompts; no override
  is read.
- `packages/engine/src/playbooks/resolve.ts` — the playbook rendered into each role's instructions; no override is read.
- `apps/desktop/src/run-host/configuration.ts` — `runOverride` derived from `rotaris.delegation_strategy`.
- `apps/desktop/src/run-host/intent.ts`, `packages/engine/src/intent/gate.ts` — the grant, to which `swarm` is not an input.
- `apps/desktop/src/run-host/tools.ts`, `packages/engine/src/sessions.ts` — the `single` checks, the override's only other
  readers.
- `packages/ui/src/MissionView.tsx` — the strategy selector that offers `swarm`.

## The `swarm` run override changes no instruction text

Choosing `swarm` as the delegation strategy (`rotaris.delegation_strategy`, offered by the Mission view's strategy
selector) reaches the run as `runOverride: 'swarm'` and changes nothing the run does or says. REQ-ORCH-025 gives the
`swarm` override one effect, instruction text demanding maximum parallel delegation, and the build renders no such text:
the entry role's instructions (`entryInstructionsFor`) read the grant and the persona, never the override; the playbook
resolution reads no override; and the only readers of `runOverride` are the intent gate (where `swarm` is, rightly, not an
input) and the `single` checks (`run-host/tools.ts`, `sessions.ts`'s `coordinating`). A `swarm` run is therefore the same
run as an `orchestrator` one. *(As noticed; since 2026-10-06 the build renders the text on every intent the mapping does not
grant the bundle — see **Repaired in part** below. The note stays open on the granted intents.)*

Noticed 2026-10-06 (fin22, bundle `fin22-record-tidy`) while naming the `swarm` case in `PD-ORCH-006`'s reading, a
verifier finding of fin20. Not repaired: the bundle is wording only.

A repair has one interaction to settle: on the intents the mapping grants the direct-work bundle (`explicit_trivial`,
`single_file_change` with the built-in mapping), [`PD-ORCH-006`](../product/directives.md#pd-orch-006) tells the entry role
to do the work itself, and a `swarm` demand for maximum delegation beside that statement would put back the contradiction
the directive removed (finding G2 of the default live run at `27a5127`). Which of the two a granted `swarm` run is told is
not decided by REQ-ORCH-016, REQ-ORCH-025 or the directive, and REQ-ORCH-025's "keeps its coordinating status and its
coordination-only tool set" meets REQ-ORCH-016's grant on those intents. It is raised as
[OQ-205](../architecture/open-questions.md) (2026-10-06, the repair round of the same bundle), open, with the reading the
build proceeds under: the bundle granted, the direct-work statement, and no `swarm` text. This note stays open on it: the
`swarm` text on the other intents can be built whichever way OQ-205 is ruled, and what it says on a granted intent waits on
the ruling.

**Repaired in part, 2026-10-06 (finacc3, acceptance finding F07): the `swarm` text on every intent the mapping does not grant
the bundle.** `withRunOverride` (`packages/engine/src/children/personas.ts`) adds `SWARM_INSTRUCTION` — maximum parallel
delegation, overlapping ownership of one todo item still forbidden — to the entry turn's instructions as their final layer,
after the playbook, when the run override is `swarm`, the grant is not the direct-work bundle, and the entry role declares
`delegate`; `Sessions` hands `RuntimePosture.runOverride` to the run as `RunDeps.runOverride`. `single` renders no text (a
capability change). Pinned by `run/preflight.test.ts` ("REQ-ORCH-025: a `swarm` run is told to delegate as widely as it
can…", red on the code before: the `swarm` run's instructions were the `orchestrator` run's, character for character) and four
cases in `children/personas.test.ts`; shown in the built app by two scripted launches of a `moderate_feature` run reading the
instructions the model port received (`ROTARIS_CAPTURE_MODEL_REQUESTS`): `delegation_strategy: orchestrator` and `swarm` differ
by that paragraph alone, after the playbook.

*Corrected in that bundle's repair round 1 (2026-10-06), the reason kept above:* "their final layer" was not true of the round-0
code, which appended the text in `Run` before the session's context units, so they and `runTurn`'s MCP section followed it, and
the text never said it took precedence over the matrix cell, so it sat under a cell's "finish and verify one before starting
the next" with nothing saying which wins — both REQ-ORCH-025 clauses, found by the bundle's verifier. Now
`runOverrideLayer` (`children/personas.ts`) builds the layer and `runTurn` appends it after the MCP section
(`withRunOverrideLayer`, `TurnDeps.runOverrideLayer`), under its own heading `## Run override: swarm` (the word in code
formatting), saying it takes precedence over the playbook's CHUNKING and BUDGET guidance where they differ, within the child
limits the run enforces; while the plan gate holds the run it is pointed at the plan (`SWARM_PLAN_HELD_NOTE`, REQ-ORCH-153).
Pinned by four `run/preflight.test.ts` cases — the text last, after the playbook, a context unit and an MCP section (red with
the layer composed before the MCP section); after a real `milestones` cell (`moderate_feature`) and a real `tight` cell
(`question`), saying it overrides them; and a continuation of a `swarm` run carrying it where an `orchestrator` continuation
does not (red with `Sessions`' continuation construction passing no `runOverride`); and a plan-mode `swarm` run's held turn
ending with the plan-gate note — and six cases in
`children/personas.test.ts`. Shown again in the built app (two scripted `moderate_feature` launches, the model port's captured
instructions): the `swarm` run's differ from the `orchestrator` run's by the layer alone, after `## MCP servers` and ending the
prompt. **Still open** on the other half: what a `swarm` run on a granted intent is told
waits on OQ-205, and until it is ruled such a run is told PD-ORCH-006's statement with no `swarm` text beside it.

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

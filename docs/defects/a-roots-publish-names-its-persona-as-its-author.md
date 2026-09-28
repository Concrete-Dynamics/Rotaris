## A root's publish names its persona as its author

The root's tool port is built with the persona as the acting agent's name: `run.ts`'s `turn()` calls
`this.portFor(config.persona, config.persona, …)`, and `Sessions`' `toolsFor` binds the artifact operations to that
name (`artifactOps(artifacts, { canonicalName: agentName, … })`). A root's `artifact_write` therefore records
`created_by` as the persona id rather than the root's canonical instance name (`rootCanonical`,
`canonicaliseName(config.persona)`, or the `root_canonical_name` a resumed root is restored under). The two coincide for
an ordinary persona id and differ for one with spaces or other characters the canonicaliser rewrites. Every
iteration's root also shares the one value, so `created_by` cannot tell one iteration's root from another's.
`PD-ORCH-005` clause 20's root-first artifact (`latestArtifactText`) keys on `conversation_id` for that reason. Noticed
2026-09-28 by the scout of `PD-ORCH-005` revision 4 item G and confirmed while building it; not repaired.

## Specs

`REQ-LIBRARY-093`: "`created_by` MUST name the publishing agent instance by its canonical name rather than by its
persona, so two instances sharing a persona stay distinguishable in every artifact listing." The root's publishes name
the persona.

## Relevant files

- `packages/engine/src/run/run.ts` — `turn()`, `this.portFor(config.persona, config.persona, children, this.rootId, 0)`
  and `runTurn`'s `agentName: config.persona`.
- `packages/engine/src/sessions.ts` — the two `toolsFor` bindings,
  `artifactOps(artifacts, { canonicalName: agentName, persona, conversationId: parentId })`.
- `packages/engine/src/artifacts/port.ts` — `ActingAgent.canonicalName`, documented as "never the persona".

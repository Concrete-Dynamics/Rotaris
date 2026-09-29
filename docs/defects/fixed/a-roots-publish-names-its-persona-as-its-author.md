## A root's publish names its persona as its author

The root's tool port is built with the persona as the acting agent's name: `run.ts`'s `turn()` calls
`this.portFor(config.persona, config.persona, …)`, and `Sessions`' `toolsFor` binds the artifact operations to that
name (`artifactOps(artifacts, { canonicalName: agentName, … })`). A root's `artifact_write` therefore records
`created_by` as the persona id rather than the root's canonical instance name (`rootCanonical`,
`canonicaliseName(config.persona)`, or the `root_canonical_name` a resumed root is restored under). The two coincide for
an ordinary persona id and differ for one with spaces or other characters the canonicaliser rewrites. Every
iteration's root also shares the one value, so `created_by` cannot tell one iteration's root from another's.
`PD-ORCH-005` clause 20's root-first artifact (`latestArtifactText`) keys on `conversation_id` for that reason. Noticed
2026-09-28 while scouting `PD-ORCH-005` revision 4's clause 20 and confirmed while building it; not repaired.

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

## Repaired — 2026-09-29

Repaired 2026-09-29 under [R-067](../../product/requests.md#r-067). The tool-port factory takes the instance's canonical
name apart from its agent name: `RunDeps.toolsFor` and `Run.portFor` gain an optional `canonicalName`, `Run.turn`
passes the root's (`rootCanonical`: `canonicaliseName(config.persona)` for a fresh root, the `root_canonical_name` a
resumed root is restored under), and both of `Sessions`' `toolsFor` bindings give it to `artifactOps` as the acting
agent's `canonicalName`, falling back to the agent name, which for a child is already its canonical name. A root's
`artifact_write` therefore records `created_by` as its canonical name, and an `artifact_read` marks it consumed under the
same name. The root's rows keep its persona as their name, which `answerOpenCalls` matches on.

Evidence: `packages/engine/src/session-resume.test.ts`, "REQ-LIBRARY-093: a root's publish names the root instance by its
canonical name …": a run whose persona id is `Lead Planner` publishes from its first iteration's root (the start's
binding) and from a continue's (`launchContinuation`'s binding); both records carry `created_by` `Lead-Planner`, the
canonical name each iteration records, and `source_persona` `Lead Planner`. On the code before the repair both carried
`Lead Planner`. `apps/desktop/scripts/artifacts-proof.mjs`'s publish launch now compares `created_by` with the
iteration's `root_canonical_name` and the record's conversation with its root task id, where it compared the tool
call's recorded name, which for a root is its persona. OQ-106's bullet naming this note is reported back in place.
`created_by` still cannot tell one iteration's root from another's: each records the one canonical name its persona
gives, and OQ-106's reading keys on `conversation_id` for that reason.

What this meant for the agent surfaces, found while repairing the fourth review's finding on the resumed root's rows: the
artifact links live-run finding K1 added match the run-level agent by its entry persona. For a persona the canonicaliser
rewrites, its root's publishes and reads, now recorded under the canonical name, were no longer its links
(REQ-MONITOR-044, REQ-MONITOR-052, REQ-MONITOR-068, REQ-MONITOR-069). Repaired by
[`the-run-level-agent-is-known-by-its-entry-persona-alone.md`](the-run-level-agent-is-known-by-its-entry-persona-alone.md):
the session names each root's canonical name (`SessionRecord.entryRoots`), and the run-level agent's links match it. The
case above now also reads the session's snapshot, which names `Lead Planner` with `Lead-Planner` and both publishes'
producer `Lead-Planner`.

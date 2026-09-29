## The run-level agent is known by its entry persona alone

The surfaces present the entry role as one run-level agent, and they find what belongs to it by the entry persona alone:
its rows by the rows' name (`rowsOf`, `scopedRows`, `followedAgent`), its artifact links by an artifact's producer and
consumers (`agentArtifacts`, `personaArtifacts`), and, in the run, its called and active tools by the tracker's key
(`Run.entryTools`, which reads the run's `config.persona`). Two repairs gave a root names that are not the entry persona.
A root resumed as the entry role, because its own persona is no longer configured (OQ-97), writes its rows and dispatches
its calls under the persona its iteration was opened with (`rootName`, `iterations.root_persona`). A root's publishes and
reads record its canonical instance name (`rootCanonical`, REQ-LIBRARY-093), which differs from a persona id the
canonicaliser rewrites (`Lead Planner` becomes `Lead-Planner`).

A surface takes the entry persona from the persona column of the transcript's first row that no child wrote
(`entryOf`). Whenever that is not the name a root's rows carry, those rows are not the run-level agent's. A root opened
as `orchestrator` and resumed as the entry role `coding-agent` writes rows named `orchestrator` with the persona
`coding-agent`. When the first resident row is one of those, the run-level agent is `coding-agent`, and every row any
root wrote falls outside it: its "This task" scope and its persona window's transcript are empty, while the inspector
still follows the resumed root's rows to it by their persona column. Before the first repair it was the other way round: with the
rows written before the rest resident, the run-level agent was `orchestrator`, and the resumed root's rows, then named
`coding-agent`, were the ones dropped. Since the repair, its tool chips also mark none of the resumed root's calls: the
tracker keys them by the name the root dispatches under, `orchestrator`, and `Run.entryTools` reads them under
`coding-agent`. And a root of a persona the canonicaliser rewrites has no produced or received artifact links.

Found by the fourth review of the repair of
`a-root-resumed-under-a-fallback-persona-hides-its-rows-from-the-crash-record.md` (the rows, 2026-09-29). The tools and
the links were found while confirming it; the links follow from the repair of
`a-roots-publish-names-its-persona-as-its-author.md` meeting the artifact links live-run finding K1 added.

## Specs

`REQ-CHAT-069` ("This task" keeps the selected agent's rows) and `REQ-MONITOR-071` (each instance tab shows only its own
agent's rows), which drop the resumed root's rows; `REQ-MONITOR-053` (the inspector follows the agent that authored the
latest row), which follows those rows to an agent whose scope then holds none of them; `REQ-MONITOR-060` and
`REQ-MONITOR-061` (the run-level agent's called and active tools); and `REQ-MONITOR-044`, `REQ-MONITOR-052`,
`REQ-MONITOR-068` and `REQ-MONITOR-069` (an agent's produced and received artifacts). `PD-ORCH-005` clause 4 (the root is
restored with its identity) and `REQ-LIBRARY-093` (`created_by` is the instance's canonical name) are why the root carries
those names.

## Relevant files

- `packages/engine/src/run/run.ts` — `rootName`, the name a root's rows and calls carry; `entryTools`, read under the run's persona.
- `packages/engine/src/sessions.ts` — the session snapshot, which names no root, so a surface cannot know those names.
- `packages/ui/src/agents.ts` — `rowsOf`, `followedAgent`, `agentArtifacts` and `personaArtifacts`, each matching the
  run-level agent by the entry persona.
- `packages/ui/src/TranscriptSurface.tsx` — `scopedRows`, REQ-CHAT-069's one implementation, matching it the same way.

## Repaired — 2026-09-29

Repaired 2026-09-29 under [R-067](../../product/requests.md#r-067). The session now names the entry role's roots, so a
surface no longer has to guess them from the entry persona. `SessionRecord.entryRoots` lists each root once by two names:
the name its rows and calls carry and its canonical instance name. First come every iteration's roots (`root_persona`,
`root_canonical_name`). Then come the roots no iteration row records that published, which are plan cycles' roots
(REQ-ORCH-153). Each is named by its publish's persona and `created_by` (`StoreDal.rootPublishersOf`), since a root
publishes under its own task id as the conversation (OQ-106): a publish whose conversation is no child's and no
iteration root's task id is such a root's. Last comes the live run's current root (`entryRootsOf` in
`packages/engine/src/sessions.ts`, `Run.currentRoot`).
*As first repaired, this note said the list covered "every iteration's root, then the live run's current root, which for
a plan cycle has no iteration row". That was the whole of how a plan cycle's root was named. The fifth review found it
false once the run is gone. The session lets go of the run as soon as `start()` settles, and a park at the plan gate
settles it. So a session at the gate named no root, both in the same process and reopened in a fresh one. The plan cycle
root's publish, recorded under its canonical name since the repair of
[`a-roots-publish-names-its-persona-as-its-author.md`](a-roots-publish-names-its-persona-as-its-author.md), was then no
agent's while the user reviewed the plan. On `main` it had carried the persona the surfaces know the run-level agent by.*
A plan cycle's root that published nothing is still named only while its run is live. For a persona the canonicaliser
rewrites, an artifact such a root only read is then not the run-level agent's received link. That residual is open in
[`a-plan-cycles-root-that-publishes-nothing-is-named-only-while-its-run-is-live.md`](../a-plan-cycles-root-that-publishes-nothing-is-named-only-while-its-run-is-live.md).

The run-level agent owns a named row when the row carries the entry persona or any root's name, and never by a named row's
persona column, which a child of the entry persona shares (`ownRow` in `packages/ui/src/agents.ts`). That rule serves
`rowsOf` (the persona window), `scopedRows` ("This task") and `followedAgent` (the inspector), and each of their callers
passes the session's roots. The run-level agent's artifact links match an artifact's producer and consumers against the
entry persona and each root's two names (`agentArtifacts`, `personaArtifacts`). `Run.entryTools` reads the tracker under
`rootName`, the name the root dispatches under, as `entryContext` already did. A child is still known by its own name
alone.

Evidence, each case red on the code before the repair and green with it:

- `packages/ui/src/agents.test.ts`, "PD-ORCH-005 clause 4 with OQ-97 …": with `coding-agent` as the run-level agent and a
  root opened as `orchestrator`, the root's rows before the rest and after it are the run-level agent's, a child of
  `coding-agent` keeps its own, and the root's row is followed to the run-level agent.
- `packages/ui/src/rows.test.ts`, "REQ-CHAT-069 with PD-ORCH-005 clause 4 (OQ-97) …": "This task" keeps those rows and no
  row of the child.
- `packages/ui/src/inspector-links.test.ts`, two cases rendered through the inspector and the persona window: the
  run-level agent of `Lead Planner` links the artifact its root published as `Lead-Planner` and the report it read, and
  a fallback run-level agent's window shows the root's two rows while the inspector follows its row to it. Both fail
  with only the call sites' new argument removed, which pins each caller's wiring.
- `packages/engine/src/run/crash.test.ts`, "clause 4 with OQ-97 (REQ-MONITOR-060/061/071) …": a crash-left session
  continued with `coding-agent` in place of `orchestrator`; while the resumed root's second call is held, the session
  names `orchestrator` among its roots, and the run-level agent's called tools are the two calls it made, the held one
  active. The first half failed with no `entryRoots`. With only the snapshot repaired, the tools read `[]`, which is the
  second half's own failure.
- `packages/engine/src/session-resume.test.ts`, the REQ-LIBRARY-093 case: the session names `Lead Planner` with its
  canonical name `Lead-Planner`, the producer both of its roots' publishes carry.
- `packages/engine/src/session-resume.test.ts`, "REQ-LIBRARY-093 with REQ-MONITOR-044 and OQ-106: a plan cycle's root is
  named by its publishes …" (the fifth review's finding), two cases:
  - A `plan` mode run of `Lead Planner` whose root publishes, then parks. The snapshot after the park, `entryRootsOf` from
    the store alone and the session reopened in a fresh process each name `Lead Planner` with `Lead-Planner`, the
    producer of its publish.
  - A plan cycle stopped after its publish, before its gate opened, which records no plan cycle and no iteration: the
    store alone still names that root.

  Both read `[]` on the first repair. The parked case already failed at the same process's snapshot after the park.
- `packages/engine/src/session-resume.test.ts`, "entryRootsOf …": a store-only case that fails on the first repair.
  - An iteration root resumed as the entry role is named once, by its row, and never by its publish's persona.
  - A child's publish and its report name no root.
  - A plan cycle root's superseded publish still names it, and a publish with no conversation names none.
  - A live run's current root comes last.
- `packages/store/src/store.test.ts`: `rootPublishersOf`, read at every snapshot, goes through `artifacts_by_created`
  and the primary keys of `children` and `iterations`, with no scan and no sort.

Not pinned by a unit test: the Workspace's call of `scopedRows`, whose scope is the component's own state and cannot be
reached without a DOM. A static render cannot choose "This task", so that one-line call site stands on the typecheck and
on reading.

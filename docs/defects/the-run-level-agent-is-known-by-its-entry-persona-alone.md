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

## A plan cycle's root that publishes nothing is named only while its run is live

A plan cycle's root has no iteration row (REQ-ORCH-153: a plan cycle is not an iteration), so the session learns its names
from two places only: its run while that run is live (`Run.currentRoot`), and its publishes afterwards (`entryRootsOf`
reads `StoreDal.rootPublishersOf`: a publish whose conversation is no child's and no iteration root's task id). The session
lets go of the run as soon as `start()` settles, which a park at the plan gate does as much as an end. So a plan cycle's
root that published nothing is in `SessionRecord.entryRoots` only while its cycle runs. At the gate, and in every later
snapshot, the session names no such root.

What that loses is the artifacts it read. A read marks the reader a consumer under its canonical instance name
(`markConsumed`, REQ-LIBRARY-099 as the artifact store reads it, the name REQ-LIBRARY-093 gives a publish). The surfaces
match the run-level agent's received links against the entry persona and each named root's two names. So an artifact
the root read is not the run-level agent's received link whenever the root's persona id is one the canonicaliser rewrites
(`Lead Planner` reads as `Lead-Planner`). Before the repair of
[`a-roots-publish-names-its-persona-as-its-author.md`](fixed/a-roots-publish-names-its-persona-as-its-author.md), a
root's read recorded its persona, which the surfaces know the run-level agent by. So this is a narrowing that repair
left, which the repair of
[`the-run-level-agent-is-known-by-its-entry-persona-alone.md`](fixed/the-run-level-agent-is-known-by-its-entry-persona-alone.md)
closed only for a root that also published.

It needs all of the following:

- plan mode;
- a persona id the canonicaliser rewrites (every built-in id is its own canonical name);
- a plan cycle's root that read an artifact of the session and published none;
- no iteration root of the session with the same canonical name;
- a surface that reads the session after the cycle parked or ended.

Its rows are unaffected, since they carry the persona the surfaces know the run-level agent by.

Established on 2026-09-29, while repairing the fifth review's finding on that note, with a throwaway case that was not
kept. A plan cycle's root of `Lead Planner` read an artifact and parked; the artifact's `consumed_by` read
`["Lead-Planner"]` and `entryRootsOf` read `[]`.

## Specs

REQ-MONITOR-044 (an agent carries its "produced and received artifact ids"), REQ-MONITOR-052 and REQ-MONITOR-069
(artifact links in the inspector and the instance tab) and REQ-MONITOR-068 (the persona-wide artifacts card): the received
link is missing. REQ-LIBRARY-093 and REQ-LIBRARY-099 are why the read carries the canonical name.

## Relevant files

- `packages/engine/src/sessions.ts` — `entryRootsOf`, which names a root with no iteration row by its run while it is
  live, then by its publishes alone; `Sessions.start` and `launchContinuation`, whose `start().finally` lets go of the run.
- `packages/engine/src/run/run.ts` — `Run.currentRoot`; `parkAtPlanGate`, which records the plan cycle and not its root.
- `packages/engine/src/session-writer.ts` — `openPlanGate`: the `plan_cycles` row names no root, and a cycle that never
  parks leaves no row (OQ-106, "A plan cycle that ended before its gate leaves no mark").
- `packages/engine/src/artifacts/port.ts` — `artifactOps`' `read`, which marks the consumer by its canonical name.
- `packages/ui/src/agents.ts` — `agentArtifacts` and `personaArtifacts`, which match the run-level agent's links.

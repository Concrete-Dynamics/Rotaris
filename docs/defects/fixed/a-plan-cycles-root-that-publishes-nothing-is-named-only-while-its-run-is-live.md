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
[`a-roots-publish-names-its-persona-as-its-author.md`](a-roots-publish-names-its-persona-as-its-author.md), a
root's read recorded its persona, which the surfaces know the run-level agent by. So this is a narrowing that repair
left, which the repair of
[`the-run-level-agent-is-known-by-its-entry-persona-alone.md`](the-run-level-agent-is-known-by-its-entry-persona-alone.md)
closed only for a root that also published.

It needs all of the following:

- plan mode;
- a persona id the canonicaliser rewrites (every built-in id is its own canonical name);
- a plan cycle's root that read an artifact of the session and published none;
- no other root of the session with the same canonical name that the session names: an iteration's, or a plan
  cycle's that published;
- a surface that reads the session after the cycle parked or ended.

Its rows are unaffected where its persona is the entry persona a surface knows the run-level agent by: a plan cycle's root
is always a fresh root, named by its persona.

Established on 2026-09-29, while repairing the fifth review's finding on that note, with a throwaway case that was not
kept. A plan cycle's root of `Lead Planner` read an artifact and parked; the artifact's `consumed_by` read
`["Lead-Planner"]` and `entryRootsOf` read `[]`.

## Specs

REQ-MONITOR-044 (an agent carries its "produced and received artifact ids"), REQ-MONITOR-052 and REQ-MONITOR-069
(artifact links in the inspector and the instance tab): the received link is missing. REQ-LIBRARY-093 and REQ-LIBRARY-099
are why the read carries the canonical name. REQ-MONITOR-068's persona-wide card lists what an instance produced, so it
is not affected.

## Relevant files

- `packages/engine/src/sessions.ts` — `entryRootsOf`, which names a root with no iteration row by its run while it is
  live, then by its publishes alone; `Sessions.start` and `launchContinuation`, whose `start().finally` lets go of the run.
- `packages/engine/src/run/run.ts` — `Run.currentRoot`; `parkAtPlanGate`, which records the plan cycle and not its root.
- `packages/engine/src/session-writer.ts` — `openPlanGate`: the `plan_cycles` row names no root, and a cycle that never
  parks leaves no row (OQ-106, "A plan cycle that ended before its gate leaves no mark").
- `packages/engine/src/artifacts/port.ts` — `artifactOps`' `read`, which marks the consumer by its canonical name.
- `packages/ui/src/agents.ts` — `agentArtifacts` and `personaArtifacts`, which match the run-level agent's links.

## Outcome — repaired 2026-10-01 under R-067

Acceptance finding A22. Confirmed on `fix-accept1-20` (from `origin/main` 71ad8e8) before any change: a plan cycle's root of
`Lead Planner` that read an artifact of the session and published nothing parked at the gate with the artifact's
`consumed_by` reading `["Lead-Planner"]` and the session's `entryRoots` reading `[]` — in the process that parked it and
after a stop before its gate alike (two driven cases, both red).

What changed: a plan cycle's root is now recorded for good when its turn starts. Store **v30** appends `plan_roots` (task
id, canonical instance name, the name its rows carry, the instant), written by `SessionWriter.openPlanRoot` in the
transaction that records the root under way (v29) — `Run.turn` hands it the root's canonical name — and never released or
rewritten (`INSERT OR IGNORE`). `entryRootsOf` names every plan cycle's root from it, after the iterations' roots and before
the publishes, which still name the roots of plan cycles run before v30. So such a root is named at the gate, after a stop
and in a fresh process, and what it read — recorded under its canonical name (REQ-LIBRARY-099, REQ-LIBRARY-093) — is the
run-level agent's received link (`agentArtifacts` already matches each named root's canonical name).

Pinned by: `packages/engine/src/session-resume.test.ts`, describe "REQ-LIBRARY-093 with REQ-MONITOR-044 and OQ-106 …" —
"… parked at the gate, a plan cycle's root that only read is named — live, and reopened in a fresh process …" and
"stopped before its gate opened: a plan cycle's root that only read is still named …", both red before the repair
(`entryRoots` `[]`); `packages/store/src/store.test.ts` — the v29 → v30 migration case (a record kept once, in start order,
and surviving the v29 release) and the cascade listing that now includes `plan_roots`.

Not shown live: the note was established with a throwaway engine case, not a proof or a live run. No live-run scenario runs
in `plan` mode with a persona id the canonicaliser rewrites (`katalyst`'s scenarios run as built-in roles, each its own
canonical name, where the defect cannot show), so the repair is shown by the driven engine cases above.

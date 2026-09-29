## The run-level agent's tool history is empty at a plan gate no iteration precedes

With no run live, the run-level agent's called tools are the tracker's history under one name: the persona the latest
iteration's root ran as (`entryToolsOf`). A plan cycle's root has no iteration row (REQ-ORCH-153). The session lets go of
the run as soon as `start()` settles, which a park at the plan gate does. So in a session whose first run parks at the gate,
the history is read under no name, and every tool chip of the run-level agent reads `not used` while the user reviews the
plan. That holds although the plan cycle's root called tools, and the tool-call ring and the tracker both hold those
calls under its name. The same happens after a plan cycle that ended before its gate, and after a restart. A session
that already has an iteration reads the latest iteration root's persona, which is the plan cycle root's name whenever the
entry persona is unchanged.

Noticed on 2026-09-29 while repairing the fifth review's finding on
[`the-run-level-agent-is-known-by-its-entry-persona-alone.md`](fixed/the-run-level-agent-is-known-by-its-entry-persona-alone.md),
and driven with a throwaway case that was not kept. The root of a `plan` mode session called `grep` through the writer, as
the run host's gate records a call, and parked. A snapshot during the cycle read `called: ["grep"]`, and the one after the
park read `called: []`, while `toolCallCounts` held the call. Live-run finding K1 built this fallback. It stands on
`main` as it does here; this branch did not change it.

## Specs

REQ-MONITOR-060: each chip is marked `active`, `used`, or `not used`, "derived from live and historical tool-call records".
The historical record holds the calls, and the chips say none was made. REQ-MONITOR-069's tools-and-artifacts card shows
"the same resolved set the inspector shows", so the persona window is affected too.

## Relevant files

- `packages/engine/src/sessions.ts` — `entryToolsOf`, whose fallback names the latest iteration's `root_persona` and no
  root without an iteration row; `Sessions.start`, whose `start().finally` lets go of the run at the park.
- `packages/engine/src/run/run.ts` — `Run.entryTools`, which reads the tracker under `rootName` while the run is live.
- `packages/engine/src/children/activity.ts` — the tracker, keyed by the name an agent dispatches under.

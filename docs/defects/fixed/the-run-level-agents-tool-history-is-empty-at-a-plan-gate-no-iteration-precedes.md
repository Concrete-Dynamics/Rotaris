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
[`the-run-level-agent-is-known-by-its-entry-persona-alone.md`](the-run-level-agent-is-known-by-its-entry-persona-alone.md),
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

## Outcome

**Repaired 2026-09-29 under R-067** (acceptance finding A21). Confirmed on the branch first, with a case that failed
before the repair. A `plan` mode session's root, as `Lead Planner`, called `grep` through the writer and parked. The
session's record after the park read `called: []`, while `toolCallCounts` held the call.

`entryToolsOf` keeps its reading when an iteration is recorded: the tracker's history under the latest iteration's
`root_persona`. With no iteration recorded, it now reads the history under every name the tracker holds that is no
child's (`AgentActivity.calledToolsWhere`, in the tracker's first-seen order). That reading rests on two facts:

- Only a root or a child dispatches a call, and a child dispatches under its canonical name.
- Before any iteration, every root the session has run was a plan cycle's root, which no row names.

So those names are the plan cycle roots', and their calls are the run-level agent's history. The tracker is seeded from
the tool-call ring when a session is opened, so the same reading holds after a restart. It also holds after a plan
cycle that ended before its gate.

Pinned by the case "parked at the gate: the plan cycle root's calls are the run-level agent's history, in the process
that parked it and in a fresh one" (`packages/engine/src/session-resume.test.ts`). It reads `called: ["grep"]` after
the park, and again in a fresh process that reopens the session. It failed before the repair. The case in
`agent-links.test.ts` had asserted the empty history ("no persona to read a history under"). It now asserts the root's
history with a child's calls left out.

Shown in the built app by `plan-gate-proof`'s new step 9. A fresh session's plan cycle root calls `glob` and parks. The
next launch reopens it at the gate and reads the inspector's run-level agent. On the code before the repair every chip
read `not used`, `glob:not used` among them, and the proof failed. With the repair it read `glob:used`.

Narrower than this note and left open: after an iteration, a plan cycle whose root runs under another persona (the plan
mode re-armed after the entry persona changed) still reads the latest iteration root's history. It is recorded in
[`../a-plan-cycle-after-an-iteration-reads-the-tool-history-of-the-iterations-root.md`](../a-plan-cycle-after-an-iteration-reads-the-tool-history-of-the-iterations-root.md).

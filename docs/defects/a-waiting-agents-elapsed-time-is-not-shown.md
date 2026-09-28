## A waiting or queued agent's elapsed time is not shown

The agent tree, the Mission view's agent table, the inspector and a persona window show an agent's elapsed wall-clock
time only while `AgentRecord.live` is true or the agent has ended. `live` is true for the presentation state `running`
alone (`toAgentRecord` in `packages/engine/src/sessions.ts`: `live: shownPs === 'running'`), so an agent waiting on an
approval, a question, a dependency or a model slot, or one still queued, is drawn with its state and no time — the tree
reads `waiting` where it would read `waiting · 1m 3s`, and the table reads `—` — although it has a spawn timestamp and
is live in REQ-MONITOR-045's sense (running, waiting or queued). The behaviour predates `PD-ORCH-005` revision 4. It was
noticed while the merged revision 4 build's eleventh review round restricted the transcript's "This task" to dropping the
time for a `paused` agent only (OQ-73), where a waiting or queued agent keeps its time as REQ-CHAT-069 asks. Not
repaired here: it is not the directive's, and which predicate should gate the clock (REQ-MONITOR-045's live set, or
every non-terminal agent other than `paused`) is a reading the repair must make.

## Specs

- REQ-MONITOR-107: "While the agent is live the figure advances at least once per second on every visible surface that
  shows it" — a waiting or queued agent is live (REQ-MONITOR-045) and its figure is not shown.
- REQ-MONITOR-111, with its resolution (`docs/spec/resolutions/02-run-monitoring-steering.md`, item 25): the fallbacks
  (the state value in the tree, an em-dash in the inspector and the pop-out card) "apply only where no spawn timestamp
  was recorded. A surface holding a spawn timestamp and showing a fallback … is now a defect."
- REQ-MONITOR-110's tick condition counts "one live per-agent elapsed clock"; with the clock hidden for a waiting agent
  a surface whose only live agent waits does not tick.

## Relevant files

- `packages/engine/src/sessions.ts` — `toAgentRecord` sets `live` for `running` only.
- `packages/ui/src/AgentTree.tsx` — the row's meta shows `elapsedLabel` only when `a.live || a.completedAt`.
- `packages/ui/src/AgentTable.tsx` — the Elapsed cell shows `—` unless `a.live || a.completedAt`.
- `packages/ui/src/Inspector.tsx`, `packages/ui/src/PersonaWindow.tsx` — `elapsed` is `null` unless
  `shown.live || shown.completedAt`.
- `packages/ui/src/TranscriptSurface.tsx` — `scopeDetail`, which shows the time for every agent but a `paused` one (the
  one surface that already meets the requirements for a waiting or queued agent).

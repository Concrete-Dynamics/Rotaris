## The run timer counts from the newest row, not from the model call in flight

Observed 2026-10-06 by the orchestrator's final default live run at origin/main `27a5127` (pack
`2026-10-06T01-30-08-282Z` of the `wt-live` worktree, git-ignored; the autopsy's "Unverified" observation on the
run-timing indicator, confirmed here). The pack's `edit/edit.early.png`, captured at 01:33:45.06 (`edit/app.log` line 84),
reads "Run active 0:09". The run's model traffic (`edit/model-traffic.jsonl`, records 27 and 28; each record's `at` is the
moment the request was sent, matching the `model request POST` lines of `edit/app.log`) has one call in flight at that
moment: the transcript summariser's, sent at 01:33:39.61 and answered at 01:33:46.64, 5.5 s in. The call before it, an
implementer's, ran from 01:33:32.43 to 01:33:39.60. A value that counted the call in flight would read 0:05; the
indicator read 0:09, about 10 s after the newest transcript row (01:33:34.9, the autopsy's row 63). The same reading is
in the pack taken at `1763f7f`.

The indicator does not know when a model call starts. `modelCallStartedAt` (`packages/ui/src/composer.ts`) takes the
newest unsettled row, or the newest row, as the start of the step in flight, and its own comment says so: "It is NOT the
instant the call was issued, and a call that has produced nothing yet counts from the end of the step before it.
Publishing the true boundary needs a field on the record, and that is recorded as owed rather than faked here." Nothing
in the record holds that debt; this note does. A call that writes no transcript row (the summariser's, a classifier's) never
restarts the value, so a slow call of that kind reads as the
time since the last row, and a quick one is never seen to begin.

## Specs

- **REQ-CHAT-158** — while a run is active the value "MUST count the time spent inside the model call currently in
  flight and MUST restart from `0:00` each time the run moves on to the next model call within the same run". The value
  did not restart when the run moved on from the implementer's call to the summariser's at 01:33:39.6, and a call that
  has written nothing yet is counted from the end of the step before it, not from its own start.
- Which call is "the model call currently in flight" when several agents of one run have calls out at once, or when
  the call in flight is the summariser's or a classifier's, the requirement does not say: the open question raised with
  this note, OQ-200 (*Which model call does the run timer count while a run has more than one?*), asks it.

## Relevant files

- `packages/ui/src/composer.ts` — `modelCallStartedAt` and `runTimingSeconds`, the indicator's value.
- `packages/ui/src/WorkspaceView.tsx` — `stepStartedAt`, memoised from the transcript rows (around line 1275 at `27a5127`).
- `packages/ui/src/RunHeader.tsx` — draws the value.
- `packages/contracts/src/` — `SessionRecord` carries `runStartedAt` and no per-call boundary; publishing one is a
  contracts, engine and surface change.

Noticed 2026-10-06 by the autopsy of the default live run at `27a5127`; confirmed by fin18 (bundle
`fin18-rail-label-and-observations`). Not repaired: the boundary has to be published by the engine through the record
before the surface can count it, which crosses three packages, and which call it should be is the owner's (OQ-200).

## Ruled as built — 2026-10-06 ([R-071](../../product/requests.md#r-071)); closed

OQ-200 was raised the same day, after the overview the owner answered, and the owner's instruction confirmed it at the reading the build proceeds under (ruled in [`open-questions.md`](../../architecture/open-questions.md); [`PD-CHAT-008`](../../product/directives.md#pd-chat-008) narrows REQ-CHAT-158): the timer counts from the newest transcript row the run produced, and no model call's start is published on the record. The debt this note held, a call boundary on the record, is not owed under that ruling. Nothing is changed in the code.

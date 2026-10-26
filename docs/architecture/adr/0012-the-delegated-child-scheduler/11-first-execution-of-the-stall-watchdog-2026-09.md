# ADR-0012 — The delegated-child scheduler: a persisted ledger, not a promise graph — First execution of the stall watchdog — 2026-09-29: consequence 5's watchdog, and the message it makes possible

Part 11 of 14 of [ADR-0012](../0012-the-delegated-child-scheduler.md), which indexes every part.

## First execution of the stall watchdog — 2026-09-29: consequence 5's watchdog, and the message it makes possible

*Consequence 5 names the visibility-only stall watchdog (`REQ-ORCH-089`, `REQ-MONITOR-117`) beside the hard timeout,
reading from the `MonotonicClock` port. It was never built until now: the paragraph above records its badge as unbuilt,
and `a-child-that-produces-no-output-is-never-given-its-one-corrective-message.md` recorded the watchdog and
`REQ-NOTIFY-111/112`'s recovery as unbuilt too. So its first execution reports here, under R-067.*

**What was built.** `children/stall.ts`'s `StallWatch` runs once per attempt of a child's execution, beside the hard
timer, on the clock port. It reads the threshold consequence 5 names: the role's override, else
`runtime.child_stall_timeout`. It never cancels. REQ-NOTIFY-112's recovery reads the same watch: a child whose turn
failed after no output for the whole window is given one corrective message and carries on. The readings, including
what ends a silent step when the watch cancels nothing, are OQ-127.

**What the execution found.** The decision held: consequence 5's premise was true, and the watchdog needed nothing but
the clock port and the child's own events. Three things the record did not anticipate:
- **No port carried a model event.** The model's sink reported text, reasoning, usage and the first part of a step
  only, so a model streaming a long tool call's arguments would have read as silent. `TurnSink` gained an optional
  `event` for every part, the one change outside the engine.
- **Every tool call's start** had no hook either. `TurnDeps.onToolStarted` was added, since REQ-MONITOR-118 tells a
  wait on tools from a stall only by the calls in flight.
- **Once per child is not structural.** Within one attempt, a single corrective turn follows the first. REQ-ORCH-088's
  fallback retry is a second attempt of the same child task, though, so the once-per-child count is state the execution
  keeps across attempts. The ladder test that pins it fails without that state.

**What was measured.** Unit cases over `FakeClock` in `stall.test.ts`. End-to-end cases through `Sessions`, six in
`children.test.ts` and two in `ladder.test.ts`: the stall warned while the child runs, the message and the success
that follows, no second message, the window at 29 s against 30 s, waiting on a tool call, the recovery, the fallback
retry and the role's window. Each positive case fails with its limb reverted.

**What was not measured.** No built app and no live run: the live run's `faults` scenario stalls the root's stream,
not a child's. The badge the callback exists for is not wired to any host. The root is not watched. The row is in
[`../first-executions.md`](../../first-executions.md).

**Corrected in place by the verifier's first round, 2026-09-29.** The build first wrote the `stall` issue only with
each throttled warning, on the reasoning that an issue every 5 s would evict the session's other issues from
REQ-SESSION-133's ring. That reasoning narrowed REQ-MONITOR-119's "every stall evaluation", whose throttle
(REQ-MONITOR-120) bounds only "the warning itself", so it is kept here as the falsified reason: the issue is now
written at every evaluation, and the eviction is left to a ruling in OQ-127 *(ruled 2026-10-06: the issue is written
with the warning again, by PD-MONITOR-005 revision 2; see the pointer at this section's end)*. The same round recorded
in OQ-127 that three of the timeline words the watch and the recovery write are outside REQ-ORCH-139's closed vocabulary.

**Corrected in place by the verifier's second round, 2026-09-29.** Two claims above were narrower than they read.
"Once per child … state the execution keeps across attempts" is true of REQ-ORCH-088's retry and false of PD-ORCH-005's
resume, which is a new execution of the same task: a paused and continued child was given a second message. The count
is now read, at a resumed execution's start, from the task's whole conversation record. And the silence the recovery
reads started again only at the attempt's start, a tool result and the corrective message, so a child that waited on its
own children past the window was blamed for the wait; every turn the run starts for the child now starts it again.
Neither changes the decision: the watch still reads only the clock port and the child's own events. The three timeline
words are no longer written: they are session-log lines through the run's `warn`, as OQ-76's are, the reason for
minting them (that the log was out of reach without editing `Run.turn`) having been false. *(2026-10-06: they are timeline
entries again, under OQ-127's ruling; see the pointer at this section's end.)* `children.test.ts` now has
nine cases, `stall.test.ts` twelve, and `record.test.ts` one more.

**Repaired in place by acceptance finding A7, 2026-09-30.** The watch's own evaluation still read the time since the
child's last event, so a child waiting on its own children between its turns had a `stall` issue at every evaluation
past the window, and the warning, while it worked as designed. The turn's end is now fed to the watch too
(`betweenTurns`), and until the run starts the next turn no silence is counted. The decision stands: the watch still
reads only the clock port and the child's own events. The reading is OQ-155's; `children.test.ts` has ten cases for the
watch and `stall.test.ts` fourteen, each new one failing with the limb reverted. *Corrected in place the same day:* an
execution resumed into waiting (PD-ORCH-005 clause 4) ends no turn before its wait, so the turn's end never marked it and
the wait was still counted; `execute` now marks such an execution between turns as its watch is armed, and
`children.test.ts` has eleven cases for the watch.

*(2026-10-06, [R-071](../../../product/requests.md#r-071): OQ-127 ruled as recommended, and two statements of the verifier's
rounds above, kept as they were written, no longer describe the build. The issue:
[`PD-MONITOR-005`](../../../product/directives/pd-monitor-005.md#pd-monitor-005) revision 2 (narrowing REQ-MONITOR-119) writes the `stall`
issue only beside the throttled warning — at entry, then no sooner than REQ-MONITOR-120's throttle — so the reason the
first round kept as falsified, the eviction from REQ-SESSION-133's ring, is now the owner's rule; the callback still
fires at every evaluation. The three facts: the wait on tools, the recovery and the corrective message are the `waiting_on_tools`,
`stall_recovered` and `corrective_message` timeline entries, words of [`PD-ORCH-014`](../../../product/directives/pd-orch-014.md#pd-orch-014)
given under OQ-157, each beside its session-log line; the wait on tools and the recovery are intended states logged at
`INFO` through the run's `info`, and only the stall warning and the corrective-message line stay at `WARNING`.
`stallRecords` and `recordCorrectiveMessage` in `children/stall.ts` are the one writer for a child's watch and the
root's. The decision is unchanged: the watch still reads only the clock port and the agent's own events, and cancels
nothing. Pinned by `stall.test.ts` ("OQ-127's ruling …") and `children.test.ts` ("PD-MONITOR-005 revision 2 …", and the
wait and recovery cases for a child and the root).)*

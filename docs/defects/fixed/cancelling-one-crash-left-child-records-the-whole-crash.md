## Cancelling one crash-left child records the whole crash

When the user cancelled one child of a session at rest and a crash not yet recorded had left an agent of the open
iteration unfinished (`crashLeftOf` named one), `Sessions.cancelPausedAtRest` called `recordCrashOf` before it
cancelled. That wrote the whole crash record as a side effect of cancelling one child: the open iteration's interruption
`crash`, every other agent the crash left `paused` with its open calls answered, every stored pending approval
withdrawn, and every background session still marked running ended by the crash. No run was about to start and nothing
was repaired or continued. The build recorded it as OQ-74's departure, asked for as a cross-lane contract of the
revision 4 build.

Found 2026-09-28 by the review of the merged revision 4 build of `PD-ORCH-005` (R-064).

## Specs

`PD-ORCH-005` clause 3 ("a crash is recorded when the session is next repaired or continued") and clause 8 ("settling,
recording interruptions and resuming happen only when a run of the session is about to start"); clause 18's "Either
choice records the crash first" names the Continue action and "continue without them", not a cancel. Clause 3's
cancellation of one agent ends its agents `cancelled`, which a reading that departs from none of them could do.

## Relevant files

- `packages/engine/src/sessions.ts`: `cancelPausedAtRest` and `cancelPausedUnderLock`, which called `recordCrashOf`.
- `packages/engine/src/run/crash.ts`: `recordCrash`, the whole record, and `answerOpenCalls`.

## Repaired — 2026-09-28

By the first fix round of the merged revision 4 build (R-064). `cancelPausedUnderLock` no longer records the crash. It
cancels the chosen crash-left child, and each descendant a rest paused or the crash left, from the state it is stored in
by the cancellation path, as clause 3's cancellation of one agent does. It answers only the cancelled agents' own calls
the crash cut off (`answerOpenCalls`), because no later crash record reaches a terminal agent and REQ-SESSION-129 leaves
no row `running`. The iteration's interruption, the other crash-left agents, the stored approvals and the running
background sessions are left for the next repair or continue, which records them and pauses only what is still
unfinished. OQ-74 records the reading.

Evidence:
- `packages/engine/src/run/crash.test.ts`, "PD-ORCH-005 clauses 3, 8 and 16 (OQ-74)": in REQ-CHAT-008's recovery state
  the child and its descendant end `cancelled` with a NULL interruption, nothing of the crash is written, the child's
  cut-off call is answered, and the next repair records the crash and pauses only the sibling. A sibling-left case and a
  failed move write nothing of the crash either. Putting `recordCrashOf` back turns all three red, and removing the
  answer turns the first red.

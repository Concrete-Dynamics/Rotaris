## A crash during the explicit cancel leaves the cancelled run resumable

The run-level explicit cancel (`cancelAgent` for the reserved run id, REQ-MONITOR-126, which every confirmed "Cancel the
run?" sends, `PD-ORCH-005` clause 15) writes nothing durable when it is accepted. `Run.cancelAgent` only raises the
in-memory `StopRequest` as final; the agents end `cancelled` and the iteration closes later, in `iterate`'s `finally`,
once the root's turn returns. If the run host dies in that window — a call that ignores the abort until its deadline
(`a-root-call-that-ignores-the-stop-holds-the-run-open.md`), the quit's shutdown bound running out while the cancel
settles, or the process being killed — the store is identical to an ordinary mid-run crash: a busy status, the open
iteration's interruption NULL, and the unfinished agents where they stood.

Every revision 4 consumer then treats the cancelled run as crash-left. `crashLeftOf` names its agents, and every surface
presents them `paused` by `crash` (OQ-100). `resumableOf` counts them for the Continue action and the decline (clauses 6
and 19). `continueSession` accepts the session (clause 18), and the repair or the continue records the crash, which
pauses them, so the Continue action resumes work the user confirmed as final. At the base this was reachable only by a
continue by message; revision 4 puts it on every agent surface, in the count and behind the Continue action.

The stop (`cancel` op, "Stop the active run") writes `cancelling` at once, but that status is a stop's and is not final,
so it cannot tell the two apart either. A single child's cancel is durable at once (`IterationChildren.cancel` moves it
`cancelled` in the store), so this is the run-level cancel alone.

Found 2026-09-28 by the thirteenth review round of the merged revision 4 build of `PD-ORCH-005` (R-065). Not repaired:
which clause governs is the owner's to rule, and OQ-103 records the reading and asks it.

## Specs

`PD-ORCH-005` clause 3: the cancel control's agents "end `cancelled` as today, and those are never resumed". Clause 18:
"A session a crash left … SHALL offer the Continue action". The two meet on a run whose cancel was requested but not
carried out when the host died; the build follows clause 18 because nothing durable tells the case apart. REQ-MONITOR-126
("cannot be undone in this session").

## Relevant files

- `packages/engine/src/run/run.ts`: `Run.cancelAgent` (the root's branch raises the final stop and writes nothing);
  `iterate`'s `finally`, where the agents end `cancelled`.
- `packages/engine/src/run/stop-request.ts`: `StopRequest`, in memory only.
- `packages/engine/src/sessions.ts`: the control's `cancelAgent` arm (no `writer.save`), `crashLeftOf`, `resumableOf`,
  `continueSession`.
- `packages/engine/src/run/crash.ts`: `recordCrash`, which pauses every non-terminal agent by `crash`.

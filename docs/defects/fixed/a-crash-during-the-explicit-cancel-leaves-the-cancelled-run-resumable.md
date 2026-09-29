## A crash during the explicit cancel leaves the cancelled run resumable

The run-level explicit cancel (`cancelAgent` for the reserved run id, REQ-MONITOR-126, which every confirmed "Cancel the
run?" sends, `PD-ORCH-005` clause 15) writes nothing durable when it is accepted. `Run.cancelAgent` only raises the
in-memory `StopRequest` as final; the agents end `cancelled` and the iteration closes later, in `iterate`'s `finally`,
once the root's turn returns. If the run host dies in that window — a call that ignores the abort until its deadline
([`a-root-call-that-ignores-the-stop-holds-the-run-open.md`](a-root-call-that-ignores-the-stop-holds-the-run-open.md),
repaired 2026-09-29: the root is now given up on at the 30 s grace, which shortens the window but does not close it), the quit's shutdown bound running out while the cancel
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

## Ruled 2026-09-29 (R-067)

OQ-103's last question is ruled ([R-067](../../product/requests.md#r-067)): clause 3's "those are never resumed" governs. The
explicit cancel is made durable when it is accepted — a stored mark, by an appended store migration — and the next repair
or continue ends those agents `cancelled` and closes the iteration; clause 18's Continue does not resume them, and the
Continue action counts none of them. This note stayed open until that was built.

## Outcome — Repaired 2026-09-29 under R-067

The explicit cancel is made durable when it is accepted. Store **v27** appends `iterations.cancel_accepted_at`, and
`Run.cancelAgent` writes it for the reserved run id on the iteration open in the store at once
(`SessionWriter.recordCancelAccepted`, at the stronger durability setting), before anything of the cancel is carried out;
`Run.turn` writes it on an iteration it opens after the cancel was accepted. The run's own close keeps it as history.

An OPEN iteration carrying the mark is read as that cancel wherever the build read a crash:

- `recordCrash` (`packages/engine/src/run/crash.ts`) carries the cancel out in the crash's place (`recordAcceptedCancel`):
  the calls a dead step left unanswered are answered and counted as for a crash, every agent of the iteration not in a
  terminal state (`paused` ones included, where the cancel overtook a rest) ends `cancelled` with its report stored and
  materialised, and the iteration closes `cancelled` with its task back to `pending` in the same transaction; the
  approvals and the background sessions are recorded as for any dead run. So the repair and every continue — the
  Continue action, "continue without them", a continue by message — end those agents and close the iteration first.
- `crashLeftOf` names none of them, `resumableOf` states nothing to resume (the Continue action counts none of them), and
  the new `cancelLeftOf` names them while no run carries the cancel out, so every agent surface presents them
  `cancelled`, ended with the run (`AgentFacts.cancelLeft`), never `paused` by `crash`. The run-level agent the surfaces
  synthesise (`runLevelAgent`, `packages/ui/src/agents.ts`) presents `cancelled` and not live in REQ-CHAT-008's
  recovery state with nothing to resume, offered neither Steer nor Cancel — the build first left it drawn `running` and
  live there, found at verification and pinned in `packages/ui/src/agents.test.ts`.
- A continue is set up as the entry role (`resumedPersona`), since nothing is resumed.

Pinned by `packages/engine/src/run/crash.test.ts`, "PD-ORCH-005 clause 3 with REQ-MONITOR-126 (OQ-103 ruled): …" — the
record, the presentation and the count at the store, and at `Sessions` the mark at acceptance and at an iteration opened
after it, the repair, and the Continue action, "continue without them" and a continue by message from the recovery state and from `interrupted`;
thirteen of its fourteen cases fail with the repair's reads and writes withdrawn — and by the store's v27 migration test in
`packages/store/src/store.test.ts`. No checkpoint is captured for the iteration the record closes; that reading is raised
as OQ-130 (OQ-129 on the branch, renumbered at the merge). The ruling's report-back is in OQ-103, and its first execution in `docs/architecture/first-executions.md`.

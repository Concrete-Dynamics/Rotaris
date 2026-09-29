## A queued approval is denied unshown after ten seconds

`RunHostPresenter.present` waited 10 000 ms (`shownBoundMs`) for main's `approval.shown`. Main sent `approval.shown` only
when it opened the dialog (`presentNext`). A request queued behind an open approval dialog was therefore denied "because
the approval request could not be shown: main did not confirm the dialog within 10000 ms" as soon as the open dialog had
stayed up for 10 s. So two concurrent asks could not both wait. In the reviewer's drive, the root's second `delegate` was
denied while child one's `write_file` dialog was open, and the run lost its second child.

Found 2026-09-28 by the fourteenth review round of the merged revision 4 build of `PD-ORCH-005` (R-065), driving the
built app. The code predates revision 4.

## Specs

REQ-TOOLS-063: queued requests are shown one at a time, "the next queued request is presented as soon as the open dialog
closes", and a request is dropped from the queue only if it timed out or was cancelled, counting as cancelled
(REQ-TOOLS-054). ADR-0019's first-execution note records the 10 s handshake. It did not foresee a queued request.

## Relevant files

- `apps/desktop/src/main/index.ts`: the `approval.present` handler; `presentNext`.
- `apps/desktop/src/main/main-windows.ts`: `enqueueApproval`, which now answers whether the request waits.
- `packages/contracts/src/process-protocol.ts`: the `approval.queued` request.
- `apps/desktop/src/run-host/tools.ts` and `dispatch.ts`: `RunHostPresenter.queued` and `close`.
- `packages/agent-tools/src/gate.ts`: `Gate.broker`, which races the presentation against its wait.

## Repaired — 2026-09-28

By the fourteenth fix round of the merged revision 4 build (R-065). A request that waits behind the open dialog, or
behind requests queued ahead of it, is acknowledged with `approval.queued`. After that, `RunHostPresenter` no longer
bounds the wait for `approval.shown`. A request main never acknowledges is still a presenter error at 10 s. The gate
races the presentation against its own wait. A queued request that times out or is cancelled is dropped unshown and
counts as cancelled; a withdrawal withdraws it; an answer given elsewhere is honoured. `close` releases a request still
queued and tells main to drop it.

The repair's first cut left one route to a hang, found by the orchestrator's review of that round: a request acknowledged
as queued had no bound, and a window that closed while the application stayed (another main window open) dropped its
queue with its record, so nothing ever settled the request, against REQ-TOOLS-064's "never a hang". `MainWindows` now
hands a closing window's queued requests to main (`unshownApprovals`), which answers each `approval.shown` not shown, so
the gate denies it as REQ-TOOLS-058 says, as the 10 s bound did before. During the application's quit it answers nothing,
and the run host's shutdown withdraws them (`PD-ORCH-005` clause 9).

Evidence: `gate.test.ts` (two "queued request" cases), `tools.test.ts` ("RunHostPresenter"), and `main-windows.test.ts`
("answers whether a queued approval waits…" and "a closing window hands over the requests still queued…"), each red against the unrepaired code. In the built app, with the
reviewer's script in ask mode, the root's second `delegate` waited 36 s behind child one's `write_file` dialog and was
presented when that dialog was answered.

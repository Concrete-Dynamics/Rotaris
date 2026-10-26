# ADR-0019 — Approvals: the wait registry lives with the gate; the presenter is a revocable capability — First execution — 2026-09-03, the presenter across the real boundary

Part 8 of 8 of [ADR-0019](../0019-approvals-and-the-presenter-capability.md), which indexes every part.

## First execution — 2026-09-03, the presenter across the real boundary

*Recorded under GD-10.*

**Built and run.** `packages/agent-tools/src/approvals.ts`: `PendingApprovals` with every clause of
`REQ-TOOLS-054` (waiting on an unknown id resolves *cancelled*), and `PresenterRegistry` — registrations per
main window, a 250 ms poll on the channel that carries registration, and the lapse test as THE GAP SINCE THE
LAST REPLY on the run host's own clock, never a receipt for sequence *N*. **The lapse window is 3,000 ms**:
ten missed replies, an order of magnitude above the measured 303 ms idle maximum, inside the 22,777 ms lag
the `ipc-hop-latency` spike says must read as unattended. That is a first figure, not a sizing: the loaded
case is still unmeasured and **OQ-39 stays open** *(ruled 2026-10-06, [R-071](../../../product/requests.md#r-071): the poll and the window accepted as built)*. Main registers each window on creation and revokes it on
`closed` (consequence 1), answers each poll at once with the windows it holds, owns the per-window dialog
queue and nothing else; the dialog is a modal `BrowserWindow` painting the one renderer bundle with
`role=approval` — never a synchronous native call. The gate's flow is the one this record describes:
`approval.requested` published before the wait with `brokered` and the configured timeout, or `headless`,
`timeout_seconds: null` and `unattended_reason: headless-policy` with no wait created at all.

**"Never a silent allow" now has evidence beyond measurement** — the direction this record said the spike
had not exercised. The gate's tests drive the decision path: an unattended session routes every ask to the
headless policy and denies; `abort` invokes the registered hook; a presenter that fails discards the
pending entry and denies with `presenter-error`; approval resolution that raises denies `fail-closed`; a
lapse settles every waiter `cancelled` and the next reply clears it. In the built app, a run stopped while
a dialog waited released the waiter first (`REQ-MONITOR-012`) and the decision was audited with source
`cancelled` and the request id.

**Found — the synchronous-dialog prohibition has a second entrance, and it was walked through.** Main's
`closed` handler for the dialog read `webContents` of the already-destroyed window. That throw is the
pitfall the toolchain notes already record; what this record had not stated is its consequence *here*: an
uncaught exception in main raises the platform's native error box, which is exactly the synchronous modal
this record forbids, and it blocked the loop and every poll reply — the run completed in the run host while
main sat wedged. Two corrections: the handler holds the id read up front, and **main now logs uncaught
exceptions instead of letting the platform present them** (`process.on('uncaughtException')`). The
prohibition is therefore not only "open every dialog asynchronously"; it is also "let no exception reach
the platform's own presenter". ADR-0048 and constraint T-31 are the owners of the rule and are told here
rather than amended.

**One handshake this record did not describe.** The run host cannot request from main, so `present()` posts
an `approval.present` event and awaits main's `approval.shown` request, bounded at 10 s; a late or absent
confirmation is a presenter error. Main reports `ok: false` when no main window exists, which is the
unattended case reached without a lapse.

**The handshake's bound met a queued request (2026-09-28, the fourteenth review round of the merged revision 4 build of
`PD-ORCH-005`).** *"A late or absent confirmation is a presenter error"* was false for a request queued behind an open
dialog. Main confirmed only what it showed, so such a request was denied unshown once the open dialog had stayed up for
10 s, although `REQ-TOOLS-063` drops a queued request only on a timeout or a cancellation
(`docs/defects/fixed/a-queued-approval-is-denied-unshown-after-ten-seconds.md`). Main now acknowledges a request that
waits behind the open dialog, or behind requests queued ahead of it, with `approval.queued`. The bound then no longer
applies. A request main never acknowledges is still a presenter error at 10 s. The gate races the presentation against
its own wait, so a queued request that times out or is cancelled is dropped unshown and counts as cancelled
(`REQ-TOOLS-054`). A window that closes while the application stays hands its queued requests back to main, which
answers each not shown (`REQ-TOOLS-058`), so a request the bound no longer covers never hangs (`REQ-TOOLS-064`). During
the application's quit it answers nothing, and the shutdown withdraws them (`PD-ORCH-005` clause 9).

**Second execution, 2026-09-03, with children.** `PendingApprovals` is per TOOL PORT, and with delegation every
agent — the root and each child — holds its own port. A session-level route for an answer would have reached the
one port the session was created with and missed every agent's; caught in the code before it ran, so it is not
counted with the seven, but it is a fact this record did not state: **the run fans an answer, a cancel and a mode
change out over every port it created** (`Run.answerApproval`, `Run.cancelPending`, `Run.setPermissionMode`), and
`REQ-TOOLS-030`'s "every live agent of the session" is met by that fan-out rather than by one registry.

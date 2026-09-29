## An approval asked for after the last window closes is denied

When the last main window closes, main revokes its presenter at once, but it sends the run host's `shutdown` only after
`window-all-closed` has waited for any checkpoint operation in flight (REQ-GIT-101). An agent that asks for an approval
in that gap finds no presenter. It is answered as it would be with nobody to show the dialog to: denied. PD-ORCH-005
clause 9 would have the approval withdrawn by the quit. The gap is as long as the checkpoint operation, and a large tree
makes it long.

Noticed 2026-09-27 by the adversarial review of PD-ORCH-005's phase 7. Established by reading the code; not driven.
The same class as `fixed/a-quit-denies-the-approval-it-should-withdraw.md`, on a path that repair does not reach.

## Specs

`PD-ORCH-005` clause 9: an approval pending "when the run comes to rest — by a pause, a stop, a quit or a crash" is
withdrawn and "never recorded as denied".

## Relevant files

- `apps/desktop/src/main/index.ts` — `window-all-closed` (the checkpoint wait, then `shutdown`).
- `apps/desktop/src/main/main-windows.ts` — `disposeResources`, which revokes the presenter.
- `apps/desktop/src/run-host/dispatch.ts` — `presenter.revoke`, and `presenters.attended`, which the run reads.
- `packages/agent-tools/src/gate.ts` — how an approval resolves with nobody attending.

## Repaired — 2026-09-29

Repaired 2026-09-29 under R-067. Confirmed first on the code before the repair: an ask made with the presenter revoked
and the quit under way was resolved by the headless policy (`resolver: 'headless'`, a `headless-policy` denial), the
case "an ask made after the quit closed the last window …" in `gate.test.ts` red.

What changed:
- **Main says which revoke the quit causes.** `presenter.revoke` carries `quitting` (`packages/contracts/src/process-protocol.ts`),
  set from `QuitState` — the same predicate that keeps a quit-closed dialog from answering Deny — when main revokes a
  window's presenter (`apps/desktop/src/main/index.ts`, `revokePresenter`). The last window's revoke is sent as it
  closes, so the run host learns of the quit before `window-all-closed` waits on the checkpoint operation, not after.
- **The run host holds what is asked in the gap.** `PresenterRegistry.quitting` (`packages/agent-tools/src/approvals.ts`)
  is true from such a revoke until a window registers again. While it is, the gate (`packages/agent-tools/src/gate.ts`)
  does not take REQ-TOOLS-064's headless path: the approval is published `brokered`, waits unshown in
  `pending_approvals`, and the quit's shutdown withdraws it by `quit` with every other wait of the run. A present that
  crossed the close and came back "not shown" once the quit was under way is held the same way, not denied
  `presenter-error`. A run whose user is treated as away (PD-TOOLS-005) still resolves an ask at once, as it would with
  the window open.
- **No budget expires on a held wait.** `PendingApprovals` and `PendingQuestions` take a `held` predicate; a timeout that
  expires while the quit holds the wait is armed again rather than settling it `timed_out` — which REQ-TOOLS-052 would
  have turned into a denial for an approval asked before the quit, too, whenever the checkpoint wait outlasted its budget.
- **A question put in the gap is held, not discarded.** `ask_questions`' publication (`apps/desktop/src/run-host/tools.ts`)
  answers true while the quit is under way, so the prompt is recorded pending and the quit withdraws it
  (`PD-CHAT-002` revision 2), rather than REQ-CHAT-094's "could not be shown".

The departures this reads into REQ-TOOLS-064, REQ-TOOLS-058, REQ-EVENTS-049 and REQ-CHAT-094 for the quit's gap are
[OQ-132](../../architecture/open-questions.md).

Pinned by `packages/agent-tools/src/gate.test.ts` (the four "PD-ORCH-005 clause 9 …" cases added beside the withdrawal's:
the ask in the gap, the crossing present, the away user, and the registry's and the wait's hold),
`packages/agent-tools/src/tools/questions.test.ts` ("… a budget expiring while the quit holds the prompt is not a timeout …"),
`apps/desktop/src/run-host/tools.test.ts` (the two "… through the port" cases for an approval and a question) and
`apps/desktop/src/run-host/dispatch.test.ts` (the revoke's hop). Each was red with its limb removed. No built-app quit
with a checkpoint operation in flight was driven.

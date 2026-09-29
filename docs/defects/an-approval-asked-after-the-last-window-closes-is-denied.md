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

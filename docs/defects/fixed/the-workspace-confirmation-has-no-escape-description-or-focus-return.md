## The Workspace's confirmation dialog has no Escape, no description and no focus return

The Workspace kept its own copy of the confirmation dialog, beside the shared `ConfirmDialog` that the Mission and Git
views use. The copy did nothing on Escape and did not describe the alert dialog by its body. After a dismissal it left
focus on the document body, not on the control that opened it. PD-ORCH-005's "Continue without them" confirmation
reused the copy.

Noticed 2026-09-27 by the second adversarial review of PD-ORCH-005 phase 5.

## Specs

REQ-CHAT-101: a modal dialog owns Escape. WAI-ARIA's dialog pattern covers the description and the focus return.

## Relevant files

- `packages/ui/src/WorkspaceView.tsx` — the local copy, now removed.
- `packages/ui/src/ConfirmDialog.tsx` — the shared dialog.

## Repaired — 2026-09-27

By PD-ORCH-005 phase 5's second repair.
- The Workspace uses the shared dialog.
- The shared dialog describes itself by its body.
- The shared dialog returns focus to its opener. It reads the opener on its first render, before `autoFocus` moves focus
  into the dialog.

Evidence:
- `packages/ui/src/confirm-dialog.test.ts`: the dialog is named by its title and described by its body.
- The built app: Escape closed the run's cancel confirmation, and focus went back to the inspector's Cancel.

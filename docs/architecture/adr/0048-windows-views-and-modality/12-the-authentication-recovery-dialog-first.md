# ADR-0048 — Windows, views and the three modality levels — The authentication recovery dialog — first executed 2026-10-02 (the 401 note's part C)

Part 12 of 13 of [ADR-0048](../0048-windows-views-and-modality.md), which indexes every part.

## The authentication recovery dialog — first executed 2026-10-02 (the 401 note's part C)

`REQ-NOTIFY-072`'s "modal recovery dialog 560 px wide" is built as the pause, provider and approval dialogs are: a child
`BrowserWindow` with the platform's `modal` flag against the main window following the failed session, its role by route
(`auth-recovery`), its payload read by its own command (`apps/desktop/src/main/index.ts`, `presentAuthRecovery`;
`packages/ui/src/AuthRecoveryDialog.tsx`). The width is the window's, fixed at 560 by `minWidth`/`maxWidth`
(`AUTH_RECOVERY_DIALOG_WIDTH`). `REQ-NOTIFY-079`'s "at most one" is main's single slot: opening one closes any other first.

**Reported back, not repaired.** The decision above says a window-modal surface is "an in-window overlay with a focus trap".
Every window-modal dialog this product draws — the pause, the provider sign-in, the approval, and now this one — is a modal
child window instead; the platform flag makes it window-modal against its parent, which is what the decision's level asks
for, but the means differs from the one written here. This execution followed the built precedent rather than the text and
records the difference here; it changes nothing the three levels promise.

**Measured** by `pnpm resilience-proof`'s `fatal` scenario through the driver, which since this date addresses the window
as `auth-recovery`: `window.innerWidth` 560; the dialog is `role="alertdialog"` with `aria-modal="true"`; Cancel closed the
window and nothing else. **Found while running it:** the first-launch notice (REQ-WORKSPACE-152 (3)), raised 800 ms after the
workspace opens, replaced the failure's notice in the one slot when the driven prompt failed sooner — a race of the proof,
not of the product, so the scenario now waits for that notice before it types.

~~The non-modal window-level re-authentication prompt this ADR names (`REQ-NOTIFY-071`) is not built on this base (the note's
part B, on `fin6-auth-recovery-1`, unmerged).~~ *Corrected at the merge, 2026-10-02:* it is built (the section above) and
merged beside this dialog. The automatic fallback goes ahead of the dialog, which keeps REQ-NOTIFY-072's two cases, and the
dialog's opening closes every prompt open (REQ-NOTIFY-079) — so at most one of the two authentication surfaces is drawn for
a failure, the modal one taking the place of the non-modal one.

## A refused focus-session or project-setup notice action is reported only to the renderer console

The same shape as the hook review's
([`fixed/a-refused-hook-review-notice-action-is-reported-only-to-the-renderer-console.md`](fixed/a-refused-hook-review-notice-action-is-reported-only-to-the-renderer-console.md)),
in the two sibling arms of `dispatchNoticeAction` that send a command and read its outcome:

- `focus-session` sends `session.focusFromNotice {sessionId, workspace}` and, on a refusal, only calls
  `console.warn(\`notice action "focus-session" for … was refused: …\`)`. Main refuses with "The window holding the session
  closed before it could focus it" (`window.gone`), "No main window is open" (`window.notMain`), or a refused reach.
- `open-project-init` sends `projectInit.open {workspace}` and does the same; main refuses with "The window holding the project
  closed before Settings › Project could open" (`window.gone`) or a refused reach.

A refused reach coded `workspace.openFailed` / `workspace.buildFailed` was already reported under REQ-SHELL-019 by
`MainWindows.#addWindow`; the others reach no one. The person who pressed the action sees nothing happen.

Noticed 2026-10-14 by fin46 (`fin46-accept1-10`) while repairing the hook-review arm, whose task named that arm alone.
Recorded, not repaired: outside that task. The repair is the hook-review arm's — its outcome handed to
`reportNoticeActionRefusal` (`apps/desktop/src/renderer/notice-action-refusal.ts`) — pinned by a source-shape case in
`apps/desktop/src/renderer/notice-action-refusal.test.ts`.

## Specs

- `REQ-NOTIFY-254` — no failure is reported by silence; the refusal's reason is worded by main and dropped by the renderer.
- `REQ-NOTIFY-003` — a refusal is published as a persistent notice.

## Relevant files

- `apps/desktop/src/renderer/main.tsx` — `dispatchNoticeAction`, the `focus-session` and `open-project-init` arms.
- `apps/desktop/src/main/commands/session.ts` — `session.focusFromNotice`'s refusals.
- `apps/desktop/src/main/commands/initialization.ts` — `projectInit.open`'s refusals.
- `apps/desktop/src/renderer/notice-action-refusal.ts` — the hook-review arm's repair, which these arms can take.

## A refused focus-session or project-setup notice action is reported only to the renderer console

The same shape as the hook review's
([`a-refused-hook-review-notice-action-is-reported-only-to-the-renderer-console.md`](a-refused-hook-review-notice-action-is-reported-only-to-the-renderer-console.md)),
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

## Outcome

*Repaired 2026-10-15 by fin47 (`fin47-notice-and-retro`).* Confirmed first: `notice-action-refusal.test.ts`'s two new
source-shape cases on the `focus-session` and `open-project-init` arms went red on the base `3c03287` (each arm read the outcome
with `console.warn`), and `notice-proof`'s new section 6f (`action-refused`) — a `focus-session` notice and a project-setup banner
each naming a regular file, both pressed — went red there on "renderer errors": both arms' `console.warn` lines were relayed
(`capture: renderer console: notice action "focus-session" for proof-refused-session was refused: Could not open the selected
project: …`, and the same for `open-project-init`).

Both arms now hand main's answer to `reportNoticeActionRefusal` (`apps/desktop/src/renderer/notice-action-refusal.ts`), the
hook-review arm's repair: a refusal — `window.gone`, `window.notMain` — is published as a persistent `warning` notice through
`notice.report`, main's headline the title; a command main never answered is said as "The application did not answer"; a refused
reach coded `workspace.openFailed` / `workspace.buildFailed` is only logged at `info`, `MainWindows.#addWindow` having said
REQ-SHELL-019's "Could not open the selected project: …" in the pressing window. Pinned by `notice-action-refusal.test.ts` (the
two arm-wiring cases, and three cases publishing the two arms' own refusal words) and by `notice-proof` section 6f, green after:
main logs both reaches refused, REQ-SHELL-019's report stands once per press as the pressing window's acknowledgement, nothing is
published a second time by the renderer, and no renderer console line is relayed. Sections 6c, 6d and 6e, which press the same
arms where main carries them out, stayed green.

`window.gone` and `window.notMain` are not reached deterministically by a press in the built app (the reached window would have to
close between the reach and the request; a press comes from a main window, so one is open), so those two are pinned by the unit
cases alone.

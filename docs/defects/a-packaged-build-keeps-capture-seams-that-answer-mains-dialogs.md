## A packaged build keeps capture seams that answer main's dialogs

Main reads a set of verification seams behind the run-time test that `ROTARIS_CAPTURE_PNG` is set (`capturing`) and not
behind the build-time flag `__ROTARIS_SEAMS__`, so a build with `ROTARIS_BUILD=package` keeps them, and `scripts/package.mjs`
keeps `ROTARIS_CAPTURE_PNG` on purpose. With two variables set in the application's environment, a packaged build then:

- presses "Allow these hooks" in the hook review dialog (`ROTARIS_CAPTURE_HOOK_REVIEW`, `_HOOK_REVIEW_MS`,
  `ROTARIS_CAPTURE_REVIEW_PNG`) — a workspace's hooks trusted without the user's choice (REQ-HOOKS-104..107);
- answers the pause window (`ROTARIS_CAPTURE_PAUSE_ANSWER`) and every message box (`ROTARIS_CAPTURE_ANSWERS`);
- answers the backup, restore, export, directory and skill-file dialogs with a path it names (`ROTARIS_CAPTURE_BACKUP_TO`,
  `_RESTORE_FROM`, `_SAVE_PATH`, `_DIRECTORY`, `_SKILL_FILE`);
- fills the provider dialog (`ROTARIS_CAPTURE_PROVIDER_FILL`, `_PROVIDER_EMPTY_OK`), swallows an external link
  (`ROTARIS_CAPTURE_OPEN_EXTERNAL` in `commands/shell.ts` and `commands/workspace.ts`), forwards a stale question answer
  (`ROTARIS_CAPTURE_QUESTION_STALE`, `commands/session.ts`) and delays or holds a subscription (`_SUBSCRIBE_DELAY_MS`,
  `_SUBSCRIBE_HOLD_MS`), and sets the theme, the scale and the network capture (`_THEME`, `_SCALE`, `ROTARIS_CAPTURE_NET` in
  `main-windows.ts`).

The seam check in `package.mjs` names none of them, so the build passes with them inside. Noticed 2026-10-13 by plan fin42
while repairing the approval dialog's own seam the same way
([`fixed/the-approval-dialogs-scripted-answer-survives-a-packaged-build.md`](fixed/the-approval-dialogs-scripted-answer-survives-a-packaged-build.md));
not repaired here. The list was read from the source (`grep -rn "process.env\['ROTARIS_CAPTURE_" apps/desktop/src/main`),
not from a packaged artifact.

## Specs

- ADR-0056's fourth execution: the scriptable seams are compiled out of a packaged build behind `__ROTARIS_SEAMS__`, and a seam
  "switched off" by an environment variable at launch is not absent. The process view says main's verification seams are
  compiled in only where the flag is true.
- REQ-HOOKS-104..107 (the hook review is the user's choice), for the first item.

## Relevant files

- `apps/desktop/src/main/index.ts` — `capturedTheme`, `captureScale`, the pause window's answer, the provider dialog's fill,
  `openHookReview`'s scripted press, `scriptedAnswers`, `chooseSave`, `scriptedSavePaths`, the restore, directory and
  skill-file choosers.
- `apps/desktop/src/main/commands/shell.ts`, `commands/workspace.ts`, `commands/session.ts`, `main-windows.ts` — the others.
- `apps/desktop/scripts/package.mjs` — the seam check's `forbidden` list.

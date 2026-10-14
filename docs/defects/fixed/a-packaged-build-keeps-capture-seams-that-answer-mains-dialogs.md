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
([`the-approval-dialogs-scripted-answer-survives-a-packaged-build.md`](the-approval-dialogs-scripted-answer-survives-a-packaged-build.md));
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

## Outcome — repaired 2026-10-14 (fin43, `fin43-crash-and-seams`)

Every read the note lists now carries `__ROTARIS_SEAMS__` on its own line, the shape fin42 gave the approval seam:
`capturedTheme`, `captureScale`, the resume timing, the pause window's answer, the provider dialog's fill and its
`_PROVIDER_EMPTY_OK`, `openHookReview`'s `scriptedReview`, `_HOOK_REVIEW_MS` and `_REVIEW_PNG`, `scriptedAnswers` (now behind
`capturing` as well, where its only use already was), `chooseSave`, `scriptedSavePaths`, the restore and directory choosers and
`scriptedSkillFiles` in `apps/desktop/src/main/index.ts`; `_NET` in `main-windows.ts`; `_OPEN_EXTERNAL` in `commands/shell.ts`
and `commands/workspace.ts`; `_QUESTION_STALE`, `_SUBSCRIBE_DELAY_MS` and `_SUBSCRIBE_HOLD_MS` in `commands/session.ts`. A
packaged build folds the flag to `false` and rollup drops each read with its variable's name. One doc comment that named
`ROTARIS_CAPTURE_ANSWERS` survived into the bundle (a `/** */` comment is kept) and is now a block comment. `vitest.config.ts`
defines `__ROTARIS_SEAMS__` as `true`, the ordinary build's value, so the command tests that drive these seams run them as
before.

The seam check's lists moved to `apps/desktop/scripts/lib/seam-check.mjs` (`package.mjs` calls `seamCheck`), and the
`forbidden` list names every one of them, plus `ROTARIS_CAPTURE_PROJECT_FOLDER`, read behind the flag but never named.

Pinned by:
- `apps/desktop/src/main/capture/seam-reads.test.ts` — every line of main's source (outside the flag-only `capture/seams.ts`
  and `capture/theme-proof.ts`, and the packaged probe's `capture/probe.ts`) that reads a capture variable other than `_PNG` or
  `_PROMPT` carries the flag. Red on the unrepaired source with 22 lines named, the twenty-two reads above.
- `apps/desktop/scripts/lib/seam-check.test.ts` — every variable main, the run host or the workspace service reads behind the
  flag is covered by the `forbidden` list, and none the probe keeps is; `seamCheck` reads a chunk as well as `index.js`.

Measured on the artifact: `ROTARIS_BUILD=package pnpm exec electron-vite build` in `apps/desktop` before the repair left 20 of
the note's names in `out/main/index.js` (`grep -rhoE "ROTARIS_CAPTURE_[A-Z0-9_]+" out/main`: `_ANSWERS`, `_BACKUP_TO`,
`_DIRECTORY`, `_HOOK_REVIEW`, `_HOOK_REVIEW_MS`, `_NET`, `_OPEN_EXTERNAL`, `_PAUSE_ANSWER`, `_PROVIDER_EMPTY_OK`, `_PROVIDER_FILL`,
`_QUESTION_STALE`, `_RESTORE_FROM`, `_RESUME`, `_REVIEW_PNG`, `_SAVE_PATH`, `_SCALE`, `_SKILL_FILE`, `_SUBSCRIBE_DELAY_MS`,
`_SUBSCRIBE_HOLD_MS`, `_THEME`); after it, none, and `node apps/desktop/scripts/lib/seam-check.mjs` over that `out/main` reads
`seam check: PASS` (12 files). The ordinary `pnpm build` still carries them, and `notice-proof` (the hook review's scripted
press) and `part-j-proof` (the message boxes' and the pause window's answers) drive them in the built app. `pnpm package` itself
was not run (its electron-builder lane is the release lane R-071 deferred).

**Found at review (2026-10-14), repaired in the same bundle:** two more of main's seams, of the class this note describes but
not named `ROTARIS_CAPTURE_*`, so neither its list nor the first form of the tests saw them, and the same seam-free build
still carried both: `ROTARIS_ROWS_PROOF` (`loadMainWindow` in `apps/desktop/src/main/index.ts`, read behind `capturing` alone,
which loads the main window as the rows proof's renderer role instead of the application) and `ROTARIS_INIT_TEST_TASK`
(read with no test at all, which registers a verification setup task, a consent one included, into REQ-WORKSPACE-080's
registry; its `/** */` comment, which names it, is now a block comment). Both now carry the flag on their line and are named
by the `forbidden` list; `seam-reads.test.ts` holds every `ROTARIS_*` read in main but ADR-0059's `ROTARIS_CIRCUIT_BREAKER`
to the flag (red on those two lines before), and `seam-check.test.ts` holds every flagged `ROTARIS_*` read to the list. A
`ROTARIS_BUILD=package` build then carries neither name, and `node apps/desktop/scripts/lib/seam-check.mjs` reads `PASS`.

Still in a packaged build, outside this note's list and recorded apart: the packaged probe's own `_WAIT` (whose `js:` form
evaluates an expression in the renderer), `_PROBE`, `_END_VIEW` and `_PROMPT_MS`, and the children's `_SKILLS_HOME` and
`_INSTRUCTIONS_HOME`, read with no guard at all
([`a-packaged-build-still-answers-capture-variables-beyond-the-probes-three.md`](a-packaged-build-still-answers-capture-variables-beyond-the-probes-three.md); repaired 2026-10-14 by fin44).

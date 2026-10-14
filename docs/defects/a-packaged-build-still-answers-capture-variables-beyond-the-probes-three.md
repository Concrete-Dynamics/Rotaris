## A packaged build still answers capture variables beyond the probe's three

`apps/desktop/src/main/capture/probe.ts` states that a packaged build keeps "exactly these three names and none of the
scriptable ones" — `ROTARIS_CAPTURE_PNG`, `_PROMPT`, `_AFTER_MS` — and that "nothing here may be scripted from outside beyond
those"; `scripts/package.mjs`'s packaged launch sets those three alone and deletes every other `ROTARIS_CAPTURE_*`. A
`ROTARIS_BUILD=package` build (`pnpm exec electron-vite build` in `apps/desktop`) of `fin43-crash-and-seams`, after main's
dialog answers were put behind `__ROTARIS_SEAMS__`
([`fixed/a-packaged-build-keeps-capture-seams-that-answer-mains-dialogs.md`](fixed/a-packaged-build-keeps-capture-seams-that-answer-mains-dialogs.md)),
still carries, by `grep -rhoE "ROTARIS_CAPTURE_[A-Z0-9_]+" out/main`:

- in `index.js`, from `probe.ts`'s `installFinish` and `installPromptSeam`: `ROTARIS_CAPTURE_WAIT` (whose `js:<expression>` form
  evaluates an expression the environment supplies in the main window's renderer, polled until it answers truthy — what
  `ROTARIS_CAPTURE_EVAL_AT` does, which the seam check forbids), `_WAIT_MS`, `ROTARIS_CAPTURE_END_VIEW` and `_END_VIEW_MS` (a
  Ctrl+<n> sent into the window), `ROTARIS_CAPTURE_PROBE` (the matched elements' text, values and `data-*` attributes written to
  the log) and `_PROMPT_MS`. Each takes effect only in a launch that also sets `ROTARIS_CAPTURE_PNG`.
- in `run-host.js` and `workspace-service.js`: `ROTARIS_CAPTURE_SKILLS_HOME` and `ROTARIS_CAPTURE_INSTRUCTIONS_HOME`
  (`apps/desktop/src/run-host/host.ts`, `apps/desktop/src/workspace-service/index.ts`), read with no flag and no `capturing`
  test at all, so with either set a packaged build discovers user-scope skills and home-relative instruction files under the
  directory it names instead of the user's home, and injects what it finds into the agent's context.

The seam check's `forbidden` list (`apps/desktop/scripts/lib/seam-check.mjs`) names none of them, so the check passes. Noticed
2026-10-14 by fin43 while repairing main's dialog answers; recorded, not repaired: outside that bundle's task. Whether the
packaged probe needs `_WAIT`, `_PROBE` or `_END_VIEW` is for the repair to establish: the packaged launch in
`package.mjs` sets none of them.

## Specs

- ADR-0056's seam check and the process view (main's row): the scriptable seams are compiled out of a packaged build behind
  `__ROTARIS_SEAMS__`, and only the packaged probe's three variables survive; `probe.ts`'s own header says the same.
- PD-WORKSPACE-002 (the home-relative instruction bases) and the user-scope skill roots: discovery reads the user's home, which
  in a packaged build an environment variable can redirect.

## Relevant files

- `apps/desktop/src/main/capture/probe.ts` — `installFinish`'s `_WAIT`, `_WAIT_MS`, `_END_VIEW`, `_END_VIEW_MS`, `_PROBE`, and the
  prompt's `_PROMPT_MS`.
- `apps/desktop/src/run-host/host.ts` — the skill host's `home` from `_SKILLS_HOME` or `_INSTRUCTIONS_HOME`.
- `apps/desktop/src/workspace-service/index.ts` — `instructionEnv`'s `home` from `_INSTRUCTIONS_HOME`.
- `apps/desktop/scripts/lib/seam-check.mjs` — the `forbidden` list that names none of them.

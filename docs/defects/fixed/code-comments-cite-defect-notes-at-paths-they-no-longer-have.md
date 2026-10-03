## Code comments and proof scripts cite defect notes at paths they no longer have

Comments in product code, tests and proof scripts cite defect notes by their path, and several of those notes have since
been repaired and moved to `docs/defects/fixed/` (or were never at the cited path), so the pointers are dead.
`tools/check-record-links.mjs` reads the record's Markdown links only, so nothing catches a path in a `.ts`, `.tsx` or `.mjs`
file. Found on 2026-10-03 by plan fin12 while repairing the same shape in `live-run.mjs`
([live-runs-notes-cite-defect-notes-at-paths-they-no-longer-have.md](live-runs-notes-cite-defect-notes-at-paths-they-no-longer-have.md)),
by searching every `docs/defects/….md` path under `apps/`, `packages/` and `tools/` for one that does not exist; not repaired
here (outside that task).

Cited at a path that does not exist (file:line on fin12's branch, cut from origin/main c69f351); every note but two now lives
in `docs/defects/fixed/`, and `settled-reasoning-row-counts-forever.md` and `group-header-claims-the-role-gutter.md` are in
neither directory:

- `apps/desktop/scripts/lib/model-traffic.mjs:205`, `apps/desktop/scripts/lib/model-traffic.test.ts:199`:
  `single-retry-stream-stall-aborted-a-76-minute-run.md`.
- `apps/desktop/scripts/lib/proof-isolation.test.ts:5`: `proof-isolation-is-windows-only-so-a-driven-run-writes-the-users-real-data-directory.md`.
- `apps/desktop/scripts/sandbox-proof.mjs:181`, `packages/contracts/src/config.ts:72`: `settings-surface-refuses-the-six-security-keys.md`.
- `apps/desktop/scripts/transcript-proof.mjs:232, 489`, `packages/ui/src/transcript/TranscriptPane.tsx:143`,
  `packages/ui/src/transcript/cache.ts:176`, `packages/ui/src/transcript/transcript.test.ts:292`: `live-rows-are-never-measured.md`.
- `apps/desktop/src/main/initialization.test.ts:1243`: `a-setup-that-finishes-before-its-start-is-answered-is-never-seen-to-finish.md`.
- `apps/desktop/src/run-host/mcp.ts:115`, `packages/config/src/init/classify.ts:18`: `classification-decided-by-the-runtimes-extension-list.md`.
- `packages/contracts/src/initialization.ts:134`, `packages/ui/src/composer.ts:338`: `two-requirements-fix-the-composer-setup-refusal-differently.md`.
- `packages/ui/src/transcript/Row.tsx:253`: `settled-reasoning-row-counts-forever.md`; `Row.tsx:357`: `group-header-claims-the-role-gutter.md`.
- `packages/ui/src/transcript/pool.ts:166`: `role-gutter-truncation-rule-is-inert.md`.

## Specs

None: pointers into the record. `docs/defects/README.md` has every link to a moved note's old path move with it; these
are not Markdown links, so the moves left them behind.

## Relevant files

- The files listed above, each at its line.
- `tools/check-record-links.mjs`: the record's link check, which reads no code. A check over code comments (as
  `apps/desktop/scripts/lib/live-run-defect-citations.test.ts` does for `live-run.mjs` alone) would hold the rest.

## Repaired 2026-10-03

Every pointer the list names now names the note where it lives (plan fin13, at origin/main `8850ea2`, where the lines
were as listed above give or take a line): the moved notes are cited under `docs/defects/fixed/`, and one more pointer
of the same shape the list did not name, `packages/ui/src/shell.css` (`role-gutter-truncation-rule-is-inert.md`), moved
with them. The two notes in neither directory were deleted when repaired, under the convention before
`docs/defects/fixed/` existed; neither has a successor note. `group-header-claims-the-role-gutter.md` is recorded by the
first-executions row of 2026-09-15 ("the repair of `group-header-claims-the-role-gutter.md` (a defect note, removed once
repaired)"), so `Row.tsx`'s falsified-reason comment now points there; `settled-reasoning-row-counts-forever.md` is named
nowhere else in the record, so `Row.tsx`'s reasoning-summary comment drops the path and says the note was removed once
repaired.

`tools/check-record-links.mjs` gained a second pass, run by `pnpm lint` with the first: every `docs/defects/….md` path
in a source, style, markup or data file under `apps/`, `packages/` and `tools/` (skipping dot-directories, `node_modules`
and build output) must name a note that exists, wherever it stands — comment, test, or a line a proof prints. Against the
tree before the repointing it failed on nineteen paths, the list above plus `shell.css`.

Evidence: `tools/check-record-links.test.ts`, three cases over a fixture, each red without the pass — a comment citing a
note at its pre-`fixed/` path fails with its file, line and path and passes once it follows the note; a path is read in a
printed string and a style sheet, and only a whole note name; the walk covers `apps/`, `packages/` and `tools/` and skips
build output, installed packages and everything outside those roots. `node tools/check-record-links.mjs` on the repaired
tree reports every path present.

**Amended 2026-10-03 (fin13's repair round).** The pass as first built read a path only when it reached `.md` on its
own line, so the claim above that it held "the rest" was true only of pointers written whole. Its verifier found four
that a comment wraps or abbreviates; the stricter pass found thirteen — eleven wrapped onto the next comment line, at a
hyphen or right after `docs/defects/` or `docs/defects/fixed/` (`about.ts`, `workspace-proof.mjs`, `sandbox-proof.mjs`
twice, `code-intel-proof.mjs`, `platform/src/dirs.ts`, `render-bwrap.ts`, `terminal.test.ts`, `tools.test.ts`,
`files.ts` twice), and two abbreviated with `…` (`transcript-proof.mjs`, `TranscriptSurface.tsx`). All thirteen
resolved, so none was dead, but none would have been seen had its note moved. The pass now fails a `docs/defects/` path
that does not complete on its line or names a note only in part (`partialDefectPaths`), leaving the directory itself and
a `….md` or `*.md` placeholder alone; the thirteen, and two pointers of the same kind the pass does not fail
(`report.ts`, `transcript.test.ts`), are written whole on one line. Evidence: a fourth case in
`tools/check-record-links.test.ts`, red without the change (a path wrapped at a hyphen, one wrapped at the slash, and two
abbreviated each fail with their line; the same pointer written whole passes), and a fifth that leaves directories and
placeholders alone; `node tools/check-record-links.mjs` reports 496 paths in 1,108 code files, every one whole and
present.

Not changed: prose in the record that names a note at a path it no longer has, inside inline code rather than a link (the
first pass reads links only); recorded as its own note,
[the-records-prose-names-defect-notes-at-paths-they-no-longer-have.md](../the-records-prose-names-defect-notes-at-paths-they-no-longer-have.md).

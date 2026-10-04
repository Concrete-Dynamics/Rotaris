## The record's prose names defect notes at paths they no longer have

The record cites some defect notes by their repository path written as inline code rather than as a Markdown link, and
`tools/check-record-links.mjs` reads links only, so a note moved to `fixed/` left these behind. Found 2026-10-03 by plan
fin13 while giving the link check a pass over the code
([code-comments-cite-defect-notes-at-paths-they-no-longer-have.md](code-comments-cite-defect-notes-at-paths-they-no-longer-have.md)),
by searching `docs/`, `AGENTS.md`, `CLAUDE.md` and `CONTEXT-MAP.md` at origin/main `8850ea2` for a defect-note path that
does not exist; not repaired there (outside that task).

Some of these are deliberate history and should stay as they are: a repaired note saying where it, or a note it
describes, stood when written (the first three below), and a struck-through passage. The rest read as live pointers.
Which is which is a reader's judgement, which is why no check covers prose yet. Each path below is under the defects
directory, without `fixed/`:

- `defects/fixed/the-create-guard-tells-an-agent-it-read-a-file-its-sibling-wrote.md:25` — `two-writing-children-in-one-checkout-collided.md`.
- `defects/fixed/the-two-driven-transcript-proofs-are-red-on-main.md:109` — `one-readers-scroll-can-be-taken-for-the-panes-own.md`.
- `defects/fixed/the-in-projection-scope-filter-is-never-reached.md:60` — `the-two-driven-transcript-proofs-are-red-on-main.md`.
- `defects/fixed/live-runs-notes-cite-defect-notes-at-paths-they-no-longer-have.md:5–6` — the two old paths that note
  repaired (deliberate: it quotes them).
- `product/requests.md:77` — `live-rows-are-never-measured.md`, `role-gutter-truncation-rule-is-inert.md`; `:102` —
  `win32-terminal-edge-cases-bounced-to-the-agent.md`; `:104` — `a-mid-session-switch-to-autonomous-does-not-reach-agents-built-later.md`
  (the request log is the orchestrator's to edit, not a workflow agent's).
- `architecture/first-executions.md:136` — `the-diff-e2e-times-out-before-git-answers.md`.
- `architecture/views/03-runtime-view.md:1262` — `a-background-runs-non-failure-ending-raises-its-summary-not-a-notice-naming-the-session.md`
  (inside a struck-through passage).
- `architecture/owner-decisions.md:1526` — `configured-per-token-prices-take-no-effect.md`; `:1542` —
  `a-delegated-childs-provider-requests-never-reach-the-runs-totals.md`.
- `architecture/adr/0031-money-as-exact-decimal.md:123` — `configured-per-token-prices-take-no-effect.md`.
- `architecture/adr/0064-the-project-initialization-registry.md:119` — `classification-decided-by-the-runtimes-extension-list.md`.
- `architecture/adr/0065-the-retrospective-pass.md:189, 193, 196` — `a-session-delete-leaves-its-plan-cycles-behind.md`,
  `the-start-session-dialog-accepts-and-creates-nothing.md`, `the-start-session-dialog-does-not-fit-the-minimum-window.md`.

## Specs

None: pointers into the record. `docs/defects/README.md` has every link to a moved note's old path move with it; these
are not links, so the moves left them behind.

## Relevant files

- The files listed above, each at its line.
- `tools/check-record-links.mjs` — reads the record's Markdown links and, since fin13, the code's defect-note paths; it
  reads no path written as prose in the record.

## Outcome — repaired 2026-10-04 (fin15)

**Confirmed on the branch first:** `tools/check-record-links.mjs`, given a third pass over the record's inline code before
any pointer was touched, failed fourteen paths outside the request log, exactly the list above (the runtime view's at line
1265, where its code span sits), and passed nothing else.

- **The eight live pointers now name the note where it lives**, under `fixed/`: `architecture/first-executions.md:136`,
  `architecture/owner-decisions.md:1526` and `:1542`, `architecture/adr/0031-money-as-exact-decimal.md:123`,
  `architecture/adr/0064-the-project-initialization-registry.md:119`, and
  `architecture/adr/0065-the-retrospective-pass.md:189`, `:193`, `:196`. Every target exists. ~~The search found no live
  pointer the note had not listed.~~ *Corrected at its verification (below): the search read only the root form, and two
  live pointers written relative to their file had been missed.*
- **The six deliberate historical paths stay as written** and each now carries a mark on its own line,
  `<!-- historical-path: <the path> -->`, which does not render: the three repaired notes quoting where a note stood
  (`the-create-guard-…:25`, `the-two-driven-transcript-proofs-…:109`, `the-in-projection-scope-filter-…:60`), the two
  old paths `live-runs-notes-cite-…` quotes (`:5`, `:6`), and the struck-through passage in
  `architecture/views/03-runtime-view.md:1265`.
- **The request log is left alone**, as it is the orchestrator's to edit. Its four stale pointers (`product/requests.md:77`,
  two paths, `:102` and `:104`; every target now under `fixed/`) are handed to the orchestrator, and the new pass does not
  read that file: `PROSE_EXEMPT` in the check names it with the reason, and the check's own failure text repeats it.
- **The check reads these pointers now** (`prosePointers`, `checkProseFile`, `checkProse` in `tools/check-record-links.mjs`,
  run by `pnpm lint` after the two earlier passes): every `docs/defects/….md` path in an inline code span of a record
  file (`docs/`, `AGENTS.md`, `CLAUDE.md`, `CONTEXT-MAP.md`, and the `packages/**/CONTEXT.md` glossaries the first pass
  also reads) must name a note that exists, unless a mark on its line names it. A mark is checked as well: one naming
  no path written as inline code on its line, or a path a note is at, fails, so it can neither outlive its line nor hide
  a live pointer. Fenced code and HTML comments are skipped. ~~A path in another form (relative, or bare, without
  `docs/defects/`) is still read only where it is a Markdown link.~~ *Corrected at its verification (below): the
  relative form is read too; a bare name still is not.*

Pinned by five cases in `tools/check-record-links.test.ts` over a fixture on disk (red before the pass existed): the
stale path in a sentence and in a link's text, and its repair; a mark keeping only the path it names on its own line; a
mark on a live path; fenced code, a comment, a mark shown as code and a code span that wraps a line; and the walk
reading every record file but the request log. `docs/defects/README.md` and `docs/architecture/codebase.md` describe
the pass; [first-executions](../../architecture/first-executions.md) carries its row.

### Corrected at its verification — 2026-10-04 (fin15, repair round)

The outcome's "the search found no live pointer the note had not listed" was false: the search and the pass read only
the root form, `docs/defects/….md`, and the record also writes a note's path relative to its own file. Two such live
pointers still named their notes at pre-`fixed/` paths and now name them where they live, each relative to its file:
`architecture/first-executions.md:149`, the 2026-09-27 release-guard row
(`docs/defects/fixed/a-prerelease-version-reaches-the-installer-hyphenated.md`), and
`architecture/open-questions.md:3020`, item (f) (`docs/defects/fixed/slash-proof-expects-every-built-in-to-carry-the-action-badge.md`).

- **The pass reads the relative form now** (`relativeDefectPointers` in `tools/check-record-links.mjs`): a path of one or
  more `../` followed by `defects/` and a name ending `.md`, under `fixed/` or not, written as inline code, resolved from
  the directory of the file it stands in. Run before the edits below, it failed exactly ten paths in five files.
- **Eight of them are history kept on purpose** and carry a mark on their line: `architecture/adr/0005-the-session-lock-as-capability-token.md:673`
  and `architecture/adr/0054-packaging-artifacts-and-self-update.md:1157`, each of which says beside the path that the
  note is now under `fixed/`, and the six paths `record-links-still-name-defect-notes-at-their-pre-fixed-paths.md`
  quotes at its lines 19 to 25 (the repaired note listing what was stale when it was written).
- **Left out on purpose, and said so in the check's own text:** a bare note name, and a `./`, `fixed/…` or `../<name>.md`
  path between two notes, none of which says it is a defect note's path; those are still read only where they are a
  Markdown link (the first pass).

Pinned by a sixth case in `tools/check-record-links.test.ts`, "reads a path written relative to its own file …", over a
fixture (red without `relativeDefectPointers`). The check now reads 243 prose paths and keeps 14 by a mark. The request
log has no stale pointer in the relative form; its four root-form ones (`product/requests.md:77`, `:102`, `:104`) are
still the orchestrator's to repoint.

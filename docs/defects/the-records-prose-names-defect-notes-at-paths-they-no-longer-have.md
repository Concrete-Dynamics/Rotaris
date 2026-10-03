## The record's prose names defect notes at paths they no longer have

The record cites some defect notes by their repository path written as inline code rather than as a Markdown link, and
`tools/check-record-links.mjs` reads links only, so a note moved to `fixed/` left these behind. Found 2026-10-03 by plan
fin13 while giving the link check a pass over the code
([code-comments-cite-defect-notes-at-paths-they-no-longer-have.md](fixed/code-comments-cite-defect-notes-at-paths-they-no-longer-have.md)),
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

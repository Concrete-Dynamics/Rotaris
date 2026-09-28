## Record links still name defect notes at their pre-`fixed/` paths

Seven relative links in the record resolve to files that do not exist. Six name a defect note at `docs/defects/<name>.md`
after that note was moved to `docs/defects/fixed/` by its repair, which left the links behind — the same slip this
branch's verification caught for its own two notes and repaired. One names an ADR by a filename it never had. (A
`[LICENSE](LICENSE)` at `docs/architecture/open-questions.md` line 3176 also fails to resolve, but it is quoted text
inside an example string, not a link the record means.) Found 2026-09-28 by checking every relative link in the
documents the `fix-config-isolation-decoding` branch touched (R-062), against the branch's merge-base: all seven
predate that branch. Not repaired here; each is a one-target edit, and nothing checks links today, so the next move
of a note into `fixed/` can repeat it.

## Specs

None contradicted. The process in `CLAUDE.md` ("When a noted defect is repaired, move its note to `docs/defects/fixed/`")
and `docs/defects/README.md` implies the note stays findable from what cites it; a dangling link breaks that trail.

## Relevant files

- `docs/architecture/first-executions.md` line 121: `../defects/platform-parameterised-helpers-read-the-host-separator.md`
  and `../defects/staging-failure-escapes-the-replacement-ladder.md` (both now under `fixed/`).
- `docs/architecture/first-executions.md` line 130: `../defects/a-chip-option-announces-its-label-and-hint-as-one-word.md` (under `fixed/`).
- `docs/architecture/first-executions.md` line 136: `adr/0027-model-client.md` (the file is `adr/0027-the-model-client-implementation.md`).
- `docs/architecture/first-executions.md` line 137: `../defects/a-childs-payload-puts-the-artifact-blocks-before-the-workspace-root.md` (under `fixed/`).
- `docs/product/directives.md` line 867: `../defects/a-chip-option-announces-its-label-and-hint-as-one-word.md` (under `fixed/`).
- `docs/product/directives.md` line 982: `../defects/a-delegated-childs-provider-requests-never-reach-the-runs-totals.md` (under `fixed/`).

## Repaired 2026-09-28 under R-062

The seven links this note lists are repointed, each target checked to exist: the six defect notes at
`docs/defects/fixed/<name>.md`, and the ADR at `adr/0027-the-model-client-implementation.md`. The `[LICENSE](LICENSE)`
at `open-questions.md` is quoted text and is now written as inline code, so it reads as the example it is and not as
a link.

**The checker.** [`tools/check-record-links.mjs`](../../../tools/check-record-links.mjs) runs in `pnpm lint` beside
`check-request-log.mjs` and `check-directive-register.mjs`. It reads every relative Markdown link (inline and
reference-style) in every `.md` under `docs/`, in `CONTEXT-MAP.md`, `AGENTS.md`, `CLAUDE.md` and every `CONTEXT.md`
under `packages/` — the nested glossaries the context map names as well as the top-level ones — and fails when the
target file or directory does not exist, or when a `#fragment` names no heading (GitHub's slug, repeats numbered) and
no explicit `<a id>` / `{#id}` in the file it points at. Links inside fenced code, inline code and HTML comments are
text, not links, and are skipped. A failure names the file, the line, the link and the reason. Pinned by
[`tools/check-record-links.test.ts`](../../../tools/check-record-links.test.ts) (11 cases): a fixture with one link
to a note at its pre-`fixed/` path and one good heading anchor, the dangling one failing with file, line and target
and the anchor passing; a fragment naming no heading; a same-file fragment; the set of files walked; the three kinds
of code and comment skipped with line numbers kept; the slug rules; a repeated heading and the explicit anchors.

**Its first execution over the whole record** (984 relative links in 361 files) found **51** dangling links, not the
seven this note had by hand — the note's own count was of the documents one branch touched. Every one is repaired
in this commit; by kind:

- **Seven** the note lists (`first-executions.md` lines 121, 130, 136, 137; `directives.md` lines 867, 982).
- **Twenty-one more links to notes at their pre-`fixed/` path**, the same slip in the same files and two others:
  `first-executions.md` (lines 141–154: `the-here-string-check-…`, `hook-faults-reach-only-…`,
  `resilience-proof-cannot-launch-…`, `path-scope-resolves-…`, `an-mcp-tool-offered-…`, `skills-proof-writes-…` ×2,
  `slash-proof-expects-…`), `first-release-plan.md` (lines 47, 48, 147, 152, 305), `directives.md` (lines 1450, 1752,
  1808), and `requests.md` (lines 71, 75, 77 — five links in three rows' disposition cells, repointed and not one word
  of the request changed; the log's own rule protects the words, the date, the classification and the disposition).
- **Twenty-two inside `docs/defects/fixed/` itself**: a note moved into `fixed/` keeps the relative links it was
  written with, and each now needs one more `../`. Fourteen `../product/requests.md#r-nnn` and two
  `../product/directives.md#pd-…` citations in seven notes (`an-mcp-tool-offered-…`, `configured-per-token-prices-…`,
  `live-rows-are-never-measured`, `path-scope-resolves-…`, `role-gutter-truncation-…`, `the-here-string-check-…`,
  `two-writing-children-…`); two `../../tools/check-*.mjs` in `the-directive-registers-count-…`; and four links from
  one fixed note to another still written as `fixed/<name>` or `../<name>` (`model-calls-outside-…`,
  `platform-parameterised-proofs-…`, `resilience-proof-cannot-launch-…`, `the-diff-e2e-times-out-…`,
  `three-proofs-and-the-catalog-tests-…`). `check-request-log.mjs` never saw the fourteen because it reads the
  `#r-nnn` and not the path in front of it.
- **One stale heading anchor**: `views/03-runtime-view.md`'s router still pointed at §7 as `…schemats-v19` where the
  heading reads `v22` — the heading's version moved on and the router's link did not.
- **The `[LICENSE](LICENSE)` example** at `open-questions.md`, made inline code.

What the checker cannot show: that a link points at the *right* existing file (a repointed link that reaches a
namesake would pass), and anchors into non-Markdown files (it does not read those). Reference-style links are read;
autolinks (`<https://…>`) and bare URLs are not links this gate owns.

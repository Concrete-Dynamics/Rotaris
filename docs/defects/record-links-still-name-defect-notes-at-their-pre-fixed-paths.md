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

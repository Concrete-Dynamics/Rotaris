## Guide 09 and the backlog stood at the document budget, so the first ruling of their questions broke it

Found 2026-11-03 while applying the consortium's rulings of OQ-493 to OQ-540 ([R-093](../../product/requests.md#r-093),
R-072). At `origin/main` `83910dc8` the design research corpus held
`docs/research/design/09-accessibility-for-a-dense-desktop-tool.md` at 32,719 bytes and
`docs/research/design/backlog.md` at 32,053, against the 32 KiB (32,768-byte) budget `tools/check-doc-budget.mjs` holds
every record file to in `pnpm lint`. Both files exist to carry what a ruling adds: a dated note under each guide
section-8 item, and the ruling's date and outcome in a backlog row's "Decided by" and "Executes once ruled" cells. Neither
had room for one. Worse, `pnpm archive:migrate` — which a ruling must be followed by in the same commit — repoints every
link to a ruled question from `../../architecture/open-questions/…` to `../../archive/architecture/open-questions/…`, eight
bytes more each; guide 09 links thirteen of its questions, so the migration alone would have taken it to 32,823 bytes,
past the budget, before any note was written. `10-ux-writing.md` stood at 31,099 with ten items to annotate, the same
shape one round later.

## Outcome

Repaired 2026-11-03 in the change that found it, by the budget's own remedy (`docs/README.md`, "The document budget"):
guide 09's and guide 10's section 9 (their references, about 9.4 KiB each) moved verbatim to
`09-accessibility-for-a-dense-desktop-tool/09-references-and-further-reading.md` and
`10-ux-writing/09-references-and-further-reading.md`, each guide keeping the `## 9.` heading
(`tools/check-research-guides.mjs` requires it) with a pointer to the part; and the backlog became an index at its own
path and three parts by rank in `docs/research/design/backlog/`, each part carrying the link definitions its rows use,
rebased one folder deeper. No row, item or reference changed its text. The ruling notes were then written into the room
this made.

## Specs

None in `docs/spec/`. It meets the record's own rule, `docs/README.md` "The document budget" (500 lines, 32 KiB per
document), and the research README's "Keeping it current", which asks a ruled section-8 question to carry its note.

## Relevant files

- `docs/research/design/09-accessibility-for-a-dense-desktop-tool.md`, `docs/research/design/10-ux-writing.md` — the
  guides, now indexes for their section 9; the parts under the folders of the same name.
- `docs/research/design/backlog.md` — the index; `docs/research/design/backlog/01-ranks-1-to-50.md`,
  `02-ranks-51-to-100.md`, `03-ranks-101-to-153.md` — the rows.
- `tools/check-doc-budget.mjs`, `tools/check-research-guides.mjs` — the two gates the split had to satisfy at once.

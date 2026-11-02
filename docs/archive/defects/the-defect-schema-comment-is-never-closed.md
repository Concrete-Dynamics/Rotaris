## The defect schema's comment is never closed

`docs/defects/README.md` holds the note schema inside an HTML comment that opens with `<!--` and ends with a bare `>`
instead of `-->`. CommonMark (and GitHub) end an HTML comment only at `-->`, so the comment runs to the end of the
file. While the file held nothing but the schema, this changed nothing that could be seen. f180732 (R-062) appended a
paragraph after the schema on how a repaired note moves and how the link gate checks it, and that paragraph never
rendered: a reader of the rendered page saw an empty page.

The malformed closer dates from the file's first commit (`eade970`, 2026-09-18). It was noticed
2026-09-28 by the independent verification of the record-hygiene bundle (R-062).

## Specs
None. The file is the record's process schema, not a requirement. `CLAUDE.md` ("Defects noticed along the way") sends
every agent to it for the schema.

## Relevant files
- `docs/defects/README.md` — the schema comment (line 8 held `>`), and the paragraph after it.
- `tools/check-record-links.mjs` — blanks only a *closed* comment (`<!--…-->`). It therefore read the paragraph's link
  as live and checked it, although a renderer would not have shown it. The link resolves, so the gate's result was right.

## Repaired 2026-09-28 under R-062

Line 8 of `docs/defects/README.md` now reads `-->`, so the comment ends after the schema and the paragraph below it
renders. The schema's fields are unchanged. No test pins it, because the file is prose and nothing in the build reads
the comment. The link gate's reading of the paragraph does not change (`node tools/check-record-links.mjs` reads the
same link as before, and it resolves).

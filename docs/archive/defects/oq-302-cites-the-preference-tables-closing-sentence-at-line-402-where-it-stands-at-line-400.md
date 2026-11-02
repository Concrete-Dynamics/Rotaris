## OQ-302 cites the preference table's closing sentence at line 402, where it stands at line 400

OQ-302's ruling paragraph (`docs/architecture/open-questions.md`, the entry's "Ruled 2026-10-14" paragraph) quotes the sentence
that makes REQ-SHELL-006's per-user preference store table closed, and places it "from line 402" of
`docs/spec/12-desktop-shell-windows.md`:

> the table that clause makes closed, from line 402: "every key the product may store is listed here, whatever document owns
> the behavior behind it"

The quoted words stand at line 400 ("This table is the registry REQ-SHELL-006 makes closed: every key the product may store is
listed here, …"). Line 402 is the table's header row (`| Key | Meaning | Default |`). Both lines describe the same table, so the
ruling's meaning is unchanged, but a reader who follows the line number to check the quotation lands two lines below it. The
paragraph's other citations hold: line 27 is REQ-SHELL-006's ownership clause, line 413 is the `display/showReasoning` row and
line 415 the `requirements/` elevation keys' row. Found as a fin45 reviewer's optional finding (retro-and-record, Task 2), which
reports that the consortium's ruling text said "rows from line 400", and carried by fin46's acceptance round 1 (C16, cosmetic).

## Specs

No requirement is contradicted: the record misplaces its own citation of the specification. The citation is of REQ-SHELL-006's
registry table (`docs/spec/12-desktop-shell-windows.md` line 400), in the ruling of OQ-302, which weighs that table against
REQ-CONFIG-405's list.

## Relevant files

- `docs/architecture/open-questions.md` — OQ-302's ruling paragraph, "from line 402: \"every key the product may store …\"".
- `docs/spec/12-desktop-shell-windows.md` — line 400 holds the quoted sentence; line 402 the table's header row.

## Outcome (2026-10-14, fin46 `fin46-accept1-13`, Task 1)

Repaired in the record only; nothing in the product or the specification changed. OQ-302's ruling paragraph now reads "from line
400: \"every key the product may store is listed here, whatever document owns the behavior behind it\"", with a correction beside it
keeping the old "from line 402" and saying what that line holds, and a link to this note. Its other citations (lines 27, 413 and
415) were checked against the specification and stand.

**Pinned by** `tools/open-question-line-citations.test.ts`: it reads the three lines OQ-302 cites inside the preference table (the
quoted sentence, the `display/showReasoning` row and the `requirements/` row) and requires their spacing to be the spacing of the
specification's lines that hold them. It was red on the old citation ("cited the closing sentence +11, stands the closing
sentence +13") and is green on the new one. It pins the spacing, not the absolute line, because a directive's back-pointer added
above the table moves every line of it and would otherwise turn the test red on another change and ask a ruling's history to be
rewritten. No proof or live scenario reads the record; the finding was found by reading, and the test is its check.

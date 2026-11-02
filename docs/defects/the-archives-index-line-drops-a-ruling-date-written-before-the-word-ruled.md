## The archive's index line drops a ruling date written before the word "RULED"

`settledAs` (`tools/archive/migrate.mjs`) writes the state an open question's index line gives (`ruled 2026-09-23`) from
the first settling word the entry carries and the first date in the 200 characters **after** it. The record's
dispositions put the date first: `> **Disposition, 2026-09-23 (R-049). RULED as recommended.**`. For such an entry the
date stands before the word, nothing after it is a date, and the index line reads `ruled` with no date although the entry
has one. The first execution of the whole migration (2026-11-02, hrd2's I3; `docs/architecture/hardening.md` §6) found
three: OQ-21 (`06-specification-questions-1.md`, disposition of 2026-09-23), OQ-63 (`12-specification-questions-7.md`,
2026-09-23) and OQ-64 (the same part, 2026-09-27). A reader of the live part then has to open the archive to learn when
each was ruled, which is what the index line is for.

A repair reads the date in the disposition's own opening as well (the bold that holds the settling word), and re-runs
`pnpm archive:migrate`, which rewrites the index lines and the manifest. Not repaired here: the bundle that found it
records it (`AGENTS.md`, "Defects noticed along the way").

## Specs

None in `docs/spec/`. It falls short of the archive's own rule, `docs/README.md` "The archive": the live file keeps one
index line per moved entry, `- OQ-<n> — <title>; ruled <date>; [archived](…)`.

## Relevant files

- `tools/archive/migrate.mjs` — `settledAs`, the forward-only date window.
- `docs/architecture/open-questions/06-specification-questions-1.md`, `12-specification-questions-7.md` — the three
  index lines that read `ruled` with no date.
- `docs/archive/architecture/open-questions/06-specification-questions-1.md`, `12-specification-questions-7.md` — the
  entries, each with its dated disposition.

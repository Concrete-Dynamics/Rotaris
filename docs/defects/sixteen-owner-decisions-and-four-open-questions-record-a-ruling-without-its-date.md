## Sixteen owner decisions and four open questions record a ruling without its date

The first execution of the whole migration (2026-11-02, hrd2's I3; `docs/architecture/hardening.md` §6) wrote an index
line without a date for twenty settled entries whose own text carries none, so the record cannot say when they were
decided:

- **ESC-1 to ESC-10 and SR-1 to SR-6** (`docs/architecture/owner-decisions/02-escalations.md`,
  `04-structural-rulings-under-the-standing-direction.md`): each entry says `**Decided: …**` and its section heading
  (`## Escalations`, `## Structural rulings under the standing direction`) gives no date, unlike the later sections
  (`## Escalations ESC-11 to ESC-18 — ruled 2026-08-31`). `ruledOn` (`tools/archive/owner-decisions.mjs`) finds none, and
  the index line reads `ruled`.
- **OQ-3, OQ-26 and OQ-27** (`docs/architecture/open-questions/06-specification-questions-1.md`, and their second entries
  in `07-` and `08-specification-questions-…`) say `*Resolved*` and carry no date anywhere; **OQ-11** carries one date
  (2026-09-06), not beside the word that resolves it.

The specification's rounds name these rulings (`docs/spec/README.md`: the structural-ruling round applied SR-1 to SR-3,
and the ruling-application round swept ESC-1 to ESC-21 and SR-1 to SR-9), so a date is recoverable from the round that
applied each, or from the commit that wrote the entry. Not repaired here. The entries now stand in `docs/archive/`, so a
repair is a deliberate edit of the archived entry and its index line followed by `pnpm archive:migrate`, which registers
the edited entry in `docs/archive/manifest.json` (`--check` fails an edit the script has not registered).

## Specs

None. The record states no rule that a ruling be dated; the later escalation sections are dated, and the archive's index
line (`docs/README.md`, "The archive") has a place for the date.

## Relevant files

- `docs/architecture/owner-decisions/02-escalations.md`, `04-structural-rulings-under-the-standing-direction.md` — the
  sixteen undated index lines.
- `docs/archive/architecture/owner-decisions/02-escalations.md`, `04-structural-rulings-under-the-standing-direction.md` —
  the entries.
- `docs/archive/architecture/open-questions/06-specification-questions-1.md`, `07-specification-questions-2.md`,
  `08-specification-questions-3.md` — OQ-3, OQ-11, OQ-26, OQ-27.
- `tools/archive/owner-decisions.mjs` (`ruledOn`), `tools/archive/migrate.mjs` (`settledAs`) — where the date is read.

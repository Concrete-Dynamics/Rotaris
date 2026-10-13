## The views' reconciliation entries pile up in the README the log was split from

On 2026-09-16 the views' reconciliation chain moved out of `docs/architecture/views/README.md` into
`reconciliation-log.md` "so that consulting a view before a change costs a page rather than a chapter". Every change
since has written its entry under the README's "Last reconciled with the code" heading instead: about 350 entries,
2026-09-16 to 2026-10-13, and the README has grown to 2,658 lines (263 KB) while the log still reads "Last reconciled
with the code: 2026-09-16" (last changed in `eade970`). Nothing rules the entries into the README; the maintenance rule
names only the date line, so practice drifted.

Found by the 2026-10-13 survey at `6de2a67` (item N96).

## Specs

- None. `CLAUDE.md` ("Maintain after modifying code") and the README's own maintenance rule.

## Relevant files

- `docs/architecture/views/README.md` — "Maintenance rule"; "Last reconciled with the code"; the closing pointer.
- `docs/architecture/views/reconciliation-log.md` — its preamble and top line.
- `.agents/skills/orchestrated-build/references/repository.md` — Records, the reconciled-date bullet.

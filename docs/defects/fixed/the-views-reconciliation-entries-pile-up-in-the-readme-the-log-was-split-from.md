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

## Repaired — 2026-10-13 (fin41)

The 2,609 lines of entries under the README's "Last reconciled with the code" heading, from the OQ-245 snapshot entry
back to the 2026-09-16 navigation pass, moved verbatim to the top of `reconciliation-log.md` under a "Last reconciled with
the code: 2026-10-13" line, above the log's own 2026-09-16 entry, so the chain reads newest first without a gap. The
README keeps its view table, router, maintenance rule and dated heading, with one pointer to the log (53 lines). Its
maintenance rule's item 2 now says the entry goes to the log and only the date moves here; the log's preamble says when
and why the entries moved; and `.agents/skills/orchestrated-build/references/repository.md`'s Records bullet says the
same (CHANGELOG entry of 2026-10-13). `CLAUDE.md` already names only the README's date and is unchanged.

Checked by comparing the diff: every line removed from the README is added to the log but the two the move rewrote
(the maintenance rule's last line and the closing pointer); `node tools/check-record-links.mjs` resolves every link.

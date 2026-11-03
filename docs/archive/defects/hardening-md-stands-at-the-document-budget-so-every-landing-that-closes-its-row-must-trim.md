## `hardening.md` stands at the document budget, so every landing that closes its row must trim the record to fit

Outcome: repaired on 2026-11-03 by the review of plan hrd2's bundle E1 (`hrd2-type-aware-lint`, R-091), at its rebase onto
`24eda16d`: E1 had three rows of §3.5 to close and main's file had 4 bytes left, so no closure fitted at any length.
`hardening.md` is now the index (its header bullets and a parts table) and the text sits verbatim in
`docs/architecture/hardening/`: §1 and §2, §3, §4 and §5, §6, each a few KiB. The links to §6's anchor name its part.
`tools/check-doc-budget.mjs` holds every part to the budget as it held the whole. The note's point stands that the split
touches the file both plans' bundles edit: a bundle that rebases over it closes its row in the part that holds it, as
the index says.

`docs/architecture/hardening.md` is the plan record of R-091 and R-092: every bundle of plans hrd1 and hrd2 closes its
row there in the commit that lands it (strike-through plus what closed it), and each closing adds bytes. On 2026-11-03
`origin/main` held it at 32,764 bytes, 4 under the 32 KiB budget `tools/check-doc-budget.mjs` holds it to in `pnpm lint`,
after two landings in a row had each met the budget at its rebase and trimmed its own rows to fit (C1's store rows,
`6343f071`; hrd2's I3, whose row 6 had to shed its first-execution summary into
`docs/architecture/first-executions.md`'s row and keep only a pointer). The next landing that strikes a row meets the
same red at its gate, and the record a bundle owes in §6 shrinks to what fits rather than to what it measured.

The budget's own remedy (`docs/README.md`, "The document budget") is a verbatim split into an index at the same path and
parts by section in `docs/architecture/hardening/`, every link to a moved anchor rewritten. That touches the file every
bundle of both running plans edits, so it is the orchestrator's to schedule between landings, not a reviewer's to do
inside one. Not repaired here.

## Specs

None in `docs/spec/`. It meets the record's own rule, `docs/README.md` "The document budget" (500 lines, 32 KiB per
document), and R-092's request that the record an agent loads stay small.

## Relevant files

- `docs/architecture/hardening.md` — the plan record at the budget; §3 to §6 hold the rows the bundles strike.
- `tools/check-doc-budget.mjs`, `tools/doc-budget-baseline.json` — the check and its debt list, which only shrinks.
- `docs/architecture/first-executions/35-the-register-34.md` — the 2026-11-02 row that now carries I3's first-execution
  report in full.

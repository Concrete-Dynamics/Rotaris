## The architecture README's decision index and its record count lag the ADR folder

`docs/architecture/README/13-7-index-of-decisions.md` is the index of [`docs/architecture/adr/`](../architecture/adr/README.md) — one row per record,
with the measurement the record rests on beside it — and its table ends at **ADR-0058**. The folder holds **66
records**; the eight since (`0059` to `0066`, dated 2026-09-05 to 2026-10-26) have no row. The bullet that links the
folder from `docs/architecture/README.md` ("**Decisions:** [`adr/`](../architecture/adr/README.md) — **58 records**, numbered in dependency
order") says the same behind number, and §7's own note about the two records numbered out of order (`0057`, `0058`)
still reads as though `0058` were the last.

Nothing else disagrees: the eight records exist, carry `Status: accepted`, name their origins and dependencies in
their headers, and are cited — by `REQ-*` back-pointers, by other ADRs, by `docs/product/requests.md` and by the proof
registry. The identifier-citation sentence beside the count ("1,214 of them, drawn from a corpus of 4,397") was
re-measured on 2026-09-02 and has not been swept since either, so a reader who trusts the row is reading a figure
older than four of the records that contribute to it.

Seen 2026-11-05 while adding the folder indexes of `docs/` (card 13b951ad): a script that globbed
`docs/architecture/adr/*.md` returned 66 records and every one of them was absent from §7's table, with no row and no
note saying the table is deliberately short. Two more of the record's own indexes were checked at the same time and
are consistent: `docs/README.md`'s "Split on 2026-10-26" table says "32 ADRs in `architecture/adr/` (0002 to 0065)"
in the row that describes the split, which is the state that pass reached and not a claim about the folder now.

**Recorded, not repaired.** The repair is one row per record in §7 — a sweep of eight records' origins, dependencies
and `Evidence:` fields — plus the count in `docs/architecture/README.md` and the citation figure beside it. That is a
sweep of the record by whoever owns the decision index, not an edit to make inside a folder-index change; nothing
here is wrong about what the record *decides*.

## Specs

None. This is a defect of the record's own index: `docs/architecture/README/13-7-index-of-decisions.md` states that it
indexes "every" decision and cannot, and `docs/architecture/README.md`'s "Decisions" bullet asserts "58 records" for a
folder of 66. No requirement, directive or ADR obligation is contradicted, and no product behaviour is affected.

## Relevant files

- `docs/architecture/README/13-7-index-of-decisions.md`: the table, whose last row is `| 0058 |`.
- `docs/architecture/README.md`: the "Decisions" bullet ("58 records") and the note about the two records numbered out
  of order.
- `docs/architecture/adr/`: the 66 records, `0059` to `0066` unreferenced by either file above.
- `docs/architecture/adr/README.md`: the folder index added on 2026-11-05, which lists those eight records so nothing
  in the folder is reachable only by listing it.

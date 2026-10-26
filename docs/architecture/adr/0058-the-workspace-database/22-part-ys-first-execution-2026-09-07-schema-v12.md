# ADR-0058 — The workspace store: machine-local, found by a workspace identifier, and how it is backed up — Part Y's first execution — 2026-09-07, schema v12: the session artifact store

Part 22 of 22 of [ADR-0058](../0058-the-workspace-database.md), which indexes every part.

## Part Y's first execution — 2026-09-07, schema v12: the session artifact store

`REQ-LIBRARY-087` asks for "one full record per artifact together with a metadata entry in an index ordered by creation
time, both kept in the durable store … written together as one indivisible step, so no reader ever finds a record without
its index entry or an index entry without its record".

**The falsified reading, kept beside its replacement.** That sentence was written when artifacts were files, and reads
there as a record document plus a separate index document whose two writes have to be made atomic by hand. On rows it is
**one table row and its DECLARED index**, maintained by the engine inside the same transaction as the insert. There is no
second write to sequence and no window in which one exists without the other, so the requirement's guarantee is a
property of the store rather than of a caller's discipline. `artifacts_by_created (session_id, created_at, id)` IS the
index the requirement names — ordered by creation time, `id` last so `REQ-LIBRARY-097`'s tie-break is total — and
`store.test.ts` asserts the listing's query plan uses it (spike 8's rule).

**What v12 adds.** One table, `artifacts`, keyed `(session_id, id)` with `slug` UNIQUE per session, so
`REQ-LIBRARY-088`'s `-2`, `-3` uniquification is enforced where the rows are rather than trusted to whoever mints one.
`status` carries **no CHECK constraint**: `REQ-LIBRARY-088` forms that set from `REQ-ORCH-112`'s vocabulary plus
`published`, and a constraint would be a second copy that stops widening when that requirement widens — validation lives
with the vocabulary in `contracts/artifacts.ts` (`ARTIFACT_STATUSES = [...REPORT_STATUSES, 'published']`, a derivation
and never a list) and hydration skips a row that fails it (`REQ-LIBRARY-091`). `importance` is a column but never an
input: it is derived at every write from kind and status. `body_file` holds the document's NAME (ADR-0003's note of the
same date), never its content and never a path.

**What the execution found in this record's own decisions: nothing.** Consequence 16's rule — every SQL string in
`dal.ts`, every statement prepared once — held; the DAL declares exactly the statements the requirements permit and no
others, which is how `REQ-LIBRARY-094`'s "everything else stays immutable through every editing surface" is enforced:
**there is no statement that updates a slug, a title, a tag or a source id.** The same discipline as `REQ-SESSION-131`'s
released row. The delete's cascade (Part U's note above) took the new table without a change: `store.test.ts` plants a
row in every table carrying a `session_id` — fourteen now — and asserts each is gone with the session.

**Two defects the execution did find, both outside this record and both repaired here:**

1. **A doubled sentence.** `ArtifactStore.body()` returned its failure already worded as `Could not load artifact: <err>`
   and the inspector, which `REQ-LIBRARY-134` makes responsible for that wording, prefixed it again — the proof's first
   run showed the user "Could not load artifact: Could not load artifact: ENOENT…". The store now returns the reason and
   the surface words it; the proof asserts the doubling cannot come back.
2. **Part U's `artifacts` directory constant**, recorded on ADR-0003.

**Figures (`.artifacts-proof/results.json`, five launches):** a scripted publish through `artifact_write` wrote one row
and one document and appeared in the Library on the next refresh with no restart (0 rows before, 1 after); its sidecar
parsed in a separate node process with a stock YAML parser, carrying `id`, `slug`, `title`, `kind`, `status`,
`created_at`, the source ids and `tags`, with sections `Summary`, `Key Findings` and no empty section and no `edited_at`;
a two-child run materialised exactly two `child_report` artifacts, each with one `artifact_published` timeline entry
whose id is linked back onto the record, and each child was given a `PRIOR SIBLING ARTIFACT INDEX` of one entry with
none elided; an invalid tag refused the publish whole with `REQ-LIBRARY-089`'s wording, leaving 0 rows and 0 files; the
inspector opened on the selected row, took typed characters, saved (`Saved.`), the table's status cell became
`published · edited`, and re-opening the same id re-raised the ONE dialog (`data-raised=2`, one dialog in the DOM); with
the body file deleted underneath a resumed session the record stayed listed and the inspector reported
`Could not load artifact: ENOENT…` with Save disabled.

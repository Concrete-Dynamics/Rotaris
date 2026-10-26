# ADR-0024 — Evidence and audit as append-only tables behind one writer, what the audit's export must prove, and which record may never be exported — Third execution — 2026-09-06, the audit's export (Part U)

Part 8 of 9 of [ADR-0024](../0024-evidence-and-audit-files.md), which indexes every part.

## Third execution — 2026-09-06, the audit's export (Part U)

*Recorded under GD-10.*

**Built and run:** `REQ-SESSION-199`'s export, `packages/engine/src/export.ts` `readRecords`, written by the run host to
the file main's save dialog chose (the `ROTARIS_CAPTURE_SAVE_PATH` seam in a scripted launch). One JSON document with
four top-level keys — `timeline`, `issues`, `metrics`, `permission_audit` — read in **one read transaction**
(`StoreDal.readTransaction`, deferred) so a ring's entries and its header come from one state (consequence 5 above). The
two rings export in the form this record fixed: a header (`cap`, `dropped`, `retained`, `oldest_ordinal`,
`newest_ordinal`, `complete`, `taken_at`) over `entries`, each element the ordinal BESIDE the stored entry. The proof
planted an audit three entries over the cap and had **a separate node process with none of this product's code** parse
the file: four keys; `complete: false`, `dropped: 3`, five thousand contiguous ordinals from 4; `dropped + retained ==
newest_ordinal` and `oldest_ordinal - 1 == dropped` — the arithmetic performed by the reader, not asserted by us. An
issue's `evidence_ref` (`permission_audit#9`) travels as a locator and is not followed. A session with no entries of a
kind exports an empty record of that kind with `complete: true`, never nothing. The metrics document is rebuilt at export
from the row and the three rings (`REQ-SESSION-139`); its `tool_outcomes` buckets are the record's `outcome_kind` when
present, else the four derived; the record kinds this store does not keep (model inputs, context selections, report
validations, memory snapshots) are named as such in `records_kept` rather than counted as zero silently.

**Two readings.** *The entry is decoded into the document, not embedded as text.* Item 1 above says "byte for byte";
`REQ-EVENTS-145` requires the whole file pretty-printed with sorted keys, which no nested byte-string survives. What is
kept is every field of the stored entry, unaltered; a reader compares fields, which is what item 2's "twelve, not
eleven" argument turns on. *The issues record exports from its columns*: the issues table keeps no serialised entry
beside its columns (the write path validates the shape into columns), so `REQ-SESSION-135`'s object is assembled from
them — the same fields, no derivation.

**Found — defect 41.** The `session.start` event carried `workspace` and a boolean `sandboxed`, where `REQ-SESSION-193`
fixes its inventory exhaustively as `task`, `workspace_root`, `persona`, `permission_mode`, `sandbox {enabled,
backend}`, `max_iterations` (with the envelope's `session_id`): "a reader may rely on no other key being present". The
trajectory export (`REQ-SESSION-153`) reads the workspace from that payload and found the promised key absent. The
writer is corrected (`session-writer.ts`, the falsified inventory kept beside it); the exporter reads the old key from
stored histories too, so nothing recorded before this date exports a blank workspace.

**Found — defect 42, REPAIRED 2026-09-06 (schema v10).** `REQ-SESSION-134` fixes the timeline entry's shape with an
`id` (12 hex) and a `severity`; the `timeline` table held neither (`session_id, ordinal, at, name, actor, message,
metadata`), so the record could not yield them and the export carried the ordinal as the entry's position and no
severity. Part U did not take the migration and stated the gap in `export.ts` beside `timelineEntry`; v10 adds the two
columns, every writer mints the id, and the export carries both.

Four things the repair decided, each because leaving it unstated would have been a decision too:

- **Nothing is minted for an entry recorded before v10.** Its `id` stays empty and the export omits the field rather
  than emitting a blank one — `REQ-SESSION-199` requires the identifier for every entry it emits "that has one", and an
  entry whose record never held one has none. An id invented afterwards would be an identifier that names nothing and
  resolves nowhere, which is worse than the absence it hides. The `severity` default is the requirement's own, so an old
  row reads `info` exactly as a new one that names none, and that column needs no such caveat.
- **A severity is written only where a requirement names one.** `REQ-HOOKS-119`'s `hook_run` (warning where the outcome
  carried one), an `issue` entry (the severity of the issue it mirrors, including `REQ-GIT-062`'s restore refusal) and
  `REQ-NOTIFY-268`'s `notice` entry (the notice's own, mapped). Every other entry takes `info`: a severity nothing
  requires would be this writer's judgement about another domain's record, and the vocabulary has no member for "not
  stated" once `info` is the default.
- **The notice severity is mapped, not passed through.** `REQ-NOTIFY-023`'s vocabulary carries `success` and no `debug`;
  `REQ-SESSION-134`'s carries `debug` and no `success`. They are different vocabularies for different records, and the
  map is total only because `REQ-NOTIFY-268` records warnings and errors alone.
- **A second finding, from reading rather than running.** `hook_run` had been carrying its severity as a metadata key,
  because the column did not exist. `REQ-HOOKS-119`'s metadata inventory is closed and never names `severity`, so the
  entry had been shipping a field that requirement does not admit — a defect of the same gap, in the other direction.
  It moves to the column, and `packages/hooks/src/engine.test.ts` now asserts the key's absence so it cannot return.

**The repair was measured, and it found nothing further.** `pnpm sessions-proof` reads `REQ-SESSION-199`'s exported
records back with a stock parser in a separate process: the entry the product wrote carries a 12-hex id and a severity
through the export, and the three entries planted with the pre-v10 column list carry no `id` key at all. `pnpm
notice-proof` reads the store a real run wrote: every entry of that run has an id, no two share one, the advisory's
`notice` entry reads `warning` in the column, and no `hook_run` entry carries `severity` in its metadata. Both passed on
the first run. Recorded because the finding is the absence: a repair that has now been executed held no defect of its own.

**Not built, said so:** `REQ-EVENTS-172`'s JSON-lines export of the history (the event view's, which does not exist);
the sixth of `REQ-SESSION-133`'s ring kinds beyond the three this store keeps.

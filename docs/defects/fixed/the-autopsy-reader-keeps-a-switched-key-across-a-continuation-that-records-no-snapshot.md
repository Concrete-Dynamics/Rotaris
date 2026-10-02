## The autopsy reader keeps a switched key across a continuation that records no snapshot

A mid-run switch of the entry model (`setEntryModel`, REQ-MONITOR-142) is held on that run alone, as `Run.entryOverride`.
A continuation is a new `Run`, so the next run's root starts on its configuration's model. The autopsy reader
(`entryModelKeys`) carries the switched key forward as the configured one instead. When the next
`run_continuation_intent` records no entry model (`config_snapshot: {}`), the reader prints the root on the switched key
for the new run, and a ladder move that the new run's fresh cell ends is read as ending back onto that switched key. A
continuation whose snapshot names the entry model is read correctly, because the snapshot replaces the key.

Both copies' doc comments have stated this as a coarse reading since fin3, and the outcomes of
[the-autopsy-reader-does-not-read-the-roots-automatic-model-fallbacks.md](the-autopsy-reader-does-not-read-the-roots-automatic-model-fallbacks.md)
and
[the-autopsy-reader-reads-a-switch-onto-the-configured-model-as-ending-a-fallback.md](the-autopsy-reader-reads-a-switch-onto-the-configured-model-as-ending-a-fallback.md)
mention it, but no open note recorded it. Recorded 2026-10-02 (fin5, harness-readers, repair round 1) so that open-note
triage sees it. It was read from the code; no live pack holds a snapshot-less continuation after a switch. The moves table
in `apps/desktop/scripts/lib/autopsy-entry-model.test.ts` pins the current reading ("… and the next continuation
recording no entry model ends that move, back to the switched key"), so a repair changes that row.

The reader cannot know the new run's configured model from a snapshot that records none. A repair needs the store to record
it, or the reader to print the key as `undetermined` after such a continuation whenever a switch preceded it.

## Outcome — repaired 2026-10-02 (fin8, ladder-overrides, task 2)

The reader no longer guesses. Both copies of `entryModelKeys` (`packages/engine/src/autopsy.ts`,
`apps/desktop/scripts/lib/autopsy-entry-model.mjs`) remember the entry key the last snapshot naming one recorded
(`snapshotLabel`). A continuation whose snapshot names no entry model, after a switch onto another key than that one,
prints `undetermined` (`ENTRY_KEY_UNDETERMINED`) and leaves the configured key undetermined until a record names one (a
later snapshot, a switch, a ladder move of the root). A move in force ends there, as before. With no such switch, or a
switch back onto the snapshot's own key, the last snapshot's key is kept as before, since either answer gives it. This
holds under either answer to whether a switch reaches the next run, the open question
[an-entry-switch-made-in-a-runs-last-iteration-does-not-reach-a-continuation.md](../an-entry-switch-made-in-a-runs-last-iteration-does-not-reach-a-continuation.md)
raises, and is to be revisited when that is ruled.

The moves table's pinned row ("… back to the switched key") was a switch onto the launch snapshot's own key, which both
readings agree on, so it keeps its expectation and says why. Four new rows in
`apps/desktop/scripts/lib/autopsy-entry-model.test.ts`, run against both copies (a switch then a bare continuation; the
same with a move in force; a later snapshot naming the key again; no snapshot ever), and their twin in
`packages/engine/src/autopsy.test.ts` over a store (`root-model → child-model → undetermined`) pin it, all red before.

## Specs

- None; harness reader. The run's behaviour it misreads is REQ-MONITOR-142 (a switch applies to its run from the next
  iteration) and REQ-SESSION-138 (the launch's configuration snapshot).

## Relevant files

- `packages/engine/src/autopsy.ts` — `entryModelKeys`: `fromSnapshot`'s branch for a snapshot recording no entry model.
- `apps/desktop/scripts/lib/autopsy-entry-model.mjs` — the script's copy.
- `packages/engine/src/run/run.ts` — `entryOverride`, held per `Run`.
- `apps/desktop/scripts/lib/autopsy-entry-model.test.ts` — the row that pins the current reading.

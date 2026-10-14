## A restore's origin write that fails rejects the restore with the staging copy left behind

`restoreStore` (`packages/store/src/restore.ts`) writes `origin.txt` into the staging copy at step 9a, after step 6 has
expanded the artifact and after the run host has closed its store at step 3. That write sat outside step 6's guarded block
and outside the guard the journal write (OQ-266) got on 2026-10-14, so a failed write (a full disk, a refused create) threw
out of `restoreStore` as a rejection: no failure report, no `failSafely`, and `<identifier>.restoring-<n>` left beside the
store. It is the same class [OQ-265](../../architecture/open-questions.md#oq-265) closes for the expansion and the journal:
nothing has been displaced yet, so the store is as it was, and the ruling says such a failure deletes its own staging copy
before it returns. Noted by fin43's reviewer of `fin43-restore-recovery`; it predates that bundle.

## Specs

- `REQ-SESSION-201` — a restore that fails for any reason leaves the store exactly as it was; the failure is reported.
- [OQ-265](../../architecture/open-questions.md#oq-265), ruled 2026-10-13 under R-072 — every failure return that leaves the store
  as it was deletes the restore's own staging copy before it returns.

## Relevant files

- `packages/store/src/restore.ts` — `restoreStore`, step 9a (`ORIGIN_FILE`).
- `packages/store/src/store.test.ts` — the OQ-265 block, beside the journal-write case.

## Outcome

Repaired 2026-10-14 (fin44, `fin44-optional-findings`): step 9a's write sits in its own guard and a throw returns through
`failSafely` as "the restored store's origin could not be written: …", so the store is as it was, the staging copy is
deleted (or listed and named when the delete fails), and no journal is written. Pinned by `store.test.ts`'s OQ-265/OQ-266
block, "an origin.txt that cannot be written (step 9a) …", which feeds a real failure (an artifact whose container carries
a directory at `origin.txt`'s name) and was red on the code before the change (the restore rejected with `EISDIR`).

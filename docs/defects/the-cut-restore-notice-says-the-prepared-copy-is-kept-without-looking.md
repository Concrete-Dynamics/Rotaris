## The cut-restore notice says the prepared copy is kept without looking

When the workspace service's open reverses a restore cut between its two renames (OQ-266), main raises one info notice whose
last sentence reads "The prepared copy is kept at <identifier>.restoring-<n>." The path comes from the journal's staging number
(`recoverCutRestore`, `packages/store/src/recover.ts`), and nothing checks that the copy is still there: a copy deleted by
hand between the cut and the next open (the application was closed; a person tidied the data directory) makes the sentence
false, and the workspace service's log line says the same. Noted by fin43's reviewer of `fin43-restore-recovery`.

## Specs

- [OQ-266](../architecture/open-questions.md#oq-266), ruled 2026-10-13 under R-072 — the open reverses the cut restore and
  tells the user once; the built notice names where the prepared copy is kept.
- No requirement names this sentence; `REQ-SESSION-201`'s restore is the mechanism it reports on.

## Relevant files

- `packages/store/src/recover.ts` — `recoverCutRestore`, which reports `staging` from the journal alone.
- `packages/contracts/src/process-protocol.ts` — `workspace.opened`'s `cutRestore.staging`.
- `apps/desktop/src/main/store-notice.ts` — `cutRestoreNotice`, which writes the sentence.
- `apps/desktop/src/workspace-service/index.ts` — the open's log line, which repeats it.

## A restore at a long store path keeps a displaced store the engine cannot open

The restore keeps the store it replaces under `<identifier>.displaced-<stamp>[.n]` (`asideName`,
`packages/store/src/layout.ts`; step 8 of `restoreStore`, `packages/store/src/restore.ts`), and it stages the artifact
under `<identifier>.restoring-<n>` first (step 6). Both names are longer than the live store's `<identifier>`: the
displaced one by 35 characters (`.displaced-` and a 24-character `fileStamp`), 37 at a counter, and the staging one
(`.restoring-1`) by 12. Nothing checks the length. On Windows the store engine refuses a database path of 252 characters or more (ADR-0058
consequence 18, D11: `unable to open database file` on any statement at 252 to 259 characters, on open at 260 or more,
while Node's own filesystem calls worked at 328 with `LongPathsEnabled` set), so:

- a live store whose `workspace.db` path is 217 to 251 characters long (215 once the aside name takes a counter) works,
  and the copy the restore keeps of it lands at 252 or more, where the product can never open it again; the rename that
  puts it there always succeeds (the record's "230–251" is the range it sampled, not the boundary);
- at 240 to 251 characters the staging store cannot even be opened, and the restore fails at step 6 after the run host
  has closed its connection, leaving the staging copy behind (D5).

Not reachable at the shipped location (96 characters, fixed by construction); reachable with a long account name, a
redirected profile or a junctioned per-user data directory. Recorded in ADR-0058 consequence 18 on 2026-09-03 and
never repaired; no note existed.

## Specs

`REQ-SESSION-201`: the store a restore replaces is kept, and "a restore that fails for any reason MUST leave the store
exactly as it was". A kept store the product cannot open is kept in name only, and a restore that fails at step 6 for a
path it could have measured before it began fails after it has disturbed the run host. The threshold is the engine's,
measured on Windows; no limit is measured on Linux, where the engine opened every length this host could create.

## Relevant files

- `packages/store/src/layout.ts` — `asideName` and `stagingDir`, the two longer names.
- `packages/store/src/restore.ts` — `restoreStore`: the stamp (step 8), the staging open (step 6), no length check.
- `packages/workspace/src/restore.ts` — `assessRestore`, where every refusal is told before anything changes.
- `packages/contracts/src/process-protocol.ts` — `RestoreAssessmentSchema`'s refusal reasons.
- `docs/architecture/adr/0058-the-workspace-database.md` — consequence 18 (D11) and consequence 13.

## Outcome — repaired 2026-10-13 (fin41, `fin41-restore-and-session`)

By a refusal, not a shorter suffix: a live store at 251 characters is one character from the limit, so no name longer
than `<identifier>` avoids it. `restorePathTooLong` (`packages/store/src/restore.ts`) measures the canonical paths the
engine would be handed — the staging store's, and where there is a store to displace the kept one's at the widest name
step 8 can claim — against `storePathLimit` (`packages/store/src/layout.ts`: 251 on Windows, none elsewhere).
`restoreStore` refuses as step `0-path-too-long` before asking anything of the run host; `assessRestore` refuses as
`path-too-long` (a new reason in `RestoreAssessmentSchema`) before any confirmation, and main raises its detail in the
existing "The restore was refused" notice.

Pinned by `packages/store/src/store.test.ts`'s D11 block (215, 230 and 251 refused with nothing changed; 214 proceeds and
its kept store opens; 239 and 240 with nothing to displace; with no limit, the counterfactual, a 230-character store's
kept copy lands at 265) and `packages/workspace/src/workspace.test.ts`'s D11 case; every refusal case red before the
change. Not measured on Windows by this build: the limit is ADR-0058's 2026-09-02 measurement. Reported back in ADR-0058
consequence 18 and in `docs/architecture/first-executions.md`.

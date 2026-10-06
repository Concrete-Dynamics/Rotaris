## The credential lock throws when a lock file cannot be removed

`withLock` in `packages/providers/src/credentials/lock.ts` removes lock files in two places with
`rmSync(lockPath, { force: true })`, and neither is guarded. `force` ignores only a path that does not exist (Node's
`fs.rmSync`); any other refusal is thrown:

- **Reclaiming a dead holder's lock** (the `dead` branch): a stale lock in a folder the account may not write into
  (`EACCES`), or one another process holds open on Windows (`EPERM`/`EBUSY`, an antivirus scanner or an indexer), throws
  out of `withLock`, so `CredentialStore.save`/`delete` and `ProjectSettingsStore.upsertProvider`/`removeProvider` reject
  instead of answering a `Result`.
- **Releasing the lock after the operation** (the `finally`): the same refusal there throws over the operation's own
  result, so a credential that was saved and renamed into place is reported as an exception, and the lock is left
  behind with this process's pid in it (the next operation reclaims it, since the pid is its own).

Noticed on 2026-10-06 (finacc2, acceptance finding A5) while repairing
[the busy headline for a lock file that cannot be created](fixed/the-credential-lock-reports-a-busy-store-when-the-lock-file-cannot-be-created.md).
Recorded, not repaired. Not reproduced: this host runs as root, which `EACCES` does not reach, and has no Windows
sharing violations; the throw is read from the code and from `fs.rmSync`'s documented `force`.

## Specs

- REQ-PROVIDER-152: a lock left by a process that is no longer running "is reclaimed rather than blocking forever"; a
  reclaim that cannot remove the file is neither, and the requirement does not say what it answers (a failure naming
  the lock file, by the same reading as the create failure's).
- REQ-PROVIDER-018: "a write that fails … reports the error"; a write that succeeded is reported as a throw when the
  release fails.
- ADR-0004 / the kernel's `Result` (ADR-0044): failures cross a boundary as a value, never a throw.

## Relevant files

- `packages/providers/src/credentials/lock.ts`: the `dead` branch's `rmSync`, and the `finally`'s `rmSync`.
- `packages/providers/src/credentials/store.ts`, `packages/providers/src/project-settings.ts`: the four writers that
  await `withLock`.
- `packages/platform/src/document.ts`: `discard`, the best-effort removal the document primitive already uses for the
  same shape.

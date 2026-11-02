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
[the busy headline for a lock file that cannot be created](the-credential-lock-reports-a-busy-store-when-the-lock-file-cannot-be-created.md).
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

## Repaired — 2026-10-06 (fin21, bundle `fin21-leftover-notes`)

`withLock` (`packages/providers/src/credentials/lock.ts`) no longer lets either removal throw:

- **Reclaim.** A dead holder's lock the removal refuses is answered at once as a value, code `credential.lock.reclaim`,
  headline `lockNotReclaimed`: "Nothing was changed: the lock file <path>, left by a process that is no longer running,
  could not be removed. <cause>." The operation does not run. This is the reading the note proposed for
  REQ-PROVIDER-152's silence, the same as the create's refusal; it is not the busy headline, since no retry cures it.
- **Release.** The removal is best-effort, as the document primitive's `discard` is: the operation's own result is
  returned (REQ-PROVIDER-018), and a lock left behind carries this process's pid, so the next operation reclaims it as
  its own.

Pinned by `packages/providers/src/credentials/lock.test.ts`, "a lock file that cannot be removed is reported, never
thrown": a dead holder's lock whose removal is refused with `EACCES` (the test mocks `node:fs`'s `rmSync` for the named
path, since this host runs as root) answers `credential.lock.reclaim` naming the lock and the cause, at once; a refused
release keeps the operation's `ok('saved')` and the next `withLock` reclaims and removes the lock; and
`ProjectSettingsStore.upsertProvider` over such a lock answers the failure rather than rejecting. All three were red
before the repair (each rejected with "EACCES: permission denied, unlink …"). Not reproduced against a real refusal:
`EACCES` does not reach root, and a Windows sharing violation needs a Windows host.

**Corrected the same day after the first verification** (fin21's verifier): the reclaim headline said every lock it could
not remove was "left by a process that is no longer running", which was false for two of the three locks it reclaims. A
release the removal refused leaves the lock with this instance's own pid, and a record that names no holder is
reclaimed too. The headline now names whose lock it is: "left by a process that is no longer running", "left by an
earlier credential update of this instance, whose release could not remove it" (followed by "Every credential update
is refused until it is removed.", since an own lock the account cannot remove refuses every later update until it is
gone), or "whose record names no holder". Two cases were added beside the first, both red on the earlier wording: an
own-pid lock ("expected … not to contain 'no longer running'") and an unreadable record ("expected … to contain 'whose
record names no holder'").

Recorded as the reading the build proceeds under, not a gap: a refused removal is answered **at once and never retried**
within the 5 s bound, a transient Windows sharing violation (`EBUSY`, `EPERM` from a scanner holding the file a moment)
included. REQ-PROVIDER-152 gives the wait to a lock a live process holds; a removal the account can never make would
otherwise cost every credential update the whole bound. A user who meets a transient one retries the action. The
comment over `lockNotReclaimed` says so.

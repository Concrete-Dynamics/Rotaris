## The credential lock reports a busy store when the lock file cannot be created

`withLock` in `packages/providers/src/credentials/lock.ts` answers **every** failure of its exclusive create with the
busy headline `LOCK_BUSY` ("The credential store is being updated; try the action again in a moment."), at once and
without waiting. A lock file that cannot be created at all (a regular file standing where the credential directory or
the per-user configuration directory would go, a directory the account may not write into, a full disk) is not a store
being updated, and retrying "in a moment" never succeeds. The real cause survives only in the failure's `detail`.

Noticed on 2026-10-04 (fin17) while tracing the callers of `exclusiveCreate` for
[the document primitive's file-parent repair](the-document-primitive-still-throws-on-a-file-parent-without-parent-creation-and-in-exclusive-create.md):
before that repair such a parent threw out of `withLock`; after it, the throw became this misleading refusal. Recorded,
not repaired; reached only with a damaged per-user profile.

## Specs

- REQ-PROVIDER-152: the busy error is for "a lock that cannot be taken within 5 seconds", conveying that the store is
  being updated and the action can be retried. A lock that cannot be created is neither, and is reported as busy
  immediately, without the bound.
- REQ-PROVIDER-018: a failed write "reports the error"; the headline names a different one.

## Relevant files

- `packages/providers/src/credentials/lock.ts`: `if (!r.ok) return err(failure('credential.lock', LOCK_BUSY, …))` after
  `exclusiveCreate`.
- `packages/providers/src/credentials/store.ts`, `packages/providers/src/project-settings.ts`: the two writers that take
  the lock (credential files, the provider snapshot).
- `packages/platform/src/document.ts`: `exclusiveCreate`, whose refusals (`document.parent`, `document.exclusive`,
  `document.exclusive.write`) carry the real cause.

## Outcome

Repaired 2026-10-06 (finacc2, acceptance finding A5, branch `finacc2-accept1-5`), in
`packages/providers/src/credentials/lock.ts`. Confirmed first on the branch: the five cases below were red on the
unrepaired form, each answering `credential.lock` with `LOCK_BUSY` at once (the clock never advanced).

- **Busy means held.** `LOCK_BUSY` is answered only where `REQ-PROVIDER-152` puts it: a lock that exists, is held by a
  live process and is still held when the 5 s bound runs out.
- **A lock file that cannot be created is reported as that, at once.** Every other refusal of `exclusiveCreate`
  (`document.parent`, `document.exclusive`, `document.exclusive.write`, and `document.exclusive.read` for anything but a
  vanished file) now answers the code `credential.lock.create` with the headline `lockUnavailable(lockPath, cause)`:
  "Nothing was changed: the lock file <path> could not be created. <the platform's headline>.", and the platform's
  detail and cause kept (`REQ-PROVIDER-018`: the failed write reports its own error). No consumer branched on the old
  code: `credential.lock` was read only by the busy test.
- **Found beside it and repaired with it:** a lock released between the create's `EEXIST` and the read of its holder
  (`document.exclusive.read` with `ENOENT`) was refused as busy at once too. It is a lock just released, so it is waited
  on for one poll interval, as a held lock is, and taken on the next attempt, within the same bound.

**Pinned by** `packages/providers/src/credentials/lock.test.ts`: a regular file where the lock's folder would go
(`EEXIST`/`ENOTDIR`, the lock path named, the clock at 0), a folder at the lock's own path (`EISDIR`), a write failure
after the create (`ENOSPC` injected), the provider snapshot's upsert under a regular file (the snapshot lock named),
and the released-meanwhile retry, all five red on the unrepaired form; a held lock still answers `LOCK_BUSY` only after
the bound (green on both forms). No proof reaches this path: it was found by reading the callers of `exclusiveCreate`,
and it needs a damaged per-user profile. The `EACCES` case (a folder the account may not write into) is the same branch
and is not separately tested, since this host runs the tests as root.

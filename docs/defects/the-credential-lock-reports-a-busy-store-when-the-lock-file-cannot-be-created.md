## The credential lock reports a busy store when the lock file cannot be created

`withLock` in `packages/providers/src/credentials/lock.ts` answers **every** failure of its exclusive create with the
busy headline `LOCK_BUSY` ("The credential store is being updated; try the action again in a moment."), at once and
without waiting. A lock file that cannot be created at all (a regular file standing where the credential directory or
the per-user configuration directory would go, a directory the account may not write into, a full disk) is not a store
being updated, and retrying "in a moment" never succeeds. The real cause survives only in the failure's `detail`.

Noticed on 2026-10-04 (fin17) while tracing the callers of `exclusiveCreate` for
[the document primitive's file-parent repair](fixed/the-document-primitive-still-throws-on-a-file-parent-without-parent-creation-and-in-exclusive-create.md):
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

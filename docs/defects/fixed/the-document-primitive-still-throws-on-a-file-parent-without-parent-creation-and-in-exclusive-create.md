## The document primitive still throws on a file parent without parent creation, and in exclusive create

ADR-0004's primitive answers every failure as a `Result`, and two paths in `packages/platform/src/document.ts` still
throw out of it:

1. **The staged file's cleanup under a file parent.** When the target's parent is a regular file and the caller did not
   ask for parent creation, staging fails with `ENOTDIR` and the `catch` calls `rmSync(staged, { force: true })`, which
   itself throws `ENOTDIR` (`force` forgives only a missing path). Both `replaceDocument` and `replaceDocumentSync` then
   throw instead of answering `document.stage` / `document.replace.sync`.
2. **`exclusiveCreate`'s parent.** It calls `mkdirSync(dirname(target), { recursive: true })` before any `try`, so a file
   at the parent's place throws `EEXIST` (or `ENOTDIR` deeper down), the throw the 2026-09-13 correction and its
   2026-10-04 sequel took out of the two replace forms.

Probed on 2026-10-04 (branch `fin15-starter-config-lands`) with a regular file `f` and the target `f/doc`:
`replaceDocument` threw `ENOTDIR`, `replaceDocumentSync` threw `ENOTDIR`, `exclusiveCreate` threw `EEXIST`. Noticed while
repairing [replace-document-sync-throws-when-the-parent-cannot-be-created.md](replace-document-sync-throws-when-the-parent-cannot-be-created.md),
which fixed the parent-creation path only. Recorded, not repaired. Whether a product caller reaches either path with a
file parent has not been traced: the configuration writers and the preference store all ask for parent creation, which
now refuses before staging.

## Specs

- ADR-0004, the write side: "remove the staged file on every failure path", and every failure reported as a `Result`
  (`document.parent`, `document.stage`, `document.replace`, `document.mode`); the cleanup's own throw replaces the
  failure it was cleaning up after.
- REQ-TRACE-061: "On any failure the temporary file SHALL be removed on a best-effort basis"; a cleanup that throws
  over the failure it follows is not best-effort.
- REQ-SESSION-197 / REQ-GIT-128 (exclusive create's users): no requirement asks for the throw.

## Relevant files

- `packages/platform/src/document.ts`: the `rmSync(staged, { force: true })` in the staging `catch` of both replace forms;
  `exclusiveCreate`'s `mkdirSync` before its `try`.
- `packages/platform/src/platform.test.ts`: the primitive's tests; none puts a file at the parent's place without
  `createParent`, or under `exclusiveCreate`.

## Outcome

Repaired 2026-10-04 (fin17, branch `fin17-document-primitive-and-git-view-followups`), in
`packages/platform/src/document.ts`:

- **The cleanup is best-effort.** Every `rmSync(staged, { force: true })` in a failure path is now `discard(staged)`, which
  swallows the cleanup's own refusal, so the failure it follows is the one reported: `document.stage` from
  `replaceDocument` and `document.replace.sync` from `replaceDocumentSync` for `f/doc` under a regular file `f`.
- **Exclusive create's parent is inside the `Result`.** Its `mkdirSync` now sits in a `try` and answers `document.parent`,
  as the replace forms do with `createParent`.
- **Found beside it and repaired with it:** a write that fails after the exclusive create (a full disk) threw out of
  `exclusiveCreate`'s `try`/`finally`; it now answers `document.exclusive.write` and removes the partial file this call
  minted, best-effort, so the next create mints rather than reading a truncated document as the established one (D-29).

**Pinned by** `packages/platform/src/platform.test.ts`, "%s answers %s, never throws, for the target f/doc under a regular
file f without parent creation" (the three functions, at `f/doc` and `f/deeper/doc`, no staging file left, `f`
untouched), all three red on the unrepaired form (`ENOTDIR` thrown by both replace forms, `EEXIST` by exclusive create,
as probed above); and by `packages/platform/src/document-write-failure.test.ts` (ENOSPC injected into `writeSync`), red
on the unrepaired form. The refused-permission case for exclusive create (`EACCES` on the parent) is written and
**skipped as root on this host**, like the replace forms' case beside it.

**Product callers traced.** None reaches either path with a file parent:
- `REQ-SESSION-197`, the workspace identifier: `establishWorkspaceId` (`packages/store/src/resolve.ts`) reads with
  `guardedRead` first, and a regular file at `<workspace>/.rotaris` makes that read `ENOTDIR`, which is `unreadable`, not
  `absent`, so it answers before any create; the restore's `establish` decision (`packages/workspace/src/restore.ts`)
  creates only in the `absent` case, and the same read makes it `unreadable-identifier`, refused at assessment.
- `REQ-GIT-128`, the integration lock: no implementation calls this primitive yet.
- The other callers keep their files in per-user directories: the machine identifier (`machine-id.ts`, which raises its
  own error on any refusal, by design), the instance record (`instance.ts`, now `refused` rather than an exception) and
  the credential and project-settings locks (`credentials/lock.ts`). The last now answers its busy headline for a lock
  file that cannot be created, recorded as
  [the-credential-lock-reports-a-busy-store-when-the-lock-file-cannot-be-created.md](the-credential-lock-reports-a-busy-store-when-the-lock-file-cannot-be-created.md)
  (repaired 2026-10-06).

**Reported back** in ADR-0004's write side ("Corrected a third time 2026-10-04"), and in its row of 2026-10-04 in
[first-executions.md](../../architecture/first-executions.md).

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
repairing [replace-document-sync-throws-when-the-parent-cannot-be-created.md](fixed/replace-document-sync-throws-when-the-parent-cannot-be-created.md),
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

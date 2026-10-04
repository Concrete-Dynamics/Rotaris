## replaceDocumentSync throws when the parent cannot be created

`replaceDocumentSync` in `packages/platform/src/document.ts` returns a `Result`, and its callers treat a failed write as
an `err` they can report. But with `createParent: true` it calls `mkdirSync(dirname(target), { recursive: true })`
before its `try`, so a parent that cannot be created (a regular file where the directory should be, a refused
permission) **throws** `EEXIST`/`ENOTDIR`/`EACCES` out of the function instead of answering `err`. The asynchronous
`replaceDocument` beside it wraps the same `mkdirSync` in a `try` and refuses.

Reachable through `bootstrapConfigFile` (`packages/config/src/writers.ts`), the synchronous `writeDocumentSync` path of
the configuration writers, and `PreferenceStore`'s save (`packages/platform/src/preferences.ts`). In the workspace
service a throw inside `handle` becomes the generic `refused {code: 'request.failed', headline: <the error>}` rather than
the configuration refusal REQ-CONFIG-028 describes (naming the path and what prevented the write).

Noticed 2026-10-03 while repairing [a-first-run-workspace-never-gets-the-starter-agents-yaml.md](a-first-run-workspace-never-gets-the-starter-agents-yaml.md) (branch
`finacc-accept1-3`): its test put a regular file at `<workspace>/.rotaris` and `bootstrapConfigFile` threw `EEXIST`. The
repair's `bootstrapAtOpen` catches the throw so the open is never refused for it; the primitive itself is not changed
here.

## Specs

- REQ-CONFIG-026 / REQ-CONFIG-028: a bootstrap that cannot write declines and reports the path and the fault; a throw
  reports neither in the configuration's own terms.
- ADR-0004 (the replace primitive) answers with a `Result`; the sync form breaks that contract on this one path.

## Relevant files

- `packages/platform/src/document.ts`: `replaceDocumentSync`, the `mkdirSync` outside the `try`; `replaceDocument`, the
  same call inside one.
- `packages/config/src/writers.ts`: `bootstrapConfigFile` and the sync write path, both `createParent: true`.
- `packages/platform/src/preferences.ts`: the preference store's synchronous save.
- `apps/desktop/src/workspace-service/open-bootstrap.ts`: the catch that keeps the open from being refused.

## Outcome — repaired 2026-10-04 (branch `fin15-starter-config-lands`)

**Confirmed on the branch** (origin/main `781fd2d` with `finacc-accept1-3` merged): a regular file at the parent's place
made `replaceDocumentSync(…, { createParent: true })` throw `EEXIST: file already exists, mkdir '…/parent'`, and
`bootstrapConfigFile` throw the same for `<workspace>/.rotaris`; four new cases were red on the unrepaired primitive.

**The repair** (`packages/platform/src/document.ts`): the synchronous form wraps its parent creation as the asynchronous
form has since 2026-09-13 and answers `err` with the same `document.parent` failure ("The destination folder could not be
created", the error as its detail). Through it:
- `bootstrapConfigFile` declines with `{ code: 'write-failed', file, fault }`, the fault naming the parent and `EEXIST`,
  so the workspace service's `config.bootstrap` answers the configuration refusal (`config.write-failed`, "The starter
  configuration could not be written", the path and the fault) rather than `request.failed` (REQ-CONFIG-026/028).
- the synchronous configuration write (`writeConfigFields` and the other writers with no timers) resolves to the same
  refusal rather than rejecting.
- the preference store's theme save (`PreferenceStore.writeThemeSync`) still throws, as it is written to, but with the
  primitive's refusal ("The destination folder could not be created: …"), the words its asynchronous `write` already used.

**The catch in `bootstrapAtOpen`** (`apps/desktop/src/workspace-service/open-bootstrap.ts`) guarded only this throw and
is removed: every fault `bootstrapConfigFile` meets now comes back as a `Result` (its read is inside a `try`, its write
is the primitive, which no longer throws on this path), so the catch guarded nothing left. Its open test with `.rotaris`
as a file now passes through the primitive's own refusal, and is red without this repair.

**Pinned in:**
- `packages/platform/src/platform.test.ts`: both forms answer `document.parent`, never throw, with a file at the parent's
  place, one and two levels down, the file left as it was and no staging file beside it; the preference store's two
  saves report the same refusal. The refused-permission (`EACCES`) case is written but **skipped on this host**, where the
  tests run as root and root is never refused; it runs on a non-root POSIX host.
- `packages/config/src/writers.test.ts`: the bootstrap and the synchronous per-field write decline naming the file and
  the fault when `.rotaris` is a regular file.
- `apps/desktop/src/workspace-service/open-bootstrap.test.ts`: the open logs that refusal as a warning and goes on.

**In the built app** (build of `b14f80d`, the branch's head with this repair, `pnpm slice-proof` against the registered
`katalyst` endpoint, 10:49:03 to 10:55:52 UTC, load 2.8 at start and 7.4 at end, other agents' work on the host): exit
0, all seven scenarios; the first launch logged the open's bootstrap `written` (10:49:04.994) with the catch gone, then
the marker writer's and the sign-in's `exists`. The failing path itself (a file at `.rotaris`) is not one the proof
drives; the unit cases above pin it.

**Reported back** in ADR-0004's write-side decision, beside its 2026-09-13 correction, and in its row of 2026-10-04 in
[first-executions.md](../../architecture/first-executions.md).

**Not repaired here, recorded beside it:** the primitive keeps two other ways out of its `Result`: the staged file's
cleanup throws `ENOTDIR` when the parent is a regular file and no parent creation was asked for (both forms), and
`exclusiveCreate` creates its parent outside any `try`
([the-document-primitive-still-throws-on-a-file-parent-without-parent-creation-and-in-exclusive-create.md](../the-document-primitive-still-throws-on-a-file-parent-without-parent-creation-and-in-exclusive-create.md)).

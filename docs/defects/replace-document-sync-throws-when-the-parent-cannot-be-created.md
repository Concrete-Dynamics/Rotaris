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

Noticed 2026-10-03 while repairing `a-first-run-workspace-never-gets-the-starter-agents-yaml.md` (branch
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

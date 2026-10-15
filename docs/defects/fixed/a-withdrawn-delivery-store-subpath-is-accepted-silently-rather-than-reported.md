## A withdrawn `requirements.delivery.store_subpath` is accepted silently rather than reported

Noticed 2026-10-14 by the reviewer of fin46 (`fin46-accept1-16`) while checking that REQ-CONFIG-183's report names its file
(acceptance finding A4); not repaired, outside that bundle's tasks.

`readRequirementsSection` (`packages/config/src/sections/requirements.ts`) carries `requirements.delivery` as an opaque
mapping and reads none of its keys, so a file that still states the withdrawn `store_subpath` under it is neither rejected
nor reported. Reproduced with `loadConfiguration` over a global `agents.yaml` holding
`requirements:\n  delivery:\n    store_subpath: x\n` and no workspace file: the load succeeds with no warning at all
(`warnings` is `[]`). The other key REQ-CONFIG-183's carve-out names, `requirements.execution.worktree_subpath`, is reported
(`requirements.ts`, `ex.warn('worktree_subpath', …)`), and since fin46 names its file and scope.

The record says a third thing: ADR-0041 ("a file that still states it is rejected as an unknown key under `requirements:`
like any other") and ADR-0036 consequence 6 ("Two withdrawn subpath keys become load failures") describe a hard load failure,
which the specification has since replaced with *reported and ignored* and the code does not do either.

## Specs

REQ-CONFIG-192: `store_subpath` "is withdrawn … a file that still states it is **reported and ignored** rather than
rejected". REQ-CONFIG-183's carve-out: such a key "is reported and ignored", the report identifying the file by full path and
scope, the key by its full path, that it was withdrawn rather than mistyped, and that delivery records are no longer files in
the workspace and no configuration key names a location for them; "raised once per offending key per load"
(REQ-CONFIG-233's warn-and-continue). The silent acceptance omits the report.

## Relevant files

- `packages/config/src/sections/requirements.ts` — `opaqueOf('delivery')`, which carries the block unread, beside the
  `worktree_subpath` warning that is the model for this one.
- `packages/config/src/requirements-section.test.ts` — pins `requirements.store_subpath` (at the block's top, an unknown key)
  as fatal; nothing pins `requirements.delivery.store_subpath`.
- `docs/architecture/adr/0041-the-delivery-store.md`, `docs/architecture/adr/0036-configuration-loading.md` (consequence 6) —
  still describe the key as a hard load failure.

## Outcome — repaired 2026-10-15 (fin47, `fin47-gate-timeout-and-config`)

`readRequirementsSection` (`packages/config/src/sections/requirements.ts`) now reads one key of the otherwise opaque
`delivery` block: when it holds `store_subpath`, one warning is raised at `requirements.delivery.store_subpath` with
`WITHDRAWN_STORE_SUBPATH` ("was withdrawn from this domain, not mistyped (REQ-CONFIG-192): delivery records are no longer
files in the workspace and no configuration key names a location for them; it is ignored, and the rest of the configuration
loaded"), and the key is dropped from the carried block so it contributes nothing. It is never an error, and the block's other
keys are carried as before. The load prefixes the file by full path and its scope as it does for `worktree_subpath`
(`<file> at requirements.delivery.store_subpath (global scope): …`); the reader runs once over the merged document, so the
report is raised once per load (REQ-CONFIG-183, REQ-CONFIG-233). A top-level `requirements.store_subpath` stays fatal: it is
not the key the specification withdrew, and the carve-out does not reach a key that merely resembles one.

Pinned by `requirements-section.test.ts` "REQ-CONFIG-192/183: the withdrawn delivery.store_subpath is reported once and ignored,
never rejected, and the rest of the block loads" and `load.test.ts` "the withdrawn requirements.delivery.store_subpath is reported
once, naming its file and scope, and the load completes", both red before (`warnings` was `[]`). The record moved with it:
ADR-0036 consequence 6 and ADR-0041 (both "a hard load failure") are corrected in place with their readings kept beside the
replacement, `03-runtime-view.md`'s `requirements:` paragraph names both carved-out keys, and
`docs/architecture/first-executions.md` has the row. No proof writes the key, so the built app's showing of the warning is not
driven.

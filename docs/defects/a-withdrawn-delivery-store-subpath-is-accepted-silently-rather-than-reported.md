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

## The `worktree_subpath` report does not say the rest of the configuration loaded

Noticed 2026-10-15 by the reviewer of fin47's `fin47-gate-timeout-and-config` (the withdrawn `delivery.store_subpath` made
reported and ignored), while comparing that bundle's new report with the one it was modelled on; not in that bundle's tasks and
not repaired there.

`readRequirementsSection` (`packages/config/src/sections/requirements.ts`) reports a `requirements.execution.worktree_subpath`
with the message "is not a configuration key of this domain (REQ-CONFIG-194); it is ignored — requirement-unit checkouts live
where REQ-GIT-137 fixes them". It says the key is not a key of this domain, that it is ignored and where the checkouts go, but
not that the rest of the configuration loaded. The report fin47 added beside it for `delivery.store_subpath`
(`WITHDRAWN_STORE_SUBPATH`) says all four things, so the two carved-out keys now convey different amounts.

## Specs

REQ-CONFIG-183's carve-out, "What the report conveys": the report "conveys that the key is being ignored **and that the rest of
the configuration loaded**, so that a user is not left to guess what the report cost them". The `worktree_subpath` message omits
the second half. (Its wording is otherwise left to the implementation.)

## Relevant files

- `packages/config/src/sections/requirements.ts` — the `ex.warn('worktree_subpath', …)` line, beside `WITHDRAWN_STORE_SUBPATH`.
- `packages/config/src/requirements-section.test.ts` — pins the warning's path for `worktree_subpath`, not what its message
  conveys.

## Two writing children in one checkout collided on shared paths

Observed 2026-09-20, run `2e21e324`: two children writing in the same checkout refused each other three times. `tool_calls` ord 132: `haet_edit` on `src/application/contracts.ts` refused with `changed since the hash you hold was taken. Read it again with haet_read before retrying.` Ord 328 and 579: `write_file` refused with `File already exists: tests/unit/application/registration-service.test.ts. Use 'overwrite' or 'edit'.` Transcript rows 580–583 show the second agent discovering the sibling's file mid-run (`A concurrent sibling just wrote tests/unit/application/registration-service.test.ts`) and yielding it (`I will not clobber it`), landing its own adapter test at the distinct path `tests/unit/app/registration-action.test.ts` (row 591). Top read paths repeat 4x across children (`src/application/contracts.ts`, `src/data/repositories/user-repository.ts`, `src/domain/errors.ts`, among others) over 170 successful `read_file` calls.

## Specs

No requirement contradicted — the hash guard and the create-guard each held; recorded here for the coordination cost of sibling writers sharing one checkout.

## Relevant files

- `packages/agent-tools/src/tools/files.ts` — the `haet_edit` hash guard and the `write_file` create-guard.
- `packages/engine/src/children/orchestration.ts` — sibling children spawned into the same workspace.

Noticed 2026-09-20 by the run-autopsy of run `2e21e324`.

**Raised with the owner, 2026-09-22 — [R-047](../product/requests.md#r-047).** Repairing this note means
changing behaviour a live requirement states exactly, which `docs/product/README.md` sends to a `PD` and
an implementer may not mint. The request is logged with the requirements a directive would have to name,
so the decision is in front of the owner rather than waiting in a defect note.

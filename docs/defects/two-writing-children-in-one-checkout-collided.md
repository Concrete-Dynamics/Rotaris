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

**Improved 2026-09-22, and not closed — the coordination half is the owner's.** The refusal this run hit
three times said only that the file was there:

```
File already exists: tests/unit/application/registration-service.test.ts. Use 'overwrite' or 'edit'.
```

It now answers the question the second agent spent a turn answering by hand — whether the file is one it
had forgotten writing or one something else wrote while it worked:

```
File already exists: tests/unit/application/registration-service.test.ts (34 line(s)). You have NOT read
it in this session — it was there before you started, or something else wrote it while you worked. Read
it before deciding, then use 'overwrite' or 'edit'.
```

The read-state is already known at the guard and costs nothing to say. No content is quoted, which
`tools.test.ts` pins beside the new assertions.

**What is not repaired, and why it may not be here.** Which calls are refused is unchanged, and it is the
right refusal: the create-guard and the hash guard both held, which is what the note recorded. Making
siblings in one checkout aware of each other — a claim, a lease, a partition of the tree — is behaviour
no requirement states, so it is a `PD` and it is logged at [R-047](../product/requests.md#r-047) with the
requirements a directive would have to name.

**Proposed 2026-09-23, not ruled — [R-048](../product/requests.md#r-048).** Put to the owner and held back from the ruling: `delegate` takes an
optional **write scope** (path globs the child will write), and a child writing into a path inside a live
sibling's declared scope is refused with a message naming that sibling; a child spawned without a scope
behaves as today. It would be a new directive, since no requirement covers sibling writers. A separate
worktree per writing child was considered and not proposed, because it needs a merge mechanism of its own.
The note stays open on the owner's decision.

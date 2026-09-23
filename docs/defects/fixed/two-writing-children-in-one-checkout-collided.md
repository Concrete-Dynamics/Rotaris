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

## Design proposed 2026-09-23, awaiting the owner's ruling

Worked out after the proposal above and put to the owner. **Not ruled**; recorded so it is not lost.
Directive it would become: `PD-TOOLS-006`. It would narrow REQ-TOOLS-152 and REQ-TOOLS-154 and extend REQ-ORCH-028.

- `delegate` gains an optional `write_scope`: path globs relative to the workspace root, in the `glob`
  tool's dialect (`*`, `**`, `?`, `{a,b}`). A glob reaching outside the root rejects the delegation.
- While a scoped child is live, it claims the paths its scope matches. A write to a claimed path through
  `write_file` or `haet_edit`/`haet` by any other agent in the run is refused before it executes. "Any other
  agent" includes siblings, the parent and the entry agent; the claiming child and its own descendants are
  exempt. Where scopes overlap, the earlier-spawned child owns the overlap. The claim lapses when the child
  reaches a terminal state.
- The refusal names the owner, its persona and the matching glob, and points to `wait_for_tasks`.
- The child's payload gains a block after the workspace-root prefix listing its own scope and the scopes of
  siblings still running.
- A child without a scope behaves as today. A scope never fences the child that declared it.
- Build: the engine's children ledger holds the claims in memory. The gate asks through a predicate injected
  from the tool-port context (the `planGateHeld` precedent). `globToRegExp` moves out of `search.ts` into a
  shared helper. Nothing is persisted, because a resume closes non-terminal children as cancelled.
- Cost: `terminal`, `git_commit` and MCP tools can still write claimed paths. An undo of a claimed path by
  another agent is a write and is refused too.
- Alternative considered: automatic claims (first writer owns the path). It needs no planning, but the
  collision is still found at write time.
- Open forks put to the owner: declared scopes rather than automatic claims; whether the parent and the entry
  agent are refused too (proposed: yes).

Related: [`the-create-guard-tells-an-agent-it-read-a-file-its-sibling-wrote.md`](the-create-guard-tells-an-agent-it-read-a-file-its-sibling-wrote.md),
found while designing this. The "Improved 2026-09-22" message above answers wrongly in exactly this note's case.

**Ruled 2026-09-23 — [`PD-TOOLS-006`](../product/directives.md#pd-tools-006), [R-049](../product/requests.md#r-049).**
The design above is approved as proposed, with both forks as recommended: declared scopes, and the parent and
the entry agent refused too. The note stays open until the directive is built.

## Repaired — 2026-09-23 ([`PD-TOOLS-006`](../../product/directives.md#pd-tools-006) built)

The coordination half is built as ruled. `delegate` takes `write_scope`. A live scoped child claims the paths
its patterns match, and `Gate.dispatch` refuses a `write_file` or `haet_edit` write into a claimed path to every
other agent of the run except the child's own descendants. The refusal is `blocked`, is taken before the
permission resolution, and names the holder, its persona and the pattern. Each child is told the live scopes in a
block after the workspace-root line of its payload. In run `2e21e324`'s shape, a parent that gives the two writers
scopes now has the second writer refused at its first write into the first writer's paths, with the owner named,
where it previously found the sibling's file by hand. A parent that gives no scopes gets exactly the old behaviour,
which is the cost the directive states.

Evidence: `children.test.ts` (*PD-TOOLS-006: write scopes*, three end-to-end cases against the run),
`write-scope.test.ts`, `gate.test.ts` (*write scopes at dispatch*), and `run-host/tools.test.ts` (the predicate
reaching the gate through a real port).

The create-guard's message about whose file it is remains a separate open note,
[`the-create-guard-tells-an-agent-it-read-a-file-its-sibling-wrote.md`](../the-create-guard-tells-an-agent-it-read-a-file-its-sibling-wrote.md).

## A restore cut between its two renames leaves the workspace to open as an empty store

ADR-0058's restore displaces the target store (step 8, `<identifier>` → `<identifier>.displaced-<stamp>`) and then installs
the staging copy (step 9, `<identifier>.restoring-1` → `<identifier>`), in `restoreStore` (`packages/store/src/restore.ts`).
A process that dies between the two renames — the workspace service killed, the machine losing power, a crash — has nothing
left to finish or reverse the restore. Measured on 2026-10-13 by fin41 with `pnpm restore-kill-proof` (a real child process
running `restoreStore`, SIGKILLed in the gap, 10 trials, load average about 4 on 4 CPUs): in 10 of 10 the target name held
nothing, the displaced store was whole beside it (both sessions, `quick_check` ok) and so was the staging copy (the
artifact's session, `quick_check` ok); and in 10 of 10 the workspace service's next open (`openWorkspaceStore`, which
`openOwn` calls on `workspace.open`) created a fresh store at the target name, migrated it from version 0, and listed no
session — saying nothing. The user's history stays in `<identifier>.displaced-<stamp>`, which no surface shows (the
reclamation surface, OQ-48, is deferred under R-071), and the restored copy in `.restoring-1`, which nothing reads either.
`store.test.ts` pins the same state in-process (the gap cut by a throw).

Neither REQ-SESSION-202 nor W-31 reaches it: the place itself is absent, which REQ-SESSION-202's last paragraph calls "an
absence and not this condition, including while a restore is under way", so the creating open is what REQ-SESSION-043
permits for a workspace with nothing kept. Whether launch should look for a lone `.displaced-*` or `.restoring-*` beside an
absent or new store and finish the restore, reverse it, or at least say so, is a question the specification leaves open:
OQ-266.

## Specs

`REQ-SESSION-201`: "A restore that fails for any reason MUST leave the store exactly as it was — there is no partly restored
store, and no reader may observe one." A reader here observes neither the old store nor the restored one but a third, empty
one. REQ-SESSION-200's concern (a user told by an empty list that their history is not here) applies as well.

## Relevant files

- `packages/store/src/restore.ts` — steps 8 and 9, and the `betweenRenames` measurement hook between them.
- `packages/store/src/resolve.ts` — `openWorkspaceStore`, which creates where the place is absent.
- `apps/desktop/src/workspace-service/index.ts` — `openOwn`, the open that follows.
- `apps/desktop/scripts/restore-kill-proof.mjs`, `packages/store/src/restore-kill.child.ts` — the harness and its child.
- `packages/store/src/store.test.ts` — the in-process pin of the gap state.

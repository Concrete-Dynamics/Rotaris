## A configured `worktree_storage_subpath` is loaded but never reaches worktree creation

The configuration loader reads `worktree_storage_subpath` (`packages/config/src/load.ts`, default `worktrees`) and exposes it
as `LoadedConfiguration.worktreeStorageSubpath`, but nothing in the desktop application reads that field. The isolated-session
start in main (`apps/desktop/src/main/commands/session.ts`, `session.start`) sends `worktree.create` with
`target: { kind: 'session', sessionId }` and no `subpath`, although the process protocol already allows one
(`packages/contracts/src/process-protocol.ts`). The workspace service passes the absent field on to `sessionWorktreePath`
(`packages/workspace/src/git/worktrees.ts`), which falls back to `worktrees`. Every session worktree is therefore placed at
`<workspace>/.rotaris/worktrees/<sessionId>`, whatever the user configured, and the configured value is ignored without a
word. The default is unaffected; only a user who sets the key meets it.

Recorded 2026-10-13 by fin41 (task N72 of the 2026-10-13 survey, confirmed on main `6de2a67`: `git log -S worktreeStorageSubpath`
finds no commit that wired the field through, and `docs/architecture/codebase.md` still listed it as owed).

## Specs

- `REQ-GIT-073` — `worktree_storage_subpath` places session worktrees; the default is only the default.
- `REQ-CONFIG-068` and `REQ-CONFIG-010` — the key names the directory holding per-session isolated checkouts and is the only
  key that does.
- `REQ-GIT-005` — session worktrees are created at `<workspace>/.rotaris/<storage-subpath>/<session-id>`, the subpath
  configurable.
- `REQ-CLI-058` — created worktrees are placed under the directory the key names.

## Relevant files

- `apps/desktop/src/main/commands/session.ts` — the one sender of a session-target `worktree.create`; sends no `subpath`.
- `packages/config/src/load.ts` — reads the key and exposes `worktreeStorageSubpath`.
- `packages/config/src/snapshot.ts`, `packages/contracts/src/config.ts` — the resolved view main can ask the workspace service
  for (`config.read`); it does not carry the key.
- `apps/desktop/src/workspace-service/index.ts` (`worktree.create`) and `packages/workspace/src/git/worktrees.ts`
  (`sessionWorktreePath`) — honour a `subpath` when one arrives.

## Outcome

**Repaired 2026-10-13 (fin41, `fin41-config-and-proposals`).** The `ConfigSnapshot` contract carries `worktreeStorageSubpath`
(`snapshotOf`; `worktrees` in a fatal snapshot). An isolated start in main (`session.start`, the explicit isolation and the one
PD-GIT-001 forces alike) asks the workspace service `config.read` first and sends the snapshot's value as the session target's
`subpath`; a snapshot with `loadOk: false` refuses the start as `session.configuration`, the load's report its detail, before any
worktree is created (REQ-GIT-071), and an unanswered read refuses as an unanswered worktree request does. An attach reads no
configuration. Pinned by the "REQ-GIT-073" cases in `apps/desktop/src/main/commands/session.test.ts` (four of five red on the code
before, with three existing cases that now see the read), and shown by `pnpm git-proof` launch 7 (`configured-subpath`): a
repository whose file names `trees/sessions` had its isolated session bound, written and listed by Git at
`.rotaris/trees/sessions/<sid>`, with no `.rotaris/worktrees/` created (2026-10-13, load about 1 to 2.5 on four CPUs, all eleven
launches green). Reported back into ADR-0038.

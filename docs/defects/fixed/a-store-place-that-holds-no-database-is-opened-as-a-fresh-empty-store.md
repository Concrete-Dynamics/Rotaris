## A store place that holds no database is opened as a fresh empty store

`openWorkspaceStore` (`packages/store/src/resolve.ts`), the workspace service's one open of a workspace's store
(`openOwn`, `apps/desktop/src/workspace-service/index.ts`), runs `mkdirSync(dir, { recursive: true })` and then
`openStore(file)` without `mustExist`, so where `<data>/workspaces/<identifier>/` exists and holds no `workspace.db` it
creates one, migrates it, and the workspace opens holding no sessions. Nothing in the code distinguishes that state from
a workspace this machine never ran: no code cites `REQ-SESSION-202`, and constraint W-31 (1), which names exactly this
open ("an implementation that opens by a call which creates when absent does not satisfy the requirement"), has no
implementation. The state is reachable: ADR-0058's single-rename reversal reached it 20 of 20 (now displace-then-rename,
`store.test.ts`'s E2c keeps the counterfactual), and a copy, a move or a hand tidy that took `workspace.db` and left its
directory reaches it today. Noticed 2026-10-13 by fin41 while measuring the restore's kill-in-the-gap case, which leaves
the place itself absent rather than empty (that case is REQ-SESSION-043's absence by REQ-SESSION-202's last paragraph,
and is OQ-266's). Recorded, not repaired: the refusal at open, its report and the deliberate establishing action are
product work of their own.

## Specs

`REQ-SESSION-202`: a place for the store that holds no store "MUST count as a store that could not be opened", "The
product MUST NOT put a new store there, and MUST NOT report the workspace as holding no sessions", and it is resolved only
by an action the user takes deliberately. Constraint W-31 (`docs/architecture/constraints.md`).

## Relevant files

- `packages/store/src/resolve.ts` — `openWorkspaceStore`: `mkdirSync` then a creating `openStore`.
- `apps/desktop/src/workspace-service/index.ts` — `openOwn`, which answers `workspace.opened` from it.
- `packages/store/src/store.test.ts` — E2c, which reaches the state and does not reopen it.
- `docs/architecture/constraints.md` — W-29 (3) and W-31.

## Outcome — repaired 2026-10-14 (fin43, `fin43-restore-recovery`)

`openWorkspaceStore` (`packages/store/src/resolve.ts`) no longer opens by a call that creates where the place exists: after
OQ-266's cut-restore check, a directory that exists and holds no `workspace.db` throws `StorePlaceEmptyError` and nothing is
written there; only an absent place is made and opened creating (REQ-SESSION-043 unchanged), and a present store is opened
with `mustExist`. The workspace service answers it as the refusal `workspace.store-missing` naming what was found (the
directory exists and the store is not in it; nothing was created; no session can start) with no engine reason invented
(W-31 (2)); main raises it as an error notice and holds it, so `session.list` answers that refusal instead of an empty list or
"Open a workspace". No session starts, since the run host is never handed a store.

Not built, and raised as [OQ-281](../../architecture/open-questions.md#oq-281): the deliberate action that establishes a new
store in such a place (REQ-SESSION-202 says what it must not be, not where it is offered), and a surface for the condition
beyond the notice and the listing's refusal. Pinned by `packages/store/src/store.test.ts` (the REQ-SESSION-202 case in the
open block, red on the creating open; E2c's end state now refused at its reopen), `apps/desktop/src/workspace-service/store-open.test.ts`
and `apps/desktop/src/main/commands/library.test.ts`.

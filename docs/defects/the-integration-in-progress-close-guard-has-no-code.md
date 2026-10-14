## The "Integration in progress" close guard has no code

REQ-SHELL-119 orders three window-close guards: (1) unsaved settings, (2) "while a worktree integration is running, the close
is refused unconditionally by an informational dialog titled "Integration in progress"", and (3) active runs. REQ-SHELL-021
and REQ-STARTUP-053 put the same second gate in the workspace chip's and the chooser's flow ("Finish the worktree integration
before opening another project."). Nothing in `apps/` or `packages/` implements guard (2): on `fin46-accept1-9` (base
`907415e`, 2026-10-14) a search for `Integration in progress`, `Finish the worktree integration`, `worktree.integrate` and
`integrating` finds only `MERGE_STATUSES`'s unread `'integrating'` member (`packages/contracts/src/repository.ts`). No close
path, no chip path and no update path (OQ-311's sequence, built the same day) reads an integration state, because the product
has none to read: worktree integration and "Merge selected" (REQ-GIT-083, REQ-GIT-125..135) are deferred from the first
release ([`first-release-plan.md`](../architecture/first-release-plan.md), "Deferred by "thats it"": "Git integration and
merge"). The guard is therefore vacuous until integration is built, and its absence changes no behaviour today.

The record also says more than the code holds: [`codebase.md`](../architecture/codebase.md) states that REQ-SHELL-021's
second gate "is written in its place in the fixed order as an explicit no-op that names the state it would read"; no such
no-op exists in `apps/desktop/src/main/` (`close-confirmation.ts`, `main-windows.ts`, `index.ts`), so the gate's place in the
order is held by nothing a later builder would find.

Confirmed 2026-10-14 by fin46 (`fin46-accept1-9`) at OQ-311's ruling's request (its advocate B reported no code for guard (2)),
outside that ruling's repair: recorded, not repaired.

## Specs

- `REQ-SHELL-119` guard (2) — a close is refused while a worktree integration runs; no code implements it.
- `REQ-SHELL-021` gate (2), `REQ-STARTUP-053` gate (2) — the chip's and the chooser's same gate; no code implements it.
- `REQ-GIT-083`, `REQ-GIT-125` to `REQ-GIT-135` — worktree integration itself, deferred from the first release; the guard
  becomes reachable only when they are built, and must be built with them.

## Relevant files

- `apps/desktop/src/main/close-confirmation.ts`, `apps/desktop/src/main/main-windows.ts` (`guardClose`, `askUnsavedInTurn`),
  `apps/desktop/src/main/index.ts` (the chip's gates and the updater's `confirmUnsaved`) — where guard (2) would sit, between
  guard (1) and guard (3).
- `packages/contracts/src/repository.ts` — `MERGE_STATUSES`, whose `'integrating'` member nothing reads.
- `docs/architecture/codebase.md` — the "explicit no-op" sentence the code does not bear out.

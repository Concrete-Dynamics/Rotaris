## Nothing bounds the wait of a setup queued behind one that never finishes

`InitializationCoordinator` runs its `code-intelligence-setup`s one at a time (`setupTurn`): a run's setup starts once the
setup before it has ended, and "ended" is `followSetup` seeing a pushed `mcp.setupStatus` whose state is `finished`. No
time bounds that wait. If a setup's finished status never arrives — the run host exits or is lost mid-setup, or a push is
dropped — the follow never resolves, its turn is never released, and every later workspace's setup in the same process
waits behind it for the rest of the process's life, showing a run in progress that never ends. Today main never re-forks
the run host (`apps/desktop/src/main/index.ts`), and the run host's own stage budgets (300 / 1800 / 120 s) end every
setup it runs, so the case needs the run host itself to fail; but nothing in the coordinator would notice. Noticed by the
verification of the repair of the setup overlap on 2026-09-30 (an optional finding) and recorded under R-067; not
reproduced, and not repaired here.

## Specs

- REQ-WORKSPACE-109: an initialization run reaches its conclusion, cancelled or not, and its progress is reported as
  it goes; a follow that never ends reports neither.
- REQ-WORKSPACE-084: every attempted task is given exactly one recorded outcome.

## Relevant files

- `apps/desktop/src/main/initialization.ts` — `setupTurn`, `turnReached`, and `followSetup`, which resolves only on a
  `finished` status.
- `apps/desktop/src/main/index.ts` — the run host's single fork, and `onSetupStatus`'s routing of `mcp.setupStatus`.

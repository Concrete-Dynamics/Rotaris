## A hard-timeout reset respawned the shell at its defaults and the agent re-discovered where it had been

Observed live 2026-09-18, run `cc6191a2` (logged as R-039): a command that hung on an unbalanced quote hit
the hard wall-clock timeout, the session respawned at the default directory with a default environment, and
the agent spent the next turns re-discovering where it had been — re-reading the directory, re-setting the
variables the timed-out command had inherited.

`REQ-TOOLS-099` is faithful — the tree must go and the session must restart — and what it fixes about the
loss ("everything the shell had accumulated … is gone, and the observation says so") is kept. What was
missing is only what happens *after* the restart: the directory and the variables, which the product can
capture without entering the dead shell, were not re-applied to the fresh one.

Repaired under PD-TOOLS-001 on the branch that recorded it: the snapshot after each completed command (cwd
plus exported variables), re-applied after the reset, the observation naming both the loss and the restore.
Aliases, functions and background jobs are not restored and the detail says so.

## Specs

REQ-TOOLS-099 — narrowed by PD-TOOLS-001, with the back-pointer in `docs/spec/05-tools-permissions-approvals.md`.

## Relevant files

- `packages/agent-tools/src/terminal/foreground.ts` — `ShellState`, `snapshotCommand`/`parseSnapshot`,
  `restoreCommand`, `captureState`/`refreshState`/`restoreState`/`runRaw`, `clearSnapshot`, the `restore`
  field on `ForegroundResult`.
- `packages/agent-tools/src/terminal/index.ts` — the timed-out detail naming loss plus restore, the
  explicit-reset path clearing the snapshot.
- `packages/agent-tools/src/terminal/terminal.test.ts` — the timeout test now asserting the variable
  survives the respawn.

Noticed 2026-09-18 by the run-autopsy of run `cc6191a2`; repaired on the same branch.

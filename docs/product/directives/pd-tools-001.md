[Product directives](../directives.md) › PD-TOOLS-001

<a id="pd-tools-001"></a>

### PD-TOOLS-001 — a hard-timeout reset restores the shell's working directory and environment

**The rule.** When a foreground command reaches its hard wall-clock timeout and the terminal session is
restarted under `REQ-TOOLS-099`, the product SHALL snapshot the shell's working directory and exported
variables before the respawn and re-apply them after it, so the next command continues where the timed-out
one left off. The observation contract is untouched: `exit_code` 124, `timeout` true, `failure_kind`
`"timeout"`, `kill_status` ∈ {`session_reset`, `reset_failed`}, `session_reinitialized` true, and a detail
stating the command exceeded its timeout, the session was forcibly restarted to terminate the process tree,
and shell state was lost — with the restored directory and variables named beside that sentence, so the
observation never reads as claiming nothing was lost.

Aliases, functions and background jobs are **not** restored: they cannot be enumerated reliably from outside
the shell that held them, and re-inventing them would be guessing. The detail names that boundary too.

**Why, and what it costs.** Observed live 2026-09-18, run `cc6191a2` (logged as [R-039](../requests.md#r-039)):
a command that hung on an unbalanced quote hit the hard timeout, the session respawned at the default
directory with a default environment, and the agent spent the next turns re-discovering where it had been.
`REQ-TOOLS-099` is faithful — the tree must go and the session must restart — and what it fixes about the
loss ("everything the shell had accumulated … is gone, and the observation says so") is kept. What changes
is only what happens *after* the restart: the directory and the variables, which the product can capture
without entering the dead shell, are re-applied to the fresh one. The cost is one snapshot round-trip per
reset and a detail line that states both the loss and the restore, so no reader mistakes a resumed directory
for a shell that never died.

> **Narrows:** REQ-TOOLS-099

*Raised by the owner, 2026-09-18; logged as [R-039](../requests.md#r-039).*

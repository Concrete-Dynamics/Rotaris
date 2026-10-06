## The PowerShell shell-state snapshot joins a wrapped row with a newline

Noticed 2026-10-06 by finacc2's acceptance bundle while repairing the POSIX capture
([the POSIX note](fixed/the-shell-state-snapshot-is-corrupted-on-a-screen-narrower-than-its-rows.md)), and not repaired
there: no Windows host and no `pwsh` on this one, so nothing about it is measured; it is read from the code.
PD-TOOLS-001's PowerShell capture (`snapshotCommand`'s first branch) prints `__rot_cwd__:<directory>` and one
`__rot_env__:<NAME>=<value>` row per variable, and reads them off the emulated screen of the session's width
(ADR-0021). `parseSnapshot`'s PowerShell half appends every row that follows a variable's row to that variable's value
with a newline between, and drops every row that follows the directory's. A row wider than the screen wraps, so its
continuation is taken for a newline inside the value, and a directory wider than the screen is cut at the screen's edge.
At the default 240 columns that is a Windows `Path` longer than 240 characters, which is common; the display may narrow
the screen to 20 columns (REQ-TOOLS-128), where almost every row wraps. A hard-timeout reset would then set the variable
with newlines in it (`Path` broken for every command lookup, as the POSIX capture once did,
[the earlier note](fixed/a-long-variable-comes-back-from-a-timeout-reset-with-a-newline-in-it.md), whose repair named this
side "Not changed") and report it restored, or fail to set the cut directory. The POSIX capture's repair (base64 rows
joined across the screen's breaks, `encodedSnapshot`) would serve here too, through a PowerShell spelling of the same
rows; it needs a Windows host to execute.

## Specs

- PD-TOOLS-001 — a hard-timeout reset restores the shell's working directory and exported variables; a wrapped row would
  restore a value with a newline in it and name it restored.
- REQ-TOOLS-104 — PowerShell is the Windows backend, so this is the capture every Windows session takes.
- REQ-TOOLS-128 — the display resizes the foreground PTY, which narrows the screen the capture is read from.

## Relevant files

- `packages/agent-tools/src/terminal/foreground.ts` — `snapshotCommand` (the PowerShell branch, one row per variable),
  `parseSnapshot` (its PowerShell half: the continuation rejoined with a newline, the directory's dropped),
  `restoreCommand` (the `Set-Item` and `Set-Location` it builds from the parse).
- `packages/agent-tools/src/terminal/terminal.test.ts` — the PD-TOOLS-001 cases, which run PowerShell only on Windows.

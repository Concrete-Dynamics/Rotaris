## A PowerShell restore whose Set-Item fails is still reported restored

Measured 2026-10-15 on Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, dev tree, pwsh 7.6.6 and Windows PowerShell
5.1.26100.9457, at `fbbc3d23` (the Windows ARM64 session's B2, a scratch case on the real `TerminalManager`, never committed).

PD-TOOLS-001's PowerShell restore is one statement list, `Set-Item -LiteralPath 'Env:<name>' -Value '<value>'; …;
Remove-Item …; Set-Location -LiteralPath '<dir>'`, and `restoreCommand` puts the directory change last "so the exit status
reports it": the reset reads the line's exit status and says the state "were restored (<dir>)". A `Set-Item` that fails is a
non-terminating error in that list. A line of that shape whose first `Set-Item` failed (`Set-Item -LiteralPath 'Env:'
-Value 'x'`, "Cannot process argument because the value of argument \"name\" is null") and whose `Set-Location` succeeded
exited **0** under both shells, at 240 and at 34 columns. So a reset that put back the directory and lost a variable is
reported to the agent as having restored everything.

Which captured variable a real `Set-Item` would refuse was not constructed here (a name `Set-Item` cannot take is not one
`Get-ChildItem Env:` lists); the reading is from the line's semantics, measured with a stand-in failure.

Not repaired (record-only).

## Specs

PD-TOOLS-001 (the reset restores the environment and directory, and says so), REQ-TOOLS-099 (the reset's own report). A
partial restore read as a whole one tells the agent its environment is what it was when it is not.

## Relevant files

- `packages/agent-tools/src/terminal/foreground.ts` — `restoreCommand`'s PowerShell branch (the `; `-joined list, the directory
  last), and the reset's reading of the restore line's exit status as `restored`.

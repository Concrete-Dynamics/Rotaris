## Windows PowerShell 5.1 loses the spawn environment's empty PSModuleAnalysisCachePath across a reset

Measured 2026-10-15 on Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, dev tree, Windows PowerShell 5.1.26100.9457,
at `fbbc3d23` (the Windows ARM64 session's B2). The foreground session spawns its shell with `PSModuleAnalysisCachePath`
set to the empty string (`foreground.ts`, beside `TERM: 'dumb'`). In B2's PD-TOOLS-001 case, a dump of `Get-ChildItem Env:`
taken inside the shell before a hard-timeout reset lists it, empty, and the same dump after the reset and the restore does
not; every other variable, 24 `Path` entries, a 600-character value, a non-ASCII one and one PowerShell would read as code
come back byte for byte. Under pwsh 7.6.6 nothing is lost, at any of eight widths from 34 to 240 columns.

Not isolated: a plain probe (a 5.1 process given the same empty variable, then `Set-Item` of another variable and
`Set-Location`) keeps it, so it is something in the reset, the capture or the restore line as 5.1 runs them. The effect is
small (the variable only switches off 5.1's module-analysis cache for what the shell starts) and it is the product's own
variable, not one a person or an agent set; it is recorded because PD-TOOLS-001 says the restore puts the environment back,
and here one variable is not.

Not repaired (record-only).

## Specs

PD-TOOLS-001 (a reset restores the shell's environment and directory as the last completed command left them), REQ-TOOLS-099.

## Relevant files

- `packages/agent-tools/src/terminal/foreground.ts` — the spawn environment (`PSModuleAnalysisCachePath: ''`),
  `snapshotCommand`, `restoreCommand` (its removals of spawn variables the capture does not hold).
- `packages/agent-tools/src/terminal/terminal.test.ts` — the PD-TOOLS-001 PowerShell sweep, which lists this as its one 5.1
  exclusion.

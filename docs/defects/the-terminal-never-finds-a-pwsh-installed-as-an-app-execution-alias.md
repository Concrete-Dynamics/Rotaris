## The terminal never finds a pwsh installed as an App Execution Alias

Found 2026-10-15 on Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, Electron 44.1.1 arm64, dev tree, at `b9e30052`.
`winget install Microsoft.PowerShell` on this host installed PowerShell 7.6.7 as its MSIX package (Arm64), reached through
the App Execution Alias `%LOCALAPPDATA%\Microsoft\WindowsApps\pwsh.exe` (and the package's own
`WindowsApps\Microsoft.PowerShell_8wekyb3d8bbwe\pwsh.exe`), both on `PATH`. The alias runs: `spawnSync` of it exits 0 and
prints `7.6.7`. But Node cannot stat it: `existsSync` is false, `statSync` throws `EACCES`, and `lstatSync` reads a 87-byte
reparse point that is not a file. `findShell` accepts a candidate only when `existsSync(f) && statSync(f).isFile()`, so it
passes over pwsh and returns `powershell.exe`, Windows PowerShell 5.1.

Every terminal the product opens on such a host is therefore 5.1, with 5.1's grammar (`&&` and `||` are parse errors there)
and formatting, although pwsh is installed and is first on REQ-TOOLS-104's list. The full suite shows it: the real-PTY case
"the capture is the emulated screen" reads `Count    : 2`, `Format-List`'s width in 5.1, where its expectation is pwsh 7's
`Count             : 2`.

`findExecutable` in `@rotaris/platform` (the MCP command resolution) has the same `statSync(p).isFile()` test, so any
command a person installed as an alias (the Store's `python.exe`, `winget.exe`) reads as absent there too. Not measured
here beyond the stat.

Not repaired (record-only).

## Specs

REQ-TOOLS-104: the session's shell is `pwsh` where it is present, else `powershell`, by presence on `PATH`. A pwsh on `PATH`
that starts when run is present, and the product does not use it.

## Relevant files

- `packages/agent-tools/src/terminal/index.ts` — `findShell`, the `existsSync`/`statSync(...).isFile()` acceptance.
- `packages/platform/src/spawn.ts` — `findExecutable`'s `isFile`, the same test for MCP commands.
- `packages/agent-tools/src/terminal/terminal.test.ts` — the `Count` case that ran under 5.1 because of it.

## The PowerShell shell-state snapshot joins a wrapped row with a newline

Noticed 2026-10-06 by finacc2's acceptance bundle while repairing the POSIX capture
([the POSIX note](the-shell-state-snapshot-is-corrupted-on-a-screen-narrower-than-its-rows.md)), and not repaired
there: no Windows host and no `pwsh` on this one, so nothing about it is measured; it is read from the code.
PD-TOOLS-001's PowerShell capture (`snapshotCommand`'s first branch) prints `__rot_cwd__:<directory>` and one
`__rot_env__:<NAME>=<value>` row per variable, and reads them off the emulated screen of the session's width
(ADR-0021). `parseSnapshot`'s PowerShell half appends every row that follows a variable's row to that variable's value
with a newline between, and drops every row that follows the directory's. A row wider than the screen wraps, so its
continuation is taken for a newline inside the value, and a directory wider than the screen is cut at the screen's edge.
At the default 240 columns that is a Windows `Path` longer than 240 characters, which is common; the display may narrow
the screen to 20 columns (REQ-TOOLS-128), where almost every row wraps. A hard-timeout reset would then set the variable
with newlines in it (`Path` broken for every command lookup, as the POSIX capture once did,
[the earlier note](a-long-variable-comes-back-from-a-timeout-reset-with-a-newline-in-it.md), whose repair named this
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
  *(Corrected 2026-10-15, the first Windows run of them, on Windows 11 ARM64 under pwsh 7.6.6 and 5.1: only one runs
  PowerShell there, "PD-TOOLS-001 (OQ-134): a reset restores the snapshot …", green; the width case "at 20 and 40 columns a
  hard-timeout reset restores …" is `it.skipIf(PS)` and runs on no Windows host. The Windows run this note owes is the
  Windows ARM64 session's B2.)*

## Repaired — 2026-10-06 (fin21, bundle `fin21-leftover-notes`)

The PowerShell capture now prints the POSIX capture's rows, spelled in PowerShell (`snapshotCommand`'s first branch,
`packages/agent-tools/src/terminal/foreground.ts`): a tag field `__rot_ps__`, the directory and every `NAME=value`, each
NUL-terminated, UTF-8 encoded, base64, written 64 characters a row behind `__rot_b64__:`. `parseSnapshot` reads both
backends through the same `encodedSnapshot` (the rows joined across the screen's wraps with nothing between them, every
row but the last exactly 64 characters, valid padded base64, NUL-terminated); the plain-row parse that rejoined a wrapped
row with a newline, and kept only the part of a wrapped directory that fit the screen, is gone. A Windows directory has
no leading `/` to tell a whole capture from one that lost its top rows, so the capture names itself with the tag and a
decode that does not open with it is refused (or, read as POSIX, refused for its directory not starting with `/`).
`restoreCommand` is unchanged.

Pinned on Linux by `packages/agent-tools/src/terminal/terminal.test.ts`, "PD-TOOLS-001: the PowerShell shell-state capture
survives a screen that wraps": the command never writes the marker beside its colon and its own echo is not read as a
capture; a 260-character directory and a `Path` past 240 characters (and a non-ASCII value) read back exactly off the
xterm emulator at 20, 33, 40, 64, 75, 76, 77 and 240 columns; the restore built from the read sets that `Path` whole,
with no newline, and changes directory last; and a capture that lost its top row, lost a row's continuation, or names no
variable or no directory is refused. The first three were red before the repair. No PowerShell runs on this host, so the
tests print what the command's loop prints rather than running it: **the Windows run is owed** (the PD-TOOLS-001
PowerShell cases in `terminal.test.ts` that run only on Windows, and a hard-timeout reset under a long `Path` at a narrow
display).

**Corrected the same day after the first verification** (fin21's verifier). The claim above that a decode which does not
open with the tag is refused "(or, read as POSIX, refused for its directory not starting with `/`)" was true only when
the fragment did not happen to resume at a `/`: `parseSnapshot` did not know which backend had run the capture, so a
PowerShell capture that lost its top rows and resumed inside a URL or a POSIX-style path in a value passed as a POSIX
capture. `parseSnapshot` now takes the backend's kind (`ForegroundSession.captureState` passes its own), and a
PowerShell read without the tag is refused whatever follows. Pinned by "a PowerShell capture that lost its top rows and
resumes at a `/` is refused, never read as a POSIX capture" (a value whose `/` lands on byte 48, so the rows after the
first decode to `/usr/bin\0B=two\0`): red before the change ("expected { cwd: '/usr/bin', env: { B: 'two' } } to be
null").

## Windows run — 2026-10-15

*Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, Electron 44.1.1 arm64, dev tree, pwsh 7.6.6 arm64 and Windows
PowerShell 5.1.26100.9457, at `fbbc3d23` (the Windows ARM64 session's B2). It measures windows-arm64 only (OQ-400).*

**The repair holds on a real PowerShell, from 34 columns up.** "PD-TOOLS-001, REQ-TOOLS-099/128: at every width from 34 to
240 columns a hard-timeout reset restores PowerShell's directory and environment byte for byte" in `terminal.test.ts`, three
runs under each shell, green: at 34, 40, 64, 75, 76, 77, 120 and 240 columns, a directory of 170 characters, a `Path` with 24
extra entries, a 600-character value, `héllo-ü-日本-€`, and ``O'Brien $(whoami) `tick`` came back from the reset byte for byte, none
holding a `\r` or `\n`; a spawn variable the command removed stayed removed; the product's own capture read off each
width's screen parsed whole; `cmd.exe` resolved and `cmd /c ver` exited 0 after the reset. Every other variable survived,
with one exclusion under 5.1 only (the product's own empty `PSModuleAnalysisCachePath`,
[`windows-powershell-5-1-loses-…`](../windows-powershell-5-1-loses-the-spawn-environments-empty-psmoduleanalysiscachepath-across-a-reset.md)).
The capture took 139 to 220 ms against its 15 s bound (`SNAPSHOT_TIMEOUT_MS`); the restore line for that environment was 3,009
characters under 5.1 and 3,165 under pwsh, 8 variables; a 1 s hard cap's call returned after about 1.9 s.

**Not reached:** 20 and 33 columns. Below 34 no PowerShell call ends at all, so the reset is never reached there
([`below-34-columns-…`](below-34-columns-every-powershell-call-runs-to-its-hard-timeout.md)). *(Reached the same day, after
that note's repair: the case runs at 20 and 33 columns too and holds there under both shells.)* **Found beside it:** a restore
line whose `Set-Item` fails still exits 0, so it is reported restored
([`a-powershell-restore-whose-set-item-fails-…`](../a-powershell-restore-whose-set-item-fails-is-still-reported-restored.md)).

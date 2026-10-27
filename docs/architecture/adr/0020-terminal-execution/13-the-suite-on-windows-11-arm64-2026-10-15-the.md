# ADR-0020 — Terminal execution: PTY-backed persistent foreground sessions, pipe-backed background sessions — The suite on Windows 11 ARM64 — 2026-10-15, the PowerShell branch's first counted Windows run since 2026-10-02

Part 13 of 15 of [ADR-0020](../0020-terminal-execution.md), which indexes every part.

## The suite on Windows 11 ARM64 — 2026-10-15, the PowerShell branch's first counted Windows run since 2026-10-02

*Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, Electron 44.1.1 arm64, dev tree, at `b9e30052`; the full suite four
times ([first-executions](../../first-executions.md), the row of that date). It measures windows-arm64 only (OQ-400).*

**The shell the branch took was not the one installed.** `winget install Microsoft.PowerShell` gave this host pwsh 7.6.7 as
its MSIX package, reached through an App Execution Alias on `PATH`. `findShell` accepts a candidate only when
`existsSync(f) && statSync(f).isFile()`; on the alias Node answers `EACCES` and `false`, though spawning it runs pwsh. So
`findShell` passed over it and every real-PTY case of the first two runs ran under Windows PowerShell 5.1:
[`the-terminal-never-finds-a-pwsh-installed-as-an-app-execution-alias.md`](../../../defects/fixed/the-terminal-never-finds-a-pwsh-installed-as-an-app-execution-alias.md),
recorded, not repaired. "`pwsh` else `powershell`, presence-only availability" (the first execution above) holds only for a
pwsh that is a plain file on `PATH`. *(Repaired the same day on the owner's ruling: `findShell` and `findExecutable` take a
candidate through `presentExecutable` (`@rotaris/platform`), which accepts an alias — `stat` refused with `EACCES`, `lstat`
reading a link — and a real call through the MSIX pwsh's alias answered `Core`, exit 0.)*

**Under pwsh 7.6.6 arm64 (a zip install, first on `PATH`), `terminal.test.ts` passed 64 and skipped 45, `streams.test.ts`
15 and 6, `background.test.ts` 8 and 13**, every skip POSIX-only (`it.skipIf(PS)`, a `dash` or `bash` `/bin/sh`) or a proof
directory not given. Two cases were spelled for one host and were repaired in that change
([`seven-unit-cases-…`](../../../defects/fixed/seven-unit-cases-pin-a-posix-or-case-sensitive-host-and-go-red-on-windows.md),
item 7): the pure M1 case matched the staged script's path with `/`, and "the capture is the emulated screen" pinned pwsh 7's
`Format-List` padding, which 5.1 prints narrower. **Under 5.1, one more case went red: "a real diff-with-differences reads
success".** Its command is `git diff --no-index -- a b || true; git diff --no-index -- a b`; 5.1 cannot parse `||`, and the
call did not fail at once with the parse error but ran to its 15 s cap and reported `124`. That is the shape of the
single-line terminating-error bullet above, now seen on a parse error; the session's B3 measures it. Three cases the record
names for Windows never run on a Windows host: the OQ-168 cases "on win32 a poll after C-c writes nothing" (and its darwin
twin) and "on Windows a poll after C-c writes nothing into a program that survived the interrupt" act Windows out through
a POSIX shell and are skipped where `PS` holds.

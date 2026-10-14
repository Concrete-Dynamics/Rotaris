## A single-line PowerShell command that throws loses its end frame

**Repaired 2026-10-15** (B3 of the Windows ARM64 session, which repairs where it confirms). `wrapCommand` sends every
PowerShell command through the guarded payload the multi-line path already used, and parses the command alone before it
runs with the flag's line appended, so a parse error names only the command. Red before on this host (the case
"a single-line command that throws or does not parse ends with exit 1 …" in `terminal.test.ts`: 10.5 s at the cap), green
after under pwsh 7.6.6 and 5.1, three runs each of `terminal.test.ts`, `streams.test.ts` and `background.test.ts` (88
passed, 64 skipped). The scratch probe after: every command in the table below read exit 1, `shell_failure`, 125 to 233 ms,
no reset, on both shells; `exit 3` still ends the shell (`execution_error`, `session_reset`, about 1.5 s); a plain call costs
about 30 ms more. One case's spelling changed with it: "a real diff-with-differences reads success" wrote `… || true; …`,
which 5.1 cannot parse and now reports as its own exit-1 parse error, so PowerShell's spelling there is `;`. Left, recorded:
[`windows-powershell-5-1s-error-text-quotes-the-terminals-wrapper.md`](../windows-powershell-5-1s-error-text-quotes-the-terminals-wrapper.md).

Measured 2026-10-15 on Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, Electron 44.1.1 arm64, dev tree, at
`3c3f4478`, under pwsh 7.6.6 arm64 and Windows PowerShell 5.1.26100.9457, three runs each, every run alike (B3 of the
Windows ARM64 session; a scratch case on the real `TerminalManager`, `timeout: 5`, a 60 s no-output window, a fresh manager
per command, then a follow-up call):

| command (one line) | pwsh 7.6.6 | 5.1 |
| --- | --- | --- |
| `Write-Output 'a'; throw 'boom'` | 124 `timeout`, ~5.5 s, `session_reset`; output `a`, `Exception: boom`, `PS>` | the same; the error text quotes the wrapper's line |
| `throw 'boom'` | the same | the same |
| `Write-Error 'boom' -ErrorAction Stop` | the same | the same; the error text quotes the wrapper's exit expression (`} else { if ($null -ne $LASTEXITCODE …`) |
| `$ErrorActionPreference='Stop'; Get-Item C:\definitely\not\here.txt` | the same | the same |
| `Write-Output 'x'; if (` (a parse error) | 124 at ~5.5 s, nothing captured | the same |
| `Write-Output 'x' \|\| Write-Output 'y'`, and `&&` | success, 0 | 124 at ~5.6 s (5.1 has neither operator) |
| the two-line control `Write-Output 'a'` / `throw 'boom'` | **exit 1, `shell_failure`, 108 to 186 ms** | **the same** |

The same at the product's default no-output window. The follow-up call answers each time, after a reset
(`session_reinitialized: true`). So a command that fails at once is reported as one that hung for the whole hard cap, with
exit 124 and a reset that discards the session's state, where the same command over two lines reports its own failure in a
tenth of a second. The suite showed it too: under 5.1 "a real diff-with-differences reads success" (`… || true; …`) ran to
its 15 s cap, and "the capture is the emulated screen" (`… && …`) took 10,980 ms where pwsh took 389.

The cause is `wrapCommand`'s single-line path, `…; Write-Output '<start>'; <command>; Write-Output ('<end>:' + …)`: a
terminating error abandons the rest of the line, so the end frame never prints, and a line that does not parse runs
nothing at all, not even the start marker. ADR-0020 put the multi-line path in a `try` for exactly this reason ("The `try`
is what keeps a terminating error from eating the end frame and wedging the session until the hard cap"), and left the
single-line path without one.

## Specs

REQ-TOOLS-179 (a nonzero exit is the command's own, classified `shell_failure`), REQ-TOOLS-097 and REQ-TOOLS-099 (exit 124
and a reset are the hard timeout's, for a command that ran past it), REQ-TOOLS-098 (a soft pause is for a command still
running). A command that failed at once is reported as a timeout and its session reset.

## Relevant files

- `packages/agent-tools/src/terminal/foreground.ts` — `wrapCommand`'s PowerShell branch: the guarded multi-line path and
  the unguarded single-line one beside it.
- `packages/agent-tools/src/terminal/terminal.test.ts` — the two suite cases above, and the multi-line case that passes.

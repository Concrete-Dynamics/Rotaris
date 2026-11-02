## exit-trace-proof expects POSIX signal semantics on Windows

`pnpm exit-trace-proof` was first run on Windows by the Windows ARM64 session's C4 (Windows 11 ARM64 (build 26200.9457),
Node 24.18.0 arm64, Electron 44.1.1 arm64, dev tree, Git Bash, at `8b5b0c03`). On a quiet host it failed 10 of 37 checks, and
every red is the proof's Linux expectation, not the product's behaviour:

- **The run host killed from outside.** `process.kill(pid, 'SIGKILL')` is `TerminateProcess` on Windows, whose exit code
  libuv sets to 1. Main wrote `run host exited (1)` and `CHILD PROCESS GONE (Utility rotaris-run-host: killed, exit 1)`, both at
  `error`, as the proof wants them; the proof asks for exit 9, the Linux signal number.
- **The renderer crashed with SIGSEGV.** Node on Windows sends only `SIGINT`, `SIGTERM`, `SIGKILL` and 0, so
  `process.kill(pid, 'SIGSEGV')` threw, the proof's `catch` swallowed it, the renderer lived, and no `RENDERER GONE` line came.
- **The hang (`hang`, `hang-close`) by SIGSTOP.** The same: `SIGSTOP` threw and was swallowed, the renderer was never stopped,
  so "the stopped renderer answers nothing" failed, and `hang-close` closed in 180 ms instead of waiting out PD-SHELL-010's
  5 000 ms probe, which never fired.
- **`unsaved-sigterm`.** `process.kill(pid, 'SIGTERM')` is `TerminateProcess` as well: main exited 1 in 201 ms with no quit
  line. Windows has no signal a process can answer with its quit path, so the case measures nothing on Windows that the
  `unsaved-quit` case does not.

Every product reading the reds left was met: the orderly control, `main still answers` after the run host's loss, the quit
after the run host's loss exits 0 on the orderly path, the hung-renderer quit asks no guard (225 ms), and `unsaved-quit`
writes nothing (266 bytes before and after). On a host under a parallel session's test load (100% CPU, Defender at 178%)
two earlier runs stopped at the orderly control instead: main logged `main process exiting with status 0`, and the process was
not reaped for more than 15 s after it, once not even 5 s after SIGKILL; on the quiet host the same control passed.

## Specs

None in the product: REQ-MONITOR-131 and PD-MONITOR-002's exit trace wrote what Windows gave it. The proof's header says it
too: "Only Linux was run when this was written (2026-10-13); the other two are written, not run."

## Relevant files

- `apps/desktop/scripts/exit-trace-proof.mjs` — the `crash` case's exit-9 expectations and its `SIGSEGV`; the `hang` cases'
  `SIGSTOP`/`SIGCONT`; `unsaved-sigterm`'s `SIGTERM`.

## Repaired 2026-10-20 — the win32 branch sends what Windows can send

C4 repaired the proof's Windows branch, Linux's expectations unchanged (`apps/desktop/scripts/exit-trace-proof.mjs`):
`KILL_EXIT` is 1 on Windows and 9 elsewhere, for both of main's run-host lines; the renderer is ended with
`process.kill(pid)` (`TerminateProcess`) where POSIX sends SIGSEGV, and main writes `RENDERER GONE (killed, exit 1) for
file:///…`; the hang is `NtSuspendProcess`/`NtResumeProcess` (what `pssuspend` does) where POSIX sends SIGSTOP/SIGCONT; and
`unsaved-sigterm` checks on Windows what the signal does there — exit 1, no quit line — in place of the orderly path. The
suspension goes slightly past the item's authorization, which named the renderer's kill and the exit codes; without it the
two hang cases measure nothing on Windows. The header's "Only Linux was run" is kept, with the Windows result beside it.

Two runs in quiet windows (CPU under 40% for three samples first) passed whole, 36 of 36. Readings: the quit with the
renderer suspended exited in 2,117 and 1,287 ms; the person's close in 14,527 and 5,673 ms, PD-SHELL-010's probe line at
warn both times. Between main's last line and the process ending, a suspended renderer adds a tail that varied from about
0.5 s to 9 s (and 7.5 s on a run that began at 27% CPU, where `hang` read 12,107 ms and failed the 5,000 ms check; the 3.9 s before it was
the code-intelligence setup step's stop, PD-MCP-003's 2 s grace and the tree kill). `unsaved-sigterm`'s termination was reaped
in 6,638 and 55 ms. Three runs under a parallel session's load (100% CPU) stopped at the orderly control on that same reaping
tail. Main writes nothing after its exit line, so the tail is not in its log; what holds the process there (Electron's teardown, the suspended renderer, the scanner) was not separated.

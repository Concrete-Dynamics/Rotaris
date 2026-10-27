# ADR-0020 — Terminal execution: PTY-backed persistent foreground sessions, pipe-backed background sessions — A10 on PowerShell — 2026-10-15

Part 14 of 15 of [ADR-0020](../0020-terminal-execution.md), which indexes every part.

## A10 on PowerShell — 2026-10-15

*Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, dev tree, pwsh 7.6.6 and Windows PowerShell 5.1, three runs each, at
`f9076e70`; the Windows ARM64 session's B5.* A10's report-backs above were reasoned for PowerShell and measured on POSIX only.
On PowerShell: keystrokes left without Enter under a soft-paused command, by `is_input` and by send-keys, leak nothing into
the next call (its output, its live tap and its status its own; the paused command's late output handed over as earlier
output), and a native `cmd /c exit 3` before it leaves no stale status (the next call reads 0, or 1 where it fails). A paused
command that ends behind the next call reports its own status, 1. After C-c, a poll at once is OQ-168's soft pause, and the
next calls report the paused command's end once, with no status of its own, each with its own output; nothing of the later
calls or the snapshot reaches it. **Found:** PowerShell discards a line written in the same tick as the C-c, so the POSIX
case that writes its next command at once stays POSIX-only
([`on-windows-a-command-written-in-the-same-tick-as-a-c-c-is-swallowed.md`](../../../defects/on-windows-a-command-written-in-the-same-tick-as-a-c-c-is-swallowed.md)).
**Not run:** a long call after C-c (`1..20000`) and the wide echo on both roads.

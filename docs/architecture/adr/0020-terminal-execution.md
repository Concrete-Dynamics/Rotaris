# ADR-0020 — Terminal execution: PTY-backed persistent foreground sessions, pipe-backed background sessions

- **Status:** proposed
- **Date:** 2026-08-31
- **Origin:** EXEC (ADR-EXEC-06)
- **Depends on:** ADR-0002, ADR-0017, ADR-0022
- **Contains an escalation.**

## Parts

Since 2026-10-26 the rest of this document is in [`0020-terminal-execution/`](0020-terminal-execution/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](0020-terminal-execution/01-context.md) | Context |
| [02](0020-terminal-execution/02-alternatives-considered.md) | Alternatives considered |
| [03](0020-terminal-execution/03-decision.md) | Decision |
| [04](0020-terminal-execution/04-escalation-does-tmux-pool-ship.md) | Escalation — does `tmux-pool` ship? |
| [05](0020-terminal-execution/05-consequences-accepted.md) | Consequences accepted |
| [06](0020-terminal-execution/06-revisit-if.md) | Revisit if |
| [07](0020-terminal-execution/07-first-execution-2026-09-03-against-a-real.md) | First execution — 2026-09-03, against a real PowerShell through a real PTY |
| [08](0020-terminal-execution/08-second-first-execution-2026-09-12-four-defects.md) | Second first execution — 2026-09-12, four defects a real 22-minute run found |
| [09](0020-terminal-execution/09-second-first-execution-2026-09-12-four-defects-2.md) | Second first execution — 2026-09-12, four defects a real 22-minute run found *(continued, from "Reported back 2026-10-06, OQ-168 ruled by the owner …")* |
| [10](0020-terminal-execution/10-third-first-execution-2026-09-18-what-a-real.md) | Third first execution — 2026-09-18, what a real completed run did with the reset and the exit code |
| [11](0020-terminal-execution/11-fourth-first-execution-2026-09-29-a-sigint-the.md) | Fourth first execution — 2026-09-29, a SIGINT the shell discarded, sent again (OQ-135, R-067) |
| [12](0020-terminal-execution/12-fifth-first-execution-2026-10-04-the-sessions.md) | Fifth first execution — 2026-10-04, the session's shell is `bash` (`/bin/sh` on Fedora, RHEL, Arch) |
| [13](0020-terminal-execution/13-the-suite-on-windows-11-arm64-2026-10-15-the.md) | The suite on Windows 11 ARM64 — 2026-10-15, the PowerShell branch's first counted Windows run since 2026-10-02 |
| [14](0020-terminal-execution/14-a10-on-powershell-2026-10-15.md) | A10 on PowerShell — 2026-10-15 |
| [15](0020-terminal-execution/15-first-live-execution-on-windows-2026-10-20.md) | First live execution on Windows — 2026-10-20 |

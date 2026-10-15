## The window's kill of a soft-paused command does nothing and reports success

Measured 2026-10-15 on Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, dev tree, pwsh 7.6.6, at `a7540444` (the
Windows ARM64 session's B7; a scratch case on the real `TerminalManager`, never committed); read from the code too, and nothing
in it is Windows-specific. A command that soft-paused (`node parent.cjs`, which starts a grandchild and waits) was killed
from the terminal window through `m.streams.kill(foregroundStreamId(…))`. The stream answered `{"ok":true}`; two seconds later
the shell, the command and its grandchild were all still running, and the next call queued behind the paused command ran
to its own 15 s hard cap (124) before that reset ended them.

`ForegroundSession.killActive` acts only while a call is `running`; a soft-paused command is not the session's active call,
so it returns false, and the manager's stream control (`kill: () => { session.killActive(); }`, `index.ts`) ignores the
answer, so the window is told the kill happened. A soft-paused command is still the command running in that terminal: the
window's header and the preview show it running, and Kill is offered.

Not repaired (record-only).

## Specs

REQ-SHELL-092 ("Declining leaves the process alone; confirming terminates it"): confirming did not terminate it. REQ-TOOLS-128
(the stream's controls act on the session's command).

## Relevant files

- `packages/agent-tools/src/terminal/foreground.ts` — `killActive` (`if (!a || this.state !== 'running') return false`).
- `packages/agent-tools/src/terminal/index.ts` — the foreground stream's `kill` control, which drops the answer.
- `packages/agent-tools/src/terminal/streams.ts` — `StreamRegistry.kill`, which answers ok.

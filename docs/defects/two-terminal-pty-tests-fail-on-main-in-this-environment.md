## Two real-PTY terminal tests fail on `main` in this environment

`packages/agent-tools/src/terminal/terminal.test.ts` fails two cases, alone and in the full suite, on an unmodified `main`
(6d9305bc) as well as on a branch that touches no terminal code, so `pnpm check` is red here before any change:

- "REQ-TOOLS-097/098/179 (live-run L1): a command sh cannot expand or parse ends with its own exit status, never a soft pause"
- "REQ-TOOLS-127 (A10): the echo of a next call wider than the screen reaches neither road's poll of the paused call"

The first reads output containing the sentinel wrapper's own text (`__rot_…`, a run of `Q`, `"$?"`) where the test expects none
of it to leak, so the shell's echo of the wrapped command reaches the call's output. The whole file takes about 120 s.
Observed 2026-10-03 on Linux; not investigated further, so whether it is the shell, the PTY size or the harness is not known.

## Specs

REQ-TOOLS-097/098/179 (the command's own exit status, no leaked wrapper), REQ-TOOLS-127 (the next call's echo reaches neither
poll of the paused call).

## Relevant files

- `packages/agent-tools/src/terminal/terminal.test.ts` — the two failing cases (around line 1057 for the first).
- `packages/agent-tools/src/terminal/` — the terminal implementation the cases drive.

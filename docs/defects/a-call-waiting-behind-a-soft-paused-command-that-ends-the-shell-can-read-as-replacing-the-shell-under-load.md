## A call waiting behind a soft-paused command that ends the shell can read as replacing the shell under load

A terminal call made while a soft-paused command is still running waits behind it (OQ-164). When that command ends the
session's shell, the waiting call never ran — the shell that would have read it is gone — and the tool reports it so: "the
session's shell ended before the command ran (a soft-paused command ahead of it ended the shell), so the command never ran"
(OQ-144's shell-exit case). Under load the same call was once told the opposite: that it had itself replaced the shell. In
`pnpm check` on `d42bbac` (fin44's landing gate, load average about 5 on four CPUs, a sibling plan's gate beside it),
`terminal.test.ts`'s "REQ-TOOLS-098/100/103 (OQ-144, OQ-164): a soft-paused command that ends the shell ends a call waiting
behind it as never run, …" received, for the call behind `sleep 2; exit 4`: "This command was submitted while the soft-paused
command `sleep 2; exit 4` was still running, and waited behind it: that command ended 1.0 seconds after this command was
submitted, when the terminal session was reset, with no exit code. Terminal execution failed before completion: the command
replaced the session's shell (as `exec <program>` does), so the command never returned and has no exit code. …" — the waiting
call blamed for an `exec` it never made, and its own words contradicting the sentence before them. The same case passed alone
at once (2 passed, load about 5). Not reproduced on demand; the cause — which of the two diagnoses `foreground.ts` reaches when
the shell's exit and the queued call's dispatch fall close together — is not identified. Noticed 2026-10-14 by fin44's reviewer
(`fin44-supervision-and-match`) at its landing gate; recorded, not repaired (outside the bundle's tasks).

## Specs

REQ-TOOLS-098, REQ-TOOLS-100 and REQ-TOOLS-103, with OQ-144 (a command that ends the session's shell) and OQ-164 (a call that
waits behind a soft-paused command), as the case's own title cites them: a line the shell never read is reported as never run.
An agent told it replaced the shell may drop `exec` from a command that had none, or retry a command that never ran under a
different belief about why.

## Relevant files

- `packages/agent-tools/src/terminal/foreground.ts` — the diagnosis of a call that waited behind a soft-paused command: the
  "shell ended before the command ran" sentence and the "replaced the session's shell" sentence.
- `packages/agent-tools/src/terminal/terminal.test.ts` — the case that met it under load (about line 1889).
- `docs/defects/fixed/a-command-that-exits-the-session-shell-reads-as-a-soft-pause.md`,
  `docs/defects/fixed/a-call-made-while-a-command-is-soft-paused-waits-behind-it-unannounced.md` — the repairs this case pins.

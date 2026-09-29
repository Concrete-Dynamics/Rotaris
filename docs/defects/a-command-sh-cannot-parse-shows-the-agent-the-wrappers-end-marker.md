## A command `/bin/sh` cannot parse shows the agent the wrapper's end marker

When `/bin/sh` rejects a command's syntax, the POSIX wrapper's closing `printf '__rot_<nonce>_e:%s\n' "$?"` never
runs. The shell's echo of the whole wrapped line, marker included, then reaches the observation the MODEL reads, above
`/bin/sh: 32: Syntax error: "(" unexpected`. The call is reported as a soft pause with exit code `-1`. The cause is the
one [`a-posix-command-that-fails-to-expand-loses-its-end-marker`](a-posix-command-that-fails-to-expand-loses-its-end-marker.md)
records (L1): the command is not guarded, and a model writes bash (`<(…)` process substitution here) for a shell that
is `/bin/sh`. The symptom is new: that note, and
[`the-terminal-preview-shows-the-command-wrapper`](the-terminal-preview-shows-the-command-wrapper.md) (L9), say what the
agent reads is clean. Here it is not.

Noticed 2026-09-29 in the duress live run of branch `fix-child-report`, whose one failing check was "no end marker
leaked into what the model read"; recorded, not repaired.

## Specs

- `REQ-TOOLS-127`: every frame is faithful to what the command wrote; the wrapper is the product's, not the command's.
- `REQ-TOOLS-097` / `REQ-TOOLS-098` / `REQ-TOOLS-179`, as in the L1 note: a soft pause and `-1` for a command that
  exited at once.

## Evidence

- Pack `.live-run/runs/2026-09-29T08-18-41-076Z/duress/` (the `fix-child-report` worktree; git-ignored), session
  `059ae1d7`, tool call ordinal 232 (`Wave-3f` verifying, a `comm -13 … <(cat …)` line), first read by the model in
  traffic #152: `…| sed 's/^/custom-property-ish lines: /'; printf '__rot_aba84d55a39aa7bfcf607ad1_e:%s\n' "$?"` then
  `/bin/sh: 32: Syntax error: "(" unexpected`, then `[terminal_diagnostic]` with `"exit_code":-1,"outcome_kind":"soft_pause"`.

## Relevant files

- `packages/agent-tools/src/terminal/foreground.ts` — `wrapCommand`'s POSIX branch, and the filtering that strips the
  wrapper's echo from a command that finished, and not from one whose end marker never came.

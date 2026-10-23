## `pnpm preflight` passes the display check for a display no client can reach

`displayCheck` (`apps/desktop/scripts/preflight.mjs`) reports **PASS "the display is available (DISPLAY=…)"** on Linux
whenever `DISPLAY` is set. It never opens a connection, so it passes a display that no client can reach. Every Electron
launch a proof then makes exits at once with SIGTRAP, after Chromium's "Missing X server or $DISPLAY" and "The platform
failed to initialize. Exiting.". The proof reports "<launch> exited SIGTRAP", and the cause is the machine, not the
mechanism the proof measures.

Met on 2026-10-22 on the Linux agent host, while running the Tools suite for the dependency patch of R-081 (`pnpm worktree:new`
also runs the preflight, and it passed). An `Xvfb :99` started on 2026-10-13 was still running, but its socket file
`/tmp/.X11-unix/X99` was gone, and its abstract socket `@/tmp/.X11-unix/X99` is in another network namespace than the agent's
shell (`readlink /proc/<pid>/ns/net` differs). `DISPLAY=:99 pnpm preflight` passed. Twelve of the fifteen Tools proofs then
failed in seconds with SIGTRAP. The three that passed (`todo-proof`, `attachments-proof`, `terminal-stream-proof`) never
reached a launch that needs a window. The same proofs passed on a display the shell could reach.

Not repaired: it is outside that task. A likely repair is to try the connection on Linux, for example a connect to the
display's socket under `/tmp/.X11-unix/` or its abstract name, and to fail with the reason when neither answers.

## Specs

None. `pnpm preflight` is repository tooling (AGENTS.md, "The proof scripts — the rules they obey"); its contract is
that "a red is the machine, not a proof result", and this check stays green where the machine cannot run a proof.

## Relevant files

- `apps/desktop/scripts/preflight.mjs`: `displayCheck` reads `DISPLAY` and never connects.
- `apps/desktop/scripts/preflight.test.ts`: the cases pin the message for a set `DISPLAY`.
- `tools/worktree/new.mjs`: runs the preflight after a worktree's setup, so a fresh worktree reports the same pass.

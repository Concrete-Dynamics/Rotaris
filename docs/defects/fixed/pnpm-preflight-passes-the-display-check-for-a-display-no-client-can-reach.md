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

## Repaired — 2026-10-31

On Linux a set `DISPLAY` now has to be reached as well as named.
[`preflight.mjs`](../../../apps/desktop/scripts/preflight.mjs) reads it with `displayTargets`: `:N` and `unix:N` map to the
socket file `/tmp/.X11-unix/XN` and its abstract name `@/tmp/.X11-unix/XN`. A bare `:N` then adds TCP
`localhost:6000+N`, because libX11 falls back to it when neither socket answers (`DISPLAY=:78 xdpyinfo` with no
`X78` socket connected to a listener on `127.0.0.1:6078`); `unix:N` has no such fallback. `host:N` (also `host:N.M`) maps
to TCP `host:6000+N`. A shape it cannot read fails and says so. `probeDisplay` connects to each target in order until one
accepts, then closes the connection. It does this in a child `node`, because `runPreflight` is synchronous, and it gives
each target 2 s. `realIo` exposes it as `display`, so `displayCheck` stays pure and takes the probe's result. When a
target answers, the check keeps the old PASS text. When none answers, the check FAILs and names each target it tried
with its connection error. Unset `DISPLAY` and win32/darwin are unchanged, and those paths never call the probe. The
probe asks only whether the socket accepts a connection. It does not speak the X protocol, so an authorization refusal
would still pass.

Measured on the Linux agent host on `c583e1bc` plus this change. The state matches the note above: `Xvfb :99 -nolisten tcp`
was running, `/tmp/.X11-unix/` was empty, and `/proc/net/unix` held no X11 name. A connect to the socket file failed with
`ENOENT` and a connect to the abstract name failed with `ECONNREFUSED`.

- Before: `DISPLAY=:99 node apps/desktop/scripts/preflight.mjs` printed `PASS  the display is available (DISPLAY=:99)`
  and exited 0.
- After: the same command prints `FAIL  DISPLAY=:99 is set, but no client can reach it — tried socket
  /tmp/.X11-unix/X99 (ENOENT), abstract socket @/tmp/.X11-unix/X99 (ECONNREFUSED), tcp localhost:6099 (ECONNREFUSED);
  start an X server there, or unset DISPLAY and run under xvfb-run` and exits 1. `:99.0` prints the same three targets;
  `unix:99` prints the two sockets only. `127.0.0.1:99` prints `tcp 127.0.0.1:6099 (ECONNREFUSED)`.
- Reached: throwaway listeners stood in for X servers, one on the abstract name `@/tmp/.X11-unix/X187` and one on TCP
  `127.0.0.1:6187`. `DISPLAY=:187` and `DISPLAY=127.0.0.1:187` each printed `PASS  the display is available (…)` and
  exited 0. With only a TCP listener on `127.0.0.1:6078` and no `X78` socket, `DISPLAY=:78` printed
  `PASS  the display is available (DISPLAY=:78)` and exited 0 (the listener logged the connect), and `DISPLAY=unix:78`
  failed naming the two sockets.
- With `DISPLAY` unset, the output is byte-identical to the output before the change: `FAIL  no DISPLAY is set and
  xvfb-run is not on PATH`, exit 1. `DISPLAY=garbage` fails as a shape this check cannot read.
- The child's answer is read fail-closed (`readProbe`): empty, unparsable or malformed output, or a hit on a label that
  was not a target, is a miss on every target, and `displayCheck` passes only a string `reached`. The per-target logic
  (`connectTargets`) is the child's own source, so a test drives it with a fake socket: a timeout is a miss.
- [`preflight.test.ts`](../../../apps/desktop/scripts/preflight.test.ts): 25 passed. The new cases cover the check and
  the parser, a real connect against a listening and a missing Unix socket, a timeout and an error being misses, the
  child's unreadable answers, an unreadable `DISPLAY` failing the report through `probeDisplay`, and `runPreflight` with
  a fake `display` that throws if it is called on a path that must not probe. Against the pre-repair `preflight.mjs`,
  7 failed and 18 passed. The existing case "linux needs DISPLAY or xvfb-run; win32 and darwin need neither" passes
  unchanged in meaning; its set-`DISPLAY` line now carries a reached probe.

## A SIGINT that reaches a command as `/bin/sh` starts it does not stop the session

On a POSIX host a background session runs `/bin/sh -c '<command>'` in its own process group. There `send_signal
SIGINT`, or the stream-control interrupt, is reported sent ("Sent SIGINT to session …"), and yet the session can keep
running until the command it was starting ends by itself. For `sleep 30` that is 30 s. For a dev server or a watcher,
it is never.

Where `/bin/sh` is `dash`, the cause is how `dash` handles SIGINT:
- given `-c`, it catches SIGINT;
- it starts each command with `vfork`;
- until the child `exec`s, the child runs `dash`'s handler, which returns at once in a `vfork`ed child.

A SIGINT that reaches the group in that instant is therefore discarded by the command about to start. The shell keeps
its own copy and acts on it only when that command ends. SIGTERM, SIGHUP and SIGKILL are not caught there, so the
window is SIGINT's alone. A second SIGINT reaches the command, which by then has `exec`ed.

Measured by the diagnosis of
[`a-signal-sent-just-after-a-background-start-can-be-lost-under-load`](fixed/a-signal-sent-just-after-a-background-start-can-be-lost-under-load.md),
spawning as `spawnChild` does and signalling the group at once:
- `/bin/sh -c 'sleep 30'` under six CPU burners: 38 of 200 sessions still ran 3 s later;
- the same on an idle host: 1 of 100;
- `bash`, `exec sleep 30`, or the signal sent 50 ms after the start: none of 150.

The verifier of that repair reproduced it independently: 4 of 40 under load, and none of 30 with `bash`. The window
opens again at every command a script starts, not only at the session's start. It is widest while the host is loaded.

That note's own test flake is repaired by `9fc2fdc`: the case waits for its command and `exec`s it. This exposure in
the product is not repaired. Recorded 2026-09-29 under R-067.

## Specs

- `OQ-10` as ruled by [R-044](../product/requests.md#r-044): `send_signal SIGINT` stops a background session. Measured
  by the diagnosed note's own criterion, a signal reported sent that does not stop the session contradicts the ruling.
- `REQ-TOOLS-128`: the stream-control interrupt for a background session is SIGINT.
- `REQ-TOOLS-110`: `send_signal` sends the signal. That part is met, since every process of the group receives it.
- Whether the product owes more than the delivery is
  [OQ-135](../architecture/open-questions.md): re-delivering the signal, or launching a lone command by `exec`. Each
  repair changes what a command receives or how it is started.

## Relevant files

- `packages/agent-tools/src/terminal/background.ts`:
  - `BackgroundSession.signal` and `interrupt` deliver the signal once, to the group;
  - `BackgroundManager.start` spawns the shell with `-c`.
- `packages/agent-tools/src/terminal/index.ts`: `findShell` picks `/bin/sh` on every POSIX host.
- `packages/platform/src/spawn.ts`: `spawnChild`, with the detached process group.
- `packages/agent-tools/src/terminal/terminal.test.ts`: "OQ-10 (R-044): send_signal SIGINT stops a background session
  instead of refusing it". It avoids the window by design, so no test shows this exposure.

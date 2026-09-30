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
[`a-signal-sent-just-after-a-background-start-can-be-lost-under-load`](a-signal-sent-just-after-a-background-start-can-be-lost-under-load.md),
spawning as `spawnChild` does and signalling the group at once:
- `/bin/sh -c 'sleep 30'` under six CPU burners: 38 of 200 sessions still ran 3 s later;
- the same on an idle host: 1 of 100;
- `bash`, `exec sleep 30`, or the signal sent 50 ms after the start: none of 150.

The verifier of that repair reproduced it independently: 4 of 40 under load, and none of 30 with `bash`. The window
opens again at every command a script starts, not only at the session's start. It is widest while the host is loaded.

That note's own test flake is repaired by `9fc2fdc`: the case waits for its command and `exec`s it. This exposure in
the product is not repaired. Recorded 2026-09-29 under R-067.

## Specs

- `OQ-10` as ruled by [R-044](../../product/requests.md#r-044): `send_signal SIGINT` stops a background session. Measured
  by the diagnosed note's own criterion, a signal reported sent that does not stop the session contradicts the ruling.
- `REQ-TOOLS-128`: the stream-control interrupt for a background session is SIGINT.
- `REQ-TOOLS-110`: `send_signal` sends the signal. That part is met, since every process of the group receives it.
- Whether the product owes more than the delivery is
  [OQ-135](../../architecture/open-questions.md): re-delivering the signal, or launching a lone command by `exec`. Each
  repair changes what a command receives or how it is started.

## Relevant files

- `packages/agent-tools/src/terminal/background.ts`:
  - `BackgroundSession.signal` and `interrupt` deliver the signal once, to the group;
  - `BackgroundManager.start` spawns the shell with `-c`.
- `packages/agent-tools/src/terminal/index.ts`: `findShell` picks `/bin/sh` on every POSIX host.
- `packages/platform/src/spawn.ts`: `spawnChild`, with the detached process group.
- `packages/agent-tools/src/terminal/terminal.test.ts`: "OQ-10 (R-044): send_signal SIGINT stops a background session
  instead of refusing it". It avoids the window by design, so no test shows this exposure.

## Outcome

Repaired 2026-09-29 under R-067 (acceptance finding A8). The reading built is recorded in
[OQ-135](../../architecture/open-questions.md), which stays open for the owner's ruling. It is a narrow form of its first
repair: re-deliver only to a process that shows it never received the signal.
- **What changed.** After a SIGINT to the group, on Linux, `BackgroundSession.checkSigint` reads the process table at
  250 ms and at 1.5 s while the session still runs. It reads through `linuxProcessTable` in
  `packages/platform/src/process-group.ts`. A member that is alive, stands at SIGINT's default, was created within one
  second before the signal, and has not been re-sent it is sent SIGINT once more, alone (`missedSigint`). Each
  re-delivery is logged as a warning.
- **Why exactly those.** A process at the default that received SIGINT would be gone, so this re-delivery is its first
  SIGINT, not its second. A command that catches SIGINT is never sent a second. Neither is one that restored the
  default after its first and started more than a second before the signal. A process started after the signal is
  spared too.
- **Off Linux** nothing is checked: macOS's `/bin/sh` is `bash`, and on Windows every signal terminates the tree.

Measured through the product's own `BackgroundManager`: 200 sessions of `sleep 30`, each signalled the instant it
started, counting those still running 3 s later. Node 24, the 4-CPU container, shared with another workflow's agents
(load average 4 to 5 before any burner):

| delivery | six CPU burners | sessions still running | re-deliveries |
|---|---|---|---|
| once (the old code; branch head before the repair) | yes | 45 of 200 | — |
| once (the check disabled) | no | 12 of 200 | — |
| with the check | yes | 0 of 200; 0 of 200 | 30; 58 |
| with the check | no | 0 of 200 | 12 |

Pinned by `packages/agent-tools/src/terminal/background.test.ts`. Its case "REQ-TOOLS-128 / R-044: a SIGINT that lands
while dash is starting the command still stops the session" aims the signal at `dash`'s not-yet-`exec`ed child through
`/proc`, and requires that a hit occurred. It went red with the check disabled: its first attempt hit the window and the
session was still running 4 s later. It was green in four runs with the check. Two cases check what is spared, each
with no re-delivery: a command that catches SIGINT and shuts down over 2 s, and one that restores the default after its
first. `missedSigint` has pure cases, and `packages/platform/src/process-group.test.ts` covers the table's parsing and
the host's own `/proc`. The live run's `frictions` scenario, which stops a background command with SIGINT, is the
scenario to show it in the built app; its result is in the branch report.

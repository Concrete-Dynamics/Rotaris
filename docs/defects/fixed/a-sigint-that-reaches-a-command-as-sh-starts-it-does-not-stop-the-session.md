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
the product is not repaired. Recorded 2026-09-29 under R-067. *(Superseded by the Outcome below: repaired the same day.)*

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

Repaired 2026-09-29 under R-067 (acceptance finding A8), and its predicate corrected twice on 2026-09-30 in the same
round. The reading built is recorded in [OQ-135](../../architecture/open-questions.md), which stays open for the
owner's ruling. It is a narrow form of its first repair: re-deliver only to a process the product saw as the shell when
the signal was sent, and to what that process started since.
- **What changed.** `BackgroundSession.signal` reads the group the instant before it sends SIGINT
  (`ProcessTable.tree`, a walk of the shell's descendants through `/proc/<pid>/task/<pid>/children`, in
  `packages/platform/src/process-group.ts`, giving each member's name, parent, arguments and SIGINT standing). While
  the session still runs, `checkSigint` reads it again at 250 ms and at 1.5 s. `missedSigint` names a member the first
  reading found **the shell** (its name the shell's) and not ignoring SIGINT, that is now alive and **runs another
  image**: its name or its arguments (`/proc/<pid>/cmdline`) changed, whatever it now does with SIGINT. Where such a
  member had started nothing and is still the shell, it names what that member started since. With each it names the
  descendants the first reading did not hold, since they started after the signal. Each is sent SIGINT once, alone,
  and logged as a warning; one already sent it again is not named again, nor is what it starts afterwards.
- **Why exactly those.** A member that was the shell took the signal into the shell's handler if it took it at all (at
  the default it would be gone). The reading of an aimed signal found `dash` and its `vfork`ed child both `blocked`, and
  a signal landing there is lost with the image at `exec`; the first reading can also find `dash` still at the default,
  installing its handler, when it catches the signal and goes on to start the command. The new image, or the child
  started after the signal, never received it. A process the first reading found already running the command is never
  sent a second SIGINT, whatever it did with the first, and neither is what it starts on receiving it (a clean-up).
- **The first predicate, falsified and kept.** It re-delivered to every member alive at the default and created within
  one second before the signal, on the reasoning "a process at the default that received SIGINT would be gone". The
  verifier showed a command whose one-shot handler restored the default as it ran (`process.once('SIGINT')`, signalled
  the instant it was up) stands the same way: it was sent a second SIGINT that cut its 2 s shutdown off, and its status
  read `killed` with no "clean exit". Its statements that such a command is never sent a second were false.
- **The second predicate, falsified and kept.** It re-delivered only to a member the first reading found the shell
  holding SIGINT off that now stood **at SIGINT's default under another name**. The verifier's second round showed that
  misses what a dev server or a watcher is: Node installs its own SIGINT handler as it starts (so do Python and a
  shell), so the command that missed the signal stands `caught`, and a shell `exec`ing a shell keeps the name `sh`.
  Under six burners 27 of 150 Node sessions, 39 of 200 `sh -c 'sleep 30; echo x'` sessions and 19 of 200 `sh x.sh`
  sessions still ran on, with 0, 3 and 6 re-deliveries. Its residue, "two exposures remain, both narrow", was false:
  the second was every Node command. *(The earlier Outcome's words for it are replaced here.)*
- **The residue.** A member that `exec`s between the first reading and the delivery (one synchronous step, about 0.1 ms)
  received the signal as the command, and is sent a second if it is still alive at the check, which needs a handler the
  new image installed within that step. A script that traps SIGINT chose to absorb it and is overridden: the command it
  `exec`s afterwards (`trap … INT; …; exec server`) is sent the signal, and so are the commands its trap runs when the
  signal found the shell with nothing started.
- **Off Linux** nothing is checked: macOS's `/bin/sh` is `bash`, and on Windows every signal terminates the tree.

Measured through the product's own `BackgroundManager`: sessions each signalled the instant they started, counting
those still running 3 s later. Node 24, the 4-CPU container, shared with another workflow's agents (load average 4 to 5
before any burner on 2026-09-29, 1 to 5 on 2026-09-30). First, 200 sessions of `sleep 30`:

| delivery | six CPU burners | sessions still running | re-deliveries |
|---|---|---|---|
| once (the old code; branch head before the repair) | yes | 45 of 200 | — |
| once (the check disabled) | no | 12 of 200 | — |
| with the first predicate | yes | 0 of 200; 0 of 200 | 30; 58 |
| with the first predicate | no | 0 of 200 | 12 |
| once, after the reading before the signal (re-delivery disabled; 2026-09-30) | yes | 8 of 200 | — |
| once, after the reading before the signal (re-delivery disabled; 2026-09-30) | no | 0 of 200 | — |
| with the second predicate (2026-09-30) | yes | 0 of 200; 0 of 200 | 18; 14 |
| with the second predicate (2026-09-30) | no | 0 of 200 | 0 |
| once (the check disabled; 2026-09-30) | yes | 5 of 200 | — |
| with the predicate built (2026-09-30) | yes | 0 of 200 | 13 |
| with the predicate built (2026-09-30) | no | 0 of 200 | 1 |

Then the commands the second predicate missed, under six CPU burners unless stated (the second predicate's rows are the
verifier's; the others are the repair's, on 2026-09-30):

| command | second predicate | predicate built (re-deliveries) | the check disabled (no reading) |
|---|---|---|---|
| `node -e "setInterval(()=>{},1000)"` | 27 of 150; 28 of 150 | 0 of 150 (18) | 15 of 150; 32 of 150 (verifier) |
| the same with its own SIGINT handler that exits | 15 of 150 | 0 of 150 (27) | 7 of 150 |
| `sh -c 'sleep 30; echo x'` | 39 of 200; 32 of 150 | 0 of 200 (49) | 18 of 200 |
| `sh x.sh` (`sleep 30; echo done`) | 19 of 200 | 0 of 200 (45) | 28 of 200 |
| without burners: Node, `sh -c` | — | 0 of 150 (1), 0 of 200 (2) | — |

A command whose handler counts its SIGINTs and exits 2 s after the first, signalled the instant it started, received
two in none of 150 sessions under the burners; 13 received exactly one, each by a re-delivery.

Pinned by `packages/agent-tools/src/terminal/background.test.ts`:
- "REQ-TOOLS-128 / R-044: a SIGINT that lands while dash is starting the command still stops the session", for
  `sleep`, for Node (which catches SIGINT as it starts), and for a shell `exec`ing a shell. Each case aims the signal at
  the moment `dash`'s child appears, requires every session to stop, and requires that a check re-delivered within 400
  attempts. The Node and `sh -c` cases are red on the second predicate; the `sleep` case goes red with the check disabled.
- Three cases through the session's own seams (a scripted process table, a recorded signal primitive and the fake clock),
  independent of where a signal lands: a command that replaced the shell is sent it at the check, with the worker it
  started and not the clean-up it starts later, once; a group whose command received the signal is sent nothing more;
  only SIGINT is read. The first is red on the second predicate.
- Cases for what is spared, each with no re-delivery and the command's own shutdown finished: a command that catches
  SIGINT and shuts down over 2 s, and one that restores the default after its first, signalled 1.2 s after it is up and,
  in two shapes (`exec` and forked), the instant it is up. The last two were red on the first predicate.
- `missedSigint`'s pure cases, three of them red on the second predicate; `packages/platform/src/process-group.test.ts`
  covers the table's parsing (parent and arguments included), the descendant walk with its fallback, and the host's own
  `/proc`.

The live run's `frictions` scenario stops a background command with SIGINT long after it started. It shows the ordinary
SIGINT stop in the built app, not the window, which it never reaches; its result is in the branch report.

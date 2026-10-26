# ADR-0020 — Terminal execution: PTY-backed persistent foreground sessions, pipe-backed background sessions — Fourth first execution — 2026-09-29, a SIGINT the shell discarded, sent again (OQ-135, R-067)

Part 11 of 15 of [ADR-0020](../0020-terminal-execution.md), which indexes every part.

## Fourth first execution — 2026-09-29, a SIGINT the shell discarded, sent again (OQ-135, R-067)

The background session's signal delivery (REQ-TOOLS-110, REQ-TOOLS-128; OQ-10 as ruled in R-044) had been executed as
delivery once to the session's group. Acceptance finding A8 graded its known exposure a product defect. Where
`/bin/sh` is `dash`, a SIGINT landing between `dash`'s `vfork` and its command's `exec` is discarded by the command,
and the session runs on until the command ends. Measured through `BackgroundManager` on the branch before the repair,
45 of 200 `sleep 30` sessions signalled the instant they started were still running 3 s later under six CPU burners.
**Found: delivery reached every process, as decided, and did not stop the session, which R-044 rules it must.** The
repair keeps delivery to the group and adds a check ~~on Linux, the one host whose `/bin/sh` has the window~~ *on Linux,
where the session's shell is `dash` (corrected 2026-09-30, fix round 3; below)*. ~~At 250 ms and
1.5 s, while the session runs, the process table (`linuxProcessTable`, `@rotaris/platform`) is read for members that
never received the signal: alive at SIGINT's default, created within one second before it. Each is sent SIGINT once
more, alone (`missedSigint`), and the re-delivery is logged. After it, 0 of 200 ran on, with and without the burners.
A command that catches SIGINT is never sent a second.~~ *Falsified 2026-09-30 by the verifier, kept beside its
replacement: "alive at the default, created within a second before the signal" is also how a command stands whose
one-shot handler (`process.once('SIGINT')`) restored the default as it ran, so such a command signalled the instant it
was up was sent a second SIGINT that cut its shutdown off.* The group is now read the instant before the signal
(`ProcessTable.tree`, a walk of the shell's descendants, so the reading does not push the signal past the window), and
again at 250 ms and 1.5 s while the session runs. ~~A member is sent SIGINT once more, alone (`missedSigint`), only when
the first reading found it still the shell, holding SIGINT off (the aimed reading found `dash` and its `vfork`ed child
both `blocked`), and the later one finds it running another image at SIGINT's default. A process the first reading
found running the command is never sent a second. With that predicate 0 of 200 ran on under six burners (twice) and
without them; with re-delivery disabled, 8 of 200 still ran on under the burners.~~ *Falsified 2026-09-30 by the
verifier's second round, kept beside its replacement: "at SIGINT's default" and "its name changed" miss what a dev server
or a watcher is. Node catches SIGINT as it starts (as Python and a shell do), and a shell `exec`ing a shell keeps the
name `sh`; 27 of 150 Node sessions and 39 of 200 `sh -c 'sleep 30; echo x'` sessions still ran on under six burners,
with `sleep 30` alone passing.* A member the first reading found still the shell and not ignoring SIGINT is now sent it
again, alone, when it runs another image, told by its name **or its arguments** (`/proc/<pid>/cmdline`), whatever it now
does with SIGINT; where it had started nothing and is still the shell, what it started since is sent it; and with each,
its descendants the first reading did not hold. A process the first reading found running the command is never sent a
second, nor what it starts on receiving it. With that predicate 0 ran on of 150 Node, 200 `sh -c`, 200 `sh x.sh` and 200
`sleep 30` sessions under six burners, against 15, 18, 28 and 5 with the check disabled. *Falsified 2026-09-30 by the
verifier's third round, kept beside its replacement: "on Linux, the one host whose `/bin/sh` has the window" and "nor
what it starts on receiving it" hold of `dash` alone. Where `/bin/sh` is `bash` (Fedora, RHEL, Arch), `bash` absorbs a
SIGINT its command handled, goes on when that command exits 0, and `exec`s the last command of its `-c` list in place,
so that clean-up — a shell replaced after the signal, by name and arguments — was sent a second SIGINT that killed it,
under a false "vfork window" warning (measured through the manager with a `sh` link to `/bin/bash` 5.2, signalled 1 s
and 5 s after the start, with `;` and `&&`).* The check is now armed only where the session's shell is `dash`, told
once per manager by the shell file's real path (`hasVforkWindow`); any other shell is signalled once, and the same
command under `bash` completes with its clean-up and no warning. Aimed at `dash`'s window without burners, 0 of 900 ran
on either side of that correction. OQ-135 records the reading,
its residue (an `exec` inside the reading's step; a script that traps SIGINT overridden; a shell other than `dash` not
read), and stays open *(ruled 2026-10-06, [R-071](../../../product/requests.md#r-071): the narrow re-delivery accepted
as built where the session's shell is `dash` on Linux, with that residue; `PD-TOOLS-010`)*
([the note](../../../defects/fixed/a-sigint-that-reaches-a-command-as-sh-starts-it-does-not-stop-the-session.md)).

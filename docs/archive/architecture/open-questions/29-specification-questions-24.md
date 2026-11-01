# Archived open questions — Specification questions (24 of 27)

The ruled, closed, resolved and withdrawn entries of [part 29](../../../architecture/open-questions/29-specification-questions-24.md) of the [open-questions record](../../../architecture/open-questions.md), each moved here whole, under its own anchor, by `pnpm archive:migrate` (`tools/archive/migrate.mjs`); the part keeps one index line for each. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="oq-135"></a>

**OQ-135 — Does `send_signal SIGINT` owe the session's stop when the shell discards the signal?** *(REQ-TOOLS-110,
REQ-TOOLS-128; OQ-10 as ruled in [R-044](../../../product/requests.md#r-044). Raised 2026-09-29 under
[R-067](../../../product/requests.md#r-067) by the verification of the repair of
[`a-signal-sent-just-after-a-background-start-can-be-lost-under-load.md`](../../../defects/fixed/a-signal-sent-just-after-a-background-start-can-be-lost-under-load.md),
for the exposure recorded open in
[`a-sigint-that-reaches-a-command-as-sh-starts-it-does-not-stop-the-session.md`](../../../defects/fixed/a-sigint-that-reaches-a-command-as-sh-starts-it-does-not-stop-the-session.md).
~~Open;~~ ruled 2026-10-06; numbered OQ-134 on its branch, renumbered at the merge, OQ-132 having been taken on `main`.)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** SIGINT must stop the session: R-044's "stops" binds the product past delivery. The narrow re-delivery is accepted as built, where the session's shell is `dash` on Linux, with the residue this entry states. [`PD-TOOLS-010`](../../../product/directives/pd-tools-010.md#pd-tools-010) states it and extends REQ-TOOLS-110 and REQ-TOOLS-128.

REQ-TOOLS-110 says `send_signal` *sends* the signal. The product sends it to every process of the session's group and
reports it sent. R-044's ruling reads "SIGINT stops a background session". Where `/bin/sh` is `dash`, a SIGINT that
lands on a command between `dash`'s `vfork` and the command's `exec` is discarded by that command. The shell holds its
own copy until the command ends, so the session stops only then, and for a server never. The requirement does not say
whether the product answers for that shell behaviour. Each repair changes something no requirement states:
- **Re-deliver.** Check shortly after the signal that the group has ended, and send it again if it has not. A command
  that handles SIGINT — a server shutting down gracefully — then receives two, and many programs read a second
  interrupt as "quit now".
- **`exec` a lone command.** Launch a command that is one simple command as `exec <command>`, so `dash` does not fork.
  This takes the window away for that command only, and it changes which process leads the group and what the shell
  reports.
- **Another shell.** REQ-TOOLS-104 sends POSIX hosts to a POSIX shell, and `findShell` names `/bin/sh`. Choosing `bash`
  where it exists would change what every background command runs under.

**What the build proceeds under:** ~~delivery once, as REQ-TOOLS-110 states, with the session reporting what its
process does. A second `send_signal SIGINT` or interrupt stops a session the first one did not. The exposure is
recorded open in the note above, not repaired.~~ *Replaced 2026-09-29 under R-067 (acceptance finding A8, which
graded the exposure a product defect): the reading above left a dev server or a watcher running after "Sent SIGINT".
Measured through the product's own manager, 45 of 200 sessions ran on under six CPU burners, and 12 of 200 on the
shared host without them.*

*The reading built 2026-09-29, falsified 2026-09-30 and kept beside its replacement below:*

> The build now proceeds under a narrow form of the first repair: re-deliver only to a process that shows it never
> received the signal. After a SIGINT to a session's group, on Linux, the session reads the process table at 250 ms and
> again at 1.5 s while it is still running. `BackgroundSession.checkSigint` and `missedSigint` do the reading, over
> `linuxProcessTable` in `@rotaris/platform`. A member is sent SIGINT once more, alone, only when all three hold:
> - it is alive and stands at SIGINT's default — not catching, ignoring, blocking or already holding it;
> - it was created within one second before the signal was sent;
> - it has not been sent SIGINT again already.
>
> A process at the default that had received SIGINT would be gone, so such a member never received it. The re-delivery is
> therefore its first SIGINT, not its second. A command that catches SIGINT — a server shutting down gracefully — is never
> sent a second, however long it takes. The start-time bound spares one that restored the default after its first; a
> command that started more than a second before the signal cannot have been in the window. A process started after the
> signal is spared too. Each re-delivery is written to the log as a warning. After the repair, the same measurement left
> 0 of 200 running under load (58 re-deliveries) and 0 of 200 without burners (12).

*Falsified 2026-09-30 by the verifier of the same change: "a process at the default that had received SIGINT would be
gone" is false of a command whose one-shot handler restores the default as it runs (`process.once('SIGINT')`, C's
`SA_RESETHAND`). Signalled within a second of its start, such a command was sent a second SIGINT that cut its shutdown
off, so "a command that catches SIGINT … is never sent a second" did not hold.*

*The reading built 2026-09-30, falsified the same day and kept beside its replacement below:*

> The build now proceeds under a narrower form: re-deliver only to a process the product **saw in the window**. On Linux,
> the instant before a SIGINT is sent to a session's group, the session reads the group (`ProcessTable.tree`, a walk of
> the shell's descendants through `/proc`, a few reads, so it does not push the signal past the window it is read for).
> While the session still runs, it reads the group again at 250 ms and at 1.5 s. A member is sent SIGINT once more, alone
> (`missedSigint`), only when all of these hold:
> - the reading before the signal found it **the shell** — its name the shell's, not yet replaced by the command — and
>   holding SIGINT off: catching it, blocking it or holding it pending (the reading of an aimed signal found `dash` and
>   its `vfork`ed child both `blocked`);
> - the later reading finds it alive, **running another image** (its name changed: it `exec`ed), and at SIGINT's default;
> - it has not been sent SIGINT again already.
>
> That is the command `dash` was starting: the SIGINT was taken by the shell's handler in the shell's image and lost with it
> at `exec`. A process the first reading found already running the command is never sent a second SIGINT, whatever it did
> with the first, one-shot handlers included; a process started after the signal is not in the first reading. Two
> exposures remain, both narrow: a command that `exec`s and installs a one-shot handler between the reading and the
> delivery (one synchronous step) would be sent a second; and a command the window cost its SIGINT that installs a
> handler of its own before the 250 ms reading stands `caught` and is not sent one. With this predicate, 0 of 200 ran on
> under six CPU burners (twice; 18 and 14 re-deliveries) and 0 of 200 without them (none needed); with re-delivery
> disabled after the same reading, 8 of 200 ran on under the burners. The second and third repairs were not taken, since
> each changes what every command runs under. Off Linux nothing is checked: macOS's `/bin/sh` is `bash`, which has no
> window, and on Windows every signal terminates the tree (OQ-10).

*Falsified 2026-09-30 by the verifier of the same change (acceptance finding A8, fix round 2): "at SIGINT's default" and
"its name changed" do not hold of the commands a dev server or a watcher is. Node installs its own SIGINT handler as it
starts, as Python and a shell do, so a command that missed the signal stands `caught`; and a shell `exec`ing a shell
(`sh -c '…'`, `sh script.sh`) keeps the name `sh`. Measured through the manager under six CPU burners, 27 of 150
`node -e "setInterval(…)"` sessions, 39 of 200 `sh -c 'sleep 30; echo x'` sessions and 19 of 200 `sh x.sh` sessions
signalled the instant they started still ran 3 s later, with 0, 3 and 6 re-deliveries. "Two exposures remain,
both narrow" was false: the second was every Node command.*

The build now proceeds under this form: re-deliver to a process the product **saw as the shell** when the signal was
sent, and to what it has started since. On Linux, *where the session's shell is `dash` (added 2026-09-30, fix round 3:
see the correction after the reason below)*, the instant before a SIGINT is sent to a session's group, the session
reads the group (`ProcessTable.tree`, a walk of the shell's descendants through `/proc`: each member's name, parent,
arguments and SIGINT standing, a few reads, so the reading does not push the signal past the window it is read for).
While the session still runs, it reads the group again at 250 ms and at 1.5 s. `missedSigint` names:
- a member the first reading found **the shell** (its name the shell's), not ignoring SIGINT, that is alive and **runs
  another image**: its name or its arguments (`/proc/<pid>/cmdline`) changed, so a shell `exec`ing a shell counts. What
  it now does with SIGINT is not asked;
- where such a member had **started nothing** in the first reading and is still the shell, each child it has started
  since. The shell took the signal as it started (the first reading can find `dash` still at the default, installing
  its handler), went on, and started the command;
- with each, its descendants alive that the first reading did not hold, since those started after the signal.

A member already sent it again is not named again, nor is what it has started since. Each one named is sent SIGINT
once, alone, and the re-delivery is logged as a warning. The reason: a member that was the shell took the signal into
the shell's handler if it took it at all (at the default it would be gone), and a new image, or a child started after
the signal, never received it. What a process does with SIGINT says nothing about whether it received one. A process the
first reading found already running the command is never sent a second SIGINT, whatever it did with the first (one-shot
handlers included), and neither is what it starts on receiving it, such as a clean-up. *(That reason holds of `dash`
alone: corrected below.)*

*Falsified 2026-09-30 by the verifier of the same change (acceptance finding A8, fix round 3), and kept above: the check
was armed on every Linux host, whatever `/bin/sh` is, and "a member that was the shell took the signal into the shell's
handler … and a new image … never received it" is false where `/bin/sh` is `bash` (Fedora, RHEL, Arch). There `bash`,
waiting on a command that handles SIGINT, absorbs the signal; when that command exits 0 it goes on, and `exec`s the last
command of its `-c` list in place (bash 5.1 on). That clean-up changes the shell member's name and arguments, so it was
named and sent a second SIGINT that killed it, under a warning naming a "vfork window" bash does not have; and "neither
is what it starts on receiving it, such as a clean-up" did not hold. Measured through the manager with a `sh` link to
`/bin/bash` 5.2, the command `node -e "<SIGINT handler, exit 0 after 100 ms>"; node -e "<clean-up printing over 1.5 s>"`
signalled 1 s and 5 s after its start, with `;` and with `&&`: the session read `killed` after "cleanup start", where
with no reading it completed with exit 0 after "cleanup done". `dash` under `-c` ends on the signal once its running
command ends and starts nothing more, so the same command under `dash` stops after the handler, with no re-delivery.*

*Since then the check is armed only where the session's shell has the window: `dash`, told once per manager by the shell
file's real path (`hasVforkWindow`; `/bin/sh` is a link to it on Debian and Ubuntu). Any other shell is not read, and
its sessions are signalled once, as REQ-TOOLS-110 states. With `bash` as `/bin/sh` the same command now completes with
exit 0 after "cleanup done", with no reading and no warning, at 1 s and at 5 s, with `;` and `&&`. The `dash` path is
unchanged: aimed at the window without burners, 0 of 900 sessions ran on (29 re-deliveries; 20 of 900 with the code
before this correction, the same rate within the spread).*

The residue:
- a member that `exec`s between the first reading and the delivery (one synchronous step, about 0.1 ms on this host)
  received the signal as the command, and is sent a second if it is still alive at the check. That needs a handler
  installed by the new image within that step;
- a script that traps SIGINT (`trap … INT`) chose to absorb it, and is overridden: its command is sent the signal when
  the script `exec`s it afterwards (`trap … INT; …; exec server`), and so are the commands its trap runs when the
  signal found the shell with nothing started;
- a shell other than `dash` that loses a SIGINT across its fork, if one does, is not read (none has been measured to;
  `bash` has no window), nor is a `dash` a command starts itself where the session's shell is another.

Measured 2026-09-30 through the product's own manager, each session signalled the instant it started and counted 3 s
later, under six CPU burners unless stated, on a host shared with another workflow (load average 0.5 to 5):

| command | this reading: still running (re-deliveries) | the check disabled (no reading) |
|---|---|---|
| `node -e "setInterval(()=>{},1000)"` | 0 of 150 (18) | 15 of 150 |
| the same with its own SIGINT handler that exits | 0 of 150 (27) | 7 of 150 |
| `sh -c 'sleep 30; echo x'` | 0 of 200 (49) | 18 of 200 |
| `sh x.sh` (`sleep 30; echo done`) | 0 of 200 (45) | 28 of 200 |
| `sleep 30` | 0 of 200 (13) | 5 of 200 |
| without burners: Node, `sh -c`, `sleep` | 0 of 150, 0 of 200, 0 of 200 (1, 2, 1) | — |

A command whose handler counts its SIGINTs and exits 2 s after the first, signalled the instant it started, received
two in none of 150 sessions; 13 received exactly one, each by a re-delivery (the rest died of the signal before their
handler was installed). The second and third repairs were not taken, since each changes what every command runs under.
Off Linux nothing is checked: macOS's `/bin/sh` is `bash`, which has no window, and on Windows every signal terminates
the tree (OQ-10). On Linux, a session whose shell is not `dash` is not read either (2026-09-30, fix round 3).

**What a ruling decides.** Whether R-044's "stops" binds the product past delivery, and if so, which of the three
repairs is acceptable, or whether the window is accepted as the shell's. Since 2026-09-29 the build takes the narrow
re-delivery above, so a ruling against re-delivery removes it. ~~A ruling for it also decides whether the two remaining
exposures stated above are accepted.~~ *(Replaced 2026-09-30: the second of those two was every Node command, and not
narrow.)* A ruling for it also decides whether the residue stated above is accepted: a second SIGINT to a command that
`exec`ed within the reading's step, and a trapping script's choice overridden; and whether a shell other than `dash`
is left unread.

<a id="oq-136"></a>

**OQ-136 — How long does an empty poll wait for a soft-paused command?** *(REQ-TOOLS-096, whose empty `command`
"polls for more output after a soft pause"; REQ-TOOLS-097, whose no-output window bounds the command's own call and
does not name a poll; REQ-TOOLS-098, whose empty-capture observation states "the elapsed no-output window". Raised
2026-09-29 by the repair of live-run finding L2 under [R-067](../../../product/requests.md#r-067),
[`an-empty-poll-after-a-soft-pause-says-thirty-seconds-passed.md`](../../../defects/fixed/an-empty-poll-after-a-soft-pause-says-thirty-seconds-passed.md).
~~Open.~~ Ruled 2026-10-06.)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** confirmed as built: a poll returns at once, and an empty one states the time since the previous observation, the time since the command last wrote, and that a poll does not wait for output.

No requirement says how long a poll waits. The product's poll returns at once with what has arrived since the
previous observation. Before this entry its empty answer repeated the soft pause's own sentence, "No output for 30
seconds", although it had waited under a millisecond. In the first live run of 2026-09-29 the model counted thirty
seconds a poll, polled five times in 21.6 s, tripped the loop supervisor, and interrupted a command that had already
exited. An agent that wants to wait has no way to: the session's shell is busy, and a new command would be typed into
the running command's input.

**What the build proceeds under:** a poll returns at once, as before. An empty one states what it measured — the time
since the previous observation of the command, the time since the command last wrote anything (the elapsed
no-output window, REQ-TOOLS-098), and that a poll does not wait for output. The case "REQ-TOOLS-098 (live-run L2): …"
in `terminal.test.ts` pins that reading.

**What a ruling decides.** Whether a poll may wait — for new output, for the command's end, or up to the no-output
window again, whichever comes first — before it answers. Waiting would make a poll loop cost time rather than turns;
it would also make a poll a second soft pause, which REQ-TOOLS-097 does not name.

<a id="oq-137"></a>

**OQ-137 — Does choosing `plan` in the Settings Runtime category re-arm a released session?** *(`PD-ORCH-003`, whose
re-arm is "the user choosing `plan` on the run-start control while the session holds a release, which re-arms that
session in the same gesture that writes the setting", and whose surface clause asks every surface offering the mode for
a released session to state the release; REQ-ORCH-152, which offers the mode "both where a run is started in the
desktop interface and in the settings interface"; REQ-CONFIG-320, whose selector "defers to Save like the rest of
destination 1". Raised 2026-09-29 by the repair of
[`the-run-start-setting-says-the-plan-gate-is-not-built.md`](../../../defects/fixed/the-run-start-setting-says-the-plan-gate-is-not-built.md)
under [R-067](../../../product/requests.md#r-067). ~~Open.~~ Ruled 2026-10-06.)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** confirmed as built: choosing `plan` in the Settings Runtime category re-arms nothing, and its hint states the release and how to plan the next run again. [`PD-ORCH-003`](../../../product/directives/pd-orch-003.md#pd-orch-003) revision 3 names the run-start control as the composer's chip.

The directive names "the run-start control" in the singular. The product has two surfaces offering the mode: the
composer's run-start chip, which writes the setting at once and sends `session.planRearm` when `plan` is chosen on a
released session (ADR-0062, the runtime view), and the Settings Runtime category's selector, which only changes the
pending value until Save and sends nothing to a session. In Settings the gesture and the write are two acts, the
selector usually already reads `plan` on a released session (an approval never writes the mode), and the category is
about the workspace's configuration rather than the followed session.

**What the build proceeds under:** the Settings selector re-arms nothing. Its hint states what `plan` does, and, when
the followed session holds a release, that the session is released, that its runs start without the gate whatever the
setting says, and that choosing Plan first on the composer's run-start control plans its next run again. The cases in
`packages/ui/src/settings/run-start-hint.test.ts` and `settings-proof` launch 7 pin that reading.

**What a ruling decides.** Whether a Save that writes `plan` (or a Save that leaves `plan` in place) while the followed
session holds a release should also re-arm that session, and if so whether it should re-arm only the followed session
or every released session of the workspace.

<a id="oq-138"></a>

**OQ-138 — Do the tool results whose requirements spell a plural marker keep it, when the tool row draws them?**
*(REQ-SHELL-044, "the literal parenthesised '(s)' form is never rendered anywhere in the product"; REQ-TOOLS-110's
`Sent <n> byte(s) to session <id>.`; REQ-TOOLS-134's `N match(es) for '<pattern>':`; REQ-LIBRARY-100's
`<N> artifact(s):`; REQ-LIBRARY-089's refusal that "begins `Invalid tag(s): `"; REQ-CHAT-168, which makes its own
document's markers illustrative for human-readable messages and leaves "a string that is part of a machine-readable
contract" unaffected; REQ-CHAT-166, which governs whether the tool row shows a tool's result. Raised 2026-09-29 by the
repair of live-run finding L11 under [R-067](../../../product/requests.md#r-067),
[`a-literal-plural-marker-is-rendered-in-sign-in-notices.md`](../../../defects/fixed/a-literal-plural-marker-is-rendered-in-sign-in-notices.md).
~~Open.~~ Ruled 2026-10-06.)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** confirmed as built, the four strings treated as fixed contract text: REQ-TOOLS-110's, REQ-TOOLS-134's, REQ-LIBRARY-100's and REQ-LIBRARY-089's markers stay as spelt, wherever the tool row draws them. [`PD-SHELL-006`](../../../product/directives/pd-shell-006.md#pd-shell-006) narrows REQ-SHELL-044.

A tool's result is text for the model, and the four requirements above fix it word for word. The transcript's tool row
also draws that result, as the first line of its preview and in full under OUTPUT (`ui/transcript/Row.tsx`), so
REQ-SHELL-044's "anywhere in the product" reaches it there. The other product-wide statements of the rule (REQ-CHAT-168
for the conversation, REQ-HOOKS-054 and REQ-HOOKS-106 for hooks) each read their own domain's markers as illustrative.
None says the same of the tools or the Library.

**What the build proceeds under:** the four texts keep their markers exactly as their requirements spell them. The
repair's brief treated text returned to a model as outside the rule, and these four are the only such texts a
requirement fixes. Every other tool result the build words itself (line and occurrence counts, the todo and delegation
messages, the terminal's list and output warnings) agrees with its count. `tools/check-plural-markers.mjs` names the
four in its `ALLOWED` list, and fails `pnpm lint` on any other literal marker in a string the product can draw.

**What a ruling decides.** Whether those requirements' markers are illustrative, as REQ-CHAT-168 says of its own, so
that the four texts agree with their counts like the rest. Or whether they are contract strings a caller may match, so
that REQ-SHELL-044's "anywhere" excepts a tool's result, or the tool row draws them differently.

<a id="oq-139"></a>

**OQ-139 — May a `write_file` call with no `operation` be read as the one operation its other arguments allow?**
*(REQ-TOOLS-135, which names `operation` as `write_file`'s selector; REQ-TOOLS-032, which requires three repairs before
schema validation and refuses a payload that is still invalid after them. Raised 2026-09-29 by the partial repair of live-run
finding WF1 under [R-067](../../../product/requests.md#r-067),
[`write-files-first-use-refusal-recurred-under-duress.md`](../../../defects/fixed/write-files-first-use-refusal-recurred-under-duress.md).
Open until 2026-10-06; ruled then, below.)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** as recommended, a `write_file` call with a path
and content, no `operation` and no field only another operation reads (`old_string`, `new_string`, `insert_line`, a true
`replace_all`) is read as a `create` when its file does not exist, and its result says so; a call naming an existing file
is refused as before, saying the file exists. Minted as [`PD-TOOLS-007`](../../../product/directives/pd-tools-007.md#pd-tools-007), which
extends REQ-TOOLS-032, and built under it (fin21).

The refusal names the field and gives an example. Since this repair the tool's description does too, and the schema
sent to the model has always marked `operation` required. Even so, the 2026-09-30 duress run had a child send `path` and
`content` with no `operation`. That was 1 of 4 children's first `write_file`, against 2 of 4 before the description
named the field. The child then sent its whole 224-line file a second time. Wording cannot guarantee a first use. Only
reading the missing selector from the call could: `path` and `content` on a path that does not exist can only mean
`create`.

**What the build proceeds under:** no inference. The call is refused as REQ-TOOLS-032 says, with the field named and
an example, and the description names the field, its values and each one's fields.

**What a ruling decides.** Whether REQ-TOOLS-032's three repairs may gain a fourth for this case. That repair would
read `create` from a call with `path` and `content`, no `operation` and no existing file, and say in the result that it
did. It would change what the gate executes and what a session approval matches (PD-TOOLS-004), so the requirement has
to allow it before the code can.

**Seen again 2026-10-01, on merged `main` `71ad8e8`.** The duress run (pack
`.live-run/runs/2026-10-01T03-15-27-194Z`, session `57095770`) refused 2 of 5 children's first `write_file` for want of
`operation`. Those were #126 (`design-decisions`, `docs/decisions.md`) and #244 (`verify-result`,
`docs/verification.md`), against 1 of 4 on 2026-09-30. Regenerating cost about 77.5 s and about 7.0k output tokens. Both
calls sent `path` and `content` for a file that did not yet exist, the case a fourth repair would read as `create`. The
note carries the per-call figures. The build still proceeds under the reading above. This question stays open and is
the owner's to rule.

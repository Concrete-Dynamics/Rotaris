# Open questions — Specification questions (25 of 27)

Part 30 of 68 of the [open-questions record](../open-questions.md), which indexes every part. Holds OQ-141 – OQ-146.

**OQ-141 — What becomes of a workspace's initialization run when its window closes other than as a switch's outgoing
window?** *(REQ-WORKSPACE-013, which cancels "a background initialization run still under way in the outgoing window"
of a switch on REQ-WORKSPACE-109's terms and records nothing for it; REQ-WORKSPACE-109, whose cancellation lets "a task
already under way … reach its own conclusion", and which says of closing only "the application"; REQ-WORKSPACE-084,
every attempted task given exactly one recorded outcome; PD-SHELL-001, under which "closing the added window changes
nothing else". Raised 2026-09-30 by the verification of the repair of
[`a-workspace-switch-never-cancels-the-outgoing-initialization-run.md`](../../defects/fixed/a-workspace-switch-never-cancels-the-outgoing-initialization-run.md)
under [R-067](../../product/requests.md#r-067). ~~Open.~~ Ruled 2026-10-06.)*

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** confirmed as built: REQ-WORKSPACE-013's rule applies to every run of a workspace no window holds any more, in all three cases, a user-started run included; the run is cancelled on REQ-WORKSPACE-109's terms and nothing is recorded for it.

REQ-WORKSPACE-013 names one case: a switch's outgoing window, with a background run under way. The repair made main
tell the initialization coordinator whenever no live main window holds a workspace any more (`MainWindows`'
`workspaceClosed`, answered by `InitializationCoordinator.close`), and that moment also comes in three cases the
requirement does not name:

1. a plain close of one of several main windows (PD-SHELL-001), the workspace being open in no other;
2. the replacement window a switch built and then closed because the old window vetoed its own close;
3. a run the user started from the setup dialog (REQ-WORKSPACE-110), not a background run, under way in a window that
   closes by either route above or by a switch.

In each, the requirements are silent on whether the run is cancelled at all, and, if it is, whether the outcome of a
task already under way that ends after the close is recorded (REQ-WORKSPACE-109 and REQ-WORKSPACE-084 alone would
record it; REQ-WORKSPACE-013 records nothing, for its one case).

**What the build proceeds under:** REQ-WORKSPACE-013's rule, applied to every run of a workspace no window holds any
more. The run is cancelled on REQ-WORKSPACE-109's terms (no task that has not started begins, the run host ends what
the task under way launched, REQ-WORKSPACE-092), nothing is recorded for it even when the task under way ends in
success, nothing of it is published or bannered, and the tasks stay pending for the next open of that workspace, which
is a new open with its own automatic resolution (REQ-WORKSPACE-102). The reasons: once no window holds the workspace,
no surface can show the run's progress (REQ-WORKSPACE-109) or its failure banner (REQ-WORKSPACE-103), and the setup
prompt and composer gate it answers belong to a window that is gone; a recording that lands after the close would be
the one write to that workspace's marker with no window on it; and one rule for "no window holds it" keeps the switch,
whose Windows orderings are not yet shown in the built app, from depending on which window closed first. A workspace
still held by another window is not closed, so PD-SHELL-001's "changes nothing else" holds for every other window. One
thing is left as it was: a resolution under way at the close that finds nothing applicable still writes its silent
`last_run` stamp (REQ-WORKSPACE-083), which records no run. `InitializationCoordinator.close`'s doc comment and
`initialization.test.ts`'s "closing a workspace" cases state and pin this reading.

**What a ruling decides.** For each of the three cases, whether the run is cancelled when its window closes, or left
to end on its own with its outcome recorded as REQ-WORKSPACE-084 would have it; and, for a user-started run, whether
closing its window is a cancellation the user asked for.

**OQ-142 — Which stop reason decides the improvement skip list for a run whose recording failed: the one the run
reports, or the one its record holds?** *(REQ-ORCH-137, whose skip list names "the stop reason"; REQ-LIBRARY-032, which
compares "the run's recorded stop reason" and says a stop reason outside the list always yields a job; REQ-EVENTS-088,
under which a failed recording step stops every further authoritative write for the run. Raised 2026-09-30 by the
verifier of the repair of
[`an-improvement-capture-racing-the-quit-reads-a-closed-store-and-rejects-unhandled.md`](../../defects/fixed/an-improvement-capture-racing-the-quit-reads-a-closed-store-and-rejects-unhandled.md)
under [R-067](../../product/requests.md#r-067). ~~Open.~~ Ruled 2026-10-06.)*

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** confirmed as built: REQ-ORCH-137's reading governs, so a run that ended on a recording failure yields no improvement job and the capture reads nothing.

The two readings agree for every run whose record holds its own ending. They part only under REQ-EVENTS-088. The engine
then reports the run as `agent_session_aborted`, with completion unconfirmed. The record cannot be written any further,
so it keeps the stop reason it last held, which may be none or an earlier run's. REQ-ORCH-137's reading, of the result,
skips the pass. REQ-LIBRARY-032's reading, of the record, yields a job whenever the held value is off the list, and the
analysis would then be drawn from a record the run itself calls unconfirmed.

**What the build proceeds under:** REQ-ORCH-137's reading. The run host's post-run capture (`captureAfterRun`,
`apps/desktop/src/run-host/improvement-capture.ts`) checks the stop reason of the run's result before it asks main for
history or reads the store, so a run that ended on a recording failure yields no job. That check exists so a run the quit
ended never reaches a store the quit is closing. `captureImprovementJob` still applies REQ-LIBRARY-032's check against
the record to every run that reaches it. Before this repair, the capture read the record alone, and in this case could
yield a job. `improvement-capture.test.ts` pins the reading: a result of `agent_session_aborted` over a record that
still holds `completed` yields no job and reads nothing.

**What a ruling decides.** Whether REQ-LIBRARY-032's "recorded stop reason" means the stop reason the run reports as
recorded, so that a failed recording leaves no stop reason to compare and REQ-ORCH-137's skip applies. Or whether the
record governs even then, so that the capture must read the store before it may skip.

**OQ-143 — Which status and exit code does a background session read when its process could not be started?**
*(REQ-TOOLS-109, REQ-TOOLS-179, REQ-TOOLS-100, REQ-TOOLS-103, REQ-TOOLS-112. Raised 2026-09-30 by the repair of
[`a-background-session-whose-spawn-fails-reads-failed-with-exit-minus-one.md`](../../defects/fixed/a-background-session-whose-spawn-fails-reads-failed-with-exit-minus-one.md)
under [R-067](../../product/requests.md#r-067). ~~Open;~~ ruled 2026-10-06; numbered OQ-142 on its branch, renumbered OQ-143 at the merge, OQ-142
having been taken on `main`.)*

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** confirmed as built: a background session whose process could not be started reads `failed` with a null exit code, every poll or termination of it an `execution_error`, and an `error` raised once the child has a pid is not its end.

Node reports some spawn failures synchronously and others — ENOENT and EACCES among them — only after `spawn` has
returned, through the child's `error` event and never its `exit`. For the first kind the product already answers the
start itself as an `execution_error` with no exit code (`The background command could not be started: …`). For the
second, `start` has already returned `Background session started`, so the session exists, and the failure first
shows at the poll. REQ-TOOLS-109's status vocabulary is closed — `running`, `completed` (exit 0), `failed` (nonzero),
`killed`, `timeout` — and names no status for a command that never ran. REQ-TOOLS-179 gives −1 to `killed` alone on a
background session, and keeps "0/nonzero" for "the command's real outcome", which a command that never ran does not
have. REQ-TOOLS-103 makes any failure "before the command completes" an `execution_error` that quotes the error.
Before this entry such a session read `failed (exit -1)`, `background_terminal`, with no `failure_kind`.

**What the build proceeds under** (`BackgroundSession`'s `error` handler in
`packages/agent-tools/src/terminal/background.ts`, `sessionAction`'s `finish` in `terminal/index.ts`):
- **The status is `failed`.** It is the only terminal status of REQ-TOOLS-109 that is not an end the product
  imposed, and REQ-TOOLS-112 already reads it at `error`.
- **The exit code is null.** The command has none, as the synchronous refusal has none. The diagnostic block drops
  the key (REQ-TOOLS-100), the list's structured entry carries `exit_code: null` and the text table `-`, and the
  session's live stream ends with no exit code, which the terminal surface draws as `exited`.
- **Every poll or termination of it is an `execution_error`**, error severity, `error_class` `ExecutionError`, with a
  detail that states the session's status and then that terminal execution failed before completion, quoting the
  error (REQ-TOOLS-103). REQ-TOOLS-112's first test decides the outcome, so it is not `background_terminal`.
- **An `error` the child raises once it has a pid is not its end.** It is warned about, and the session keeps waiting
  for its `exit`, which still comes.

The case "REQ-TOOLS-100/103/179: a spawn that fails after start returns …" in `terminal/terminal.test.ts` pins this
reading, and the case "REQ-TOOLS-179 (OQ-143): …" in `terminal/streams.test.ts` pins the stream's end.

**What a ruling decides.** Whether REQ-TOOLS-109's `failed` covers a command that never ran with no exit code, or
whether it needs a code of its own (126 is sandbox-unavailable's, and 127 is the shell's convention for a command it
could not find), or a status the vocabulary does not have; and whether such a spawn should instead be answered at
the start, by waiting for Node's `spawn` or `error` before `start` returns.

**OQ-144 — What does a foreground call answer when its command replaces the session's shell, and what becomes of the
session?** *(REQ-TOOLS-097, REQ-TOOLS-098, REQ-TOOLS-103, REQ-TOOLS-104, REQ-TOOLS-179; `PD-TOOLS-001`. Raised
2026-09-30 by the repair of
[`a-command-that-replaces-the-shell-reads-as-a-soft-pause.md`](../../defects/fixed/a-command-that-replaces-the-shell-reads-as-a-soft-pause.md)
under [R-067](../../product/requests.md#r-067), acceptance finding A9. ~~Open;~~ ruled 2026-10-06; numbered OQ-143 on its branch, renumbered
OQ-144 at the merge, OQ-142 having been taken on `main`.)*

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** confirmed as built: a command that replaces or ends the session's shell ends the call at once, the session keeps or respawns the shell it started with the snapshot re-applied, and a background job the exiting command left behind keeps running.

A foreground command that replaces the shell — `exec bash`, `exec sh`, any `exec <program>` — keeps the shell's pid
and never returns to the rest of the wrapped line, so the end frame never prints. Before this entry the call waited out
the no-output window and returned a soft pause (REQ-TOOLS-098: exit −1, "The process may still be running") for a
command that had finished at once, and every later call ran in the new program, not the shell the tool description
names (REQ-TOOLS-104 on Windows, and the POSIX sentence live-run L1's repair added elsewhere). No requirement says
whether a command may replace the session's shell, whether the tool refuses or warns about one, or what the call
answers when one does. A PowerShell session has no `exec`, so the question is the POSIX backend's.

**What the build proceeds under** (`ForegroundSession` in `packages/agent-tools/src/terminal/foreground.ts`, the
detail and the description in `terminal/index.ts`):
- **The session keeps the shell it started, and the call ends at once.** While a call runs, the product compares the
  process behind the session's pid (its executable and argument vector, read from `/proc`) with the shell's own, read
  when the shell last answered one of the product's lines. A different process ends the call within 200 ms. The
  program is ended with its tree, and the session restarts on its shell with PD-TOOLS-001's snapshot re-applied, as a
  hard-timeout reset does. A fresh shell answers one no-op line before its first command so that there is an identity
  to compare with; a shell that does not answer it within the snapshot bound (15 s), a shell still busy with a
  soft-paused command, and a host without `/proc` leave the call unwatched.
- **The handshake honours the call's cancel and a kill from the terminal window.** The no-op line is awaited before
  the call's command is written, so a run's stop or pause that lands on it ends the round trip where it stands: the
  command is never written, and the call reads as any cancelled call does: ~~(`timeout`, 124, `session_reset`, "the call
  was cancelled", the snapshot re-applied)~~ since OQ-226's ruling (2026-10-07, R-072,
  [`PD-TOOLS-013`](../../product/directives/pd-tools-013.md#pd-tools-013)) `interrupted` / `warning`, no exit code, `session_reset`, a
  detail saying the run cancelled the call before the command was written so it never ran, and the snapshot re-applied.
  *(The struck reading was a description in passing, swept into R-071's confirmation of this entry without being raised;
  it reported a cancel as REQ-TOOLS-099's hard timeout. Replaced, not repaired quietly; R-071's ruled behaviour for a
  replaced or ended shell stands.)* A kill from the terminal window that lands on it reads as a killed call
  ~~(−1, `session_reset`, "killed from the terminal window")~~ since [OQ-370](67-spikes-and-later-questions-34.md#oq-370)'s ruling (2026-10-21, R-072) with no
  exit code, `session_reset`, "killed from the terminal window", and the command is not written to the shell the kill ended.
  *(Revised 2026-10-21 under OQ-370's ruling: the struck −1 was a description in passing, swept into R-071's confirmation of
  this entry without being raised. The command never ran, as the result's own error says, and three readings give such a
  call no exit code: the call that waited behind a killed soft-paused command (since 2026-10-21), OQ-164's ruling on a line
  that never ran, and PD-TOOLS-013 on a cancel at the same point. Replaced, not repaired quietly, as OQ-226 revised the
  cancel beside it; R-071's ruled behaviour for a replaced or ended shell stands.)*
  *(Added 2026-09-30 by acceptance round 1's verifier, who found both lost in the first form of this build: the cancel
  was ignored and the command ran to its own end — 5,075 ms and `success` where origin/main answered the cancel in
  310 ms — and after a kill the command was written to the PTY the kill had just ended, so the call waited out its
  timeout. A signal already aborted before the command is written is now honoured on every call, the handshake or
  not.)*
- **The call is REQ-TOOLS-103's failure before completion.** `failure_kind` and `outcome_kind` are `execution_error`,
  severity `error`, `error_class` `ExecutionError`, no exit code (the command never returned to a line that would
  report one, so the diagnostic block drops the key and the live stream ends with none), and `kill_status`
  `session_reset` or `reset_failed`. The detail says the command replaced the session's shell, that the session was
  restarted with the shell this tool runs commands in, what was restored, and to run the program without `exec`, or
  in the background.
- **`exec` with redirections alone** (`exec 3>file`, `exec >log`) keeps the process, and is an ordinary command.
- **The POSIX description says not to replace the shell** and what a call that does meets on the host it runs on: on
  Linux that the call normally fails and the shell is restarted, elsewhere that the call reads as still running and
  every later call runs in that program. *("Normally" added 2026-09-30 by acceptance round 1's second verifier: on
  Linux too the watch is off in the cases listed under "What the build proceeds under", where the call reads as still
  running.)*

**What it does not reach.** `/proc` is Linux's, so on macOS the watch is off: such a call still soft-pauses there, and
the description's sentence, which states that consequence there, is all that applies (no macOS artifact is built,
IC-3). ~~only the description's sentence applies~~ *(corrected 2026-09-30, acceptance round 1's verifier: the sentence
first told every POSIX host that such a call fails and the shell is restarted, which only Linux does.)* An `exec` of
exactly the shell's own executable with exactly its arguments (`exec /bin/sh -i`) is indistinguishable from the shell
and still soft-pauses. An `exec` inside a command that has already soft-paused is not watched either — the watch ends
with the call at the pause — so the paused command's later polls read it as still running. The handshake's own wait
(the fresh shell's startup and one round trip) is not counted toward the call's hard timeout.

The case "REQ-TOOLS-097/098/103/104 (OQ-144, acceptance A9): …" in `terminal/terminal.test.ts` pins this reading, and
the two cases "… (OQ-144, acceptance round 1): …" beside it pin the handshake's cancel and kill.

**What a ruling decides.** Whether a command that replaces the shell is refused before it runs (an `invalid_request`
REQ-TOOLS-101 does not list), answered as built, or adopted — the session carrying on in the new program, with the
description then no longer naming the shell the next command runs in; and whether the call's code is `execution_error`
with no exit code, as built, or something REQ-TOOLS-179 names.

**The sibling case, a command that ENDS the session's shell** *(added 2026-10-01 by the repair of
[`a-command-that-exits-the-session-shell-reads-as-a-soft-pause`](../../defects/fixed/a-command-that-exits-the-session-shell-reads-as-a-soft-pause.md);
the same question by another road, raised with this reading built and not ruled)*. `exit`, `exit 3`, `logout` or a
`kill -9 $$` loses the end frame as a replacement does, because the shell that would print it is gone; the call read as a
soft pause after the whole no-output window, and the next call ran in a fresh shell with the directory and variables
gone while it reported `session_reinitialized` false. The build now proceeds under the replacement's reading, extended:
- **The running call ends when the PTY reports the shell's exit** (`ForegroundSession.shellExited`; node-pty emits it
  once the PTY's output is drained, so what the command wrote first is in the capture). It is REQ-TOOLS-103's failure
  before completion: `execution_error`, `ExecutionError`, no exit code, and a detail that says the command ended the
  session's shell. Nothing is killed, since the shell has gone. The session is respawned on its shell with PD-TOOLS-001's
  snapshot re-applied, `kill_status` `session_reset` (or `reset_failed` when no shell could be started), and the detail
  names what was restored. The next call reports `session_reinitialized` true. Measured with dash through a real PTY, three runs
  at a load average of about 3.4: `exit 3` ended the call in 16 to 37 ms and `kill -9 $$` in 12 to 18 ms. Before the
  repair both took the case's whole 3 s no-output window.
- **A soft-paused command that ends the shell** is closed with no status of its own. The poll that hands it over reports
  it the same way, as `the paused command ended the session's shell`, and respawns the shell then. A later call that met
  the ended shell first has respawned it already, and that poll reports `kill_status` null and says the session has been
  restarted since.
- **A shell that ended between calls**, with no call waiting on it (keystrokes the agent or the terminal window wrote,
  an outside signal), is respawned by the next call before its command is written, with the snapshot re-applied. That
  call reports `session_reinitialized` true, and its detail opens by saying that the shell had ended and what was restored.
- **Nothing here depends on `/proc`.** The exit is the PTY's own event, so the reading holds on every host and both
  backends. PowerShell's `exit` takes the same path, which is reasoned and not run on a Windows host.
  *(Run 2026-10-15 on Windows 11 ARM64 (build 26200.9457), pwsh 7.6.6 and Windows PowerShell 5.1, a scratch probe of the
  session's B3: `Write-Output 'bye'; exit 3` on one line, the same over two lines, and a bare `exit` over two lines each
  captured `bye` and read `execution_error`, `session_reset`, about 1.5 s, the next call `session_reinitialized: true`, on
  both shells. It takes the same path. The suite's OQ-144 cases are POSIX-only on Windows; their PowerShell branch is B6.)*
  *(B6, the same day: the two cases "a command that ends the session's shell ends at once …" and "a soft-paused command that
  ends the shell is handed over by the poll …" run on PowerShell too, three runs a shell, green; the end is reported about
  1.5 s after the command, inside PowerShell's bound of 5 s.)*
- **A background job the exiting command left behind keeps running** after the respawn (`sleep 8 & exit 2`, seen by
  the repair's verification on 2026-10-01). Nothing kills it, because the shell that owned it has gone and nothing was
  reset. The fresh shell does not know it, as PD-TOOLS-001 already says of background jobs. A ruling that the shell's end
  should end its jobs too, as a hard-timeout reset ends the tree, is part of this question.

The two cases "REQ-TOOLS-097/098/100/103 (OQ-144): a command that ends the session's shell …" and "REQ-TOOLS-098/100/103
(OQ-144): a soft-paused command that ends the shell …" in `terminal/terminal.test.ts` pin it, and both are red on the
unrepaired code (`soft_pause`). A ruling on this question rules this case too: whether ending the shell is refused,
answered as built, or left to end the session; and which code the call carries.

**OQ-145 — Whose grant does a persona's `tool_restrictions` map narrow, and what do its keys and lists mean?**
*(REQ-TOOLS-006 (4), "the per-persona `tool_restrictions` map"; REQ-CONFIG-103, "map from name to allowed-tool list …
restricts named entities; an entity absent from the map is unrestricted"; REQ-CONFIG-062, which canonicalises "every key
of a role's `tool_restrictions` mapping" as a role name; REQ-CONFIG-046; `PD-TOOLS-006` revision 3's "after
REQ-TOOLS-006's controls". Raised 2026-09-29 under [R-067](../../product/requests.md#r-067) by the repair of
[`a-personas-tool-restrictions-never-narrow-its-grant.md`](../../defects/fixed/a-personas-tool-restrictions-never-narrow-its-grant.md),
acceptance finding A4. ~~Open;~~ ruled 2026-10-06; numbered OQ-141 on its branch, renumbered OQ-145 at the merge, OQ-141
to OQ-144 having been taken on `main`.)*

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** confirmed as built: a persona's `tool_restrictions` narrows its own grant by the entry naming its persona, and the grant of each role it delegates to by the entry naming that role; a grandparent's map is not read; aliases and `delegate`'s companions travel together; and a tool-server tool the list does not name is withheld.

The map sits on a persona, and REQ-CONFIG-062 makes its keys role names. REQ-TOOLS-006 says it narrows "a persona's
declared tool set". The requirements do not say whose set an entry narrows when it names a role other than the persona
that holds the map, nor how an allowed-tool list treats an alias, `delegate`'s two companions or a tool-server tool. Three
readings were weighed:
- **The entry naming the holder only.** An entry naming another role would narrow nothing — a configured restriction
  silently ignored, which is the defect's own shape.
- **Every persona's entry for a role, everywhere.** A coordinator's restriction on a role would bind that role when a
  different persona delegates it.
- **The holder's own entry and the delegating persona's entry.** A map restricts the persona itself and the roles it
  delegates to, the way `delegates_to`, the key REQ-CONFIG-062 canonicalises beside it, names the roles it delegates to.

**What the build proceeds under:** the third. An agent's grant is narrowed by the allowed-tool list its own persona's
map gives its persona's name, and by the list the map of the persona that delegated it gives that name (the entry agent
has no parent agent; a grandparent's map is not read). A tool survives only when every binding list names it, after the
first three controls, and nothing is restored or added. A name and its alias are one tool (`haet` is `haet_edit`), and a
list naming `delegate` names `background_output` and `wait_for_tasks` with it (REQ-TOOLS-005). A tool-server tool the
list does not name is withheld, since the list is closed and a withholding rule withholds a tool outside the registry
(ADR-0016). Each removal is logged `by tool_restrictions` with the persona. `PD-TOOLS-006`'s write-scope refusal reads
the same lists, including the delegating persona's. The writers its reason names are those the caller's map lets write.

**What a ruling decides.** Which of the three readings binds, or another one. Whether a grandparent's map binds too.
Whether an allowed-tool list may name a tool-server tool or reach tool-server tools at all.

**OQ-146 — Are keystrokes left without a line end cleared before the product submits the next command line?**
*(REQ-TOOLS-096, under which keystroke input "may be a special key" or text and is written as is; REQ-TOOLS-097 and
REQ-TOOLS-098, under which a soft-paused command keeps running and the next call is typed behind it; REQ-TOOLS-127,
under which the live stream and the observation carry what the command wrote. Raised 2026-09-29 by the repair of
acceptance finding A10,
[`keystrokes-left-without-enter-leak-a-paused-commands-end-marker-into-the-next-output.md`](../../defects/fixed/keystrokes-left-without-enter-leak-a-paused-commands-end-marker-into-the-next-output.md),
under [R-067](../../product/requests.md#r-067). ~~Open;~~ ruled 2026-10-06; numbered OQ-143 on its branch, renumbered OQ-146 at the merge,
OQ-143 to OQ-145 having been taken on `main`.)*

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** confirmed as built: on the POSIX backend a partial line left without a line end is erased with `^U` before the product submits its next line, never run, and the PowerShell backend is unchanged. *(The PowerShell backend measured 2026-10-15 on Windows 11 ARM64, pwsh 7.6.6 and 5.1, three runs each: keystrokes left without a line end under a paused command, by `is_input` and by send-keys, leak nothing into the next call, whose output, live tap and status are its own, a stale `$LASTEXITCODE` of 3 included.)*

An agent's `is_input` text or a control surface's send-keys with no Enter after it waits in the shell's input as a
partial line when nothing reads it, as under a soft-paused `sleep`. A person at a terminal would see it on the next
prompt and could erase it. The agent cannot see it, and the product's next wrapped line was appended to it: the
start marker's `printf` became `xyprintf`, and the observation and the live stream lost their framing. No requirement
says what becomes of such a partial line. The product could leave it (the prefix, and the leak the note records), submit
it as a line of its own (running text the agent never ended as a command), or clear it.

**What the build proceeds under:** on the POSIX backend, when the last keystrokes the session wrote did not end with
a line end, the next line the product submits — a command, or its own snapshot or restore — is preceded by the line
discipline's kill character, `^U` (node-pty sets `VKILL` to it; an interactive shell's line editor binds it to the
same). The partial line is erased, never run. Keystrokes that end their own line clear nothing, and the PowerShell
backend is unchanged: its wrapper's first statement is the exit-status reset, so a prefix costs that statement and,
by the wrapper's construction, not the start marker — reasoned, not measured, since no Windows host ran it. The cases "REQ-TOOLS-096 (A10): …" and "REQ-TOOLS-096/097/127 (A10): …" in `terminal.test.ts` pin that reading.

**What a ruling decides.** Whether a partial line no one ended is erased, submitted, or left, and whether the
observation of the call that clears it should say so. A command still running and reading its own input line by line
receives the product's next line under every reading, which is REQ-TOOLS-187's queue and not this question. The ruling
should also cover the interactive program: when the soft-paused command is a REPL or an editor that reads its input
itself, in raw mode, the `^U` reaches it as a keystroke of its own — a readline prompt kills the line the agent was
typing, and an editor such as `vi` scrolls. Without the `^U` that program would receive the wrapper's text appended
to the agent's keystrokes instead, so neither reading hands it anything it asked for (added 2026-09-30 by A10's
verification).

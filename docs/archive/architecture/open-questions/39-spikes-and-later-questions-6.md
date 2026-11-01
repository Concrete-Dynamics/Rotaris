# Archived open questions — Spikes, and the questions raised since (6 of 35)

The ruled, closed, resolved and withdrawn entries of [part 39](../../../architecture/open-questions/39-spikes-and-later-questions-6.md) of the [open-questions record](../../../architecture/open-questions.md), each moved here whole, under its own anchor, by `pnpm archive:migrate` (`tools/archive/migrate.mjs`); the part keeps one index line for each. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="oq-167"></a>

**OQ-167 — What does REQ-WORKSPACE-093's "{reason}: {detail}" read for a code-intelligence setup in which no stage began?**
*(REQ-WORKSPACE-093, "Failure reporting SHALL be "{reason}: {detail}" with per-stage reasons …; the result is retryable";
REQ-WORKSPACE-092, whose fixed details are a stopped **step's**; REQ-WORKSPACE-094, whose non-retryable words are for an
entry that is not a local launch and nothing else; REQ-WORKSPACE-103; REQ-MCP-112, "SHALL refuse to start a second
concurrent run". Raised 2026-10-01 under [R-067](../../../product/requests.md#r-067) by the repair of
[`a-refused-setup-start-is-reported-as-not-a-local-launch.md`](../../../defects/fixed/a-refused-setup-start-is-reported-as-not-a-local-launch.md).
~~Open.~~ Ruled 2026-10-06.)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** the current wording and the immediate retryable failure are the rule: a setup that began no stage fails retryably with REQ-WORKSPACE-093's summary, under the reason "Code intelligence could not complete this project's setup", its detail the run host's own refusal or "the setup was cancelled before it started.", and a refused start, the run host's one slot taken by another setup included, fails straight away rather than waiting. [`PD-WORKSPACE-006`](../../../product/directives/pd-workspace-006.md#pd-workspace-006) narrows REQ-WORKSPACE-092 and REQ-WORKSPACE-093.

`code-intelligence-setup` can fail before any of REQ-WORKSPACE-091's three stages has begun, in two ways. The run host can
refuse the setup's start: its one setup slot is taken by a setup the MCP settings category started (`mcp.setup.running`,
REQ-MCP-112's one run at a time), the workspace is not open there (`workspace.unknown`), or its configuration could not
be loaded (`mcp.configuration`). Or the run can be cancelled while its setup waits for the setup before it to end
(`setupTurn`, ADR-0064's seventh round). REQ-WORKSPACE-093 names a reason per stage and REQ-WORKSPACE-092 a detail per
stopped step; neither names one for a setup that started no stage. Before the repair a refused start was reported in
REQ-WORKSPACE-094's words, which the requirement reserves for an entry that is not a local launch.

**What the build proceeds under** (`apps/desktop/src/main/initialization.ts`, `SETUP_REASON`): a retryable failure with
REQ-WORKSPACE-093's summary ("Code intelligence setup did not complete for this project. It runs again the next time this
workspace is opened."), so a background run reaches REQ-WORKSPACE-103's banner with it. Its reason is the build's
"Code intelligence could not complete this project's setup" — the one `resultOf` already used for a failed setup with no
failed step — and its detail is the run host's own refusal ("A code-intelligence setup is already running for this
workspace; wait for it to finish or cancel it first.", "That workspace is not open in the run host", "The configuration
could not be loaded") or, for a run cancelled before its setup started, "the setup was cancelled before it started."
(`CANCELLED_BEFORE_SETUP_ERROR`, as built under R-067 on 2026-09-30). A refused start is not waited out: the task fails
at once, as any other retryable failure does, and runs again at the next open or on Try again.
*(2026-10-01: a start the run host never answers takes the same reason, with the build's detail recorded under OQ-169.)*

**What a ruling decides.** Whether a setup that began no stage has a reason and a detail of the specification's own —
for the refusal, and for the cancellation, where REQ-WORKSPACE-092's "Setup was stopped before this step finished." is
the nearest sentence but names a step that never ran; and whether a start refused because another setup holds the run
host's one slot should instead wait for that setup to end, as the coordinator's own setups wait for one another.

<a id="oq-168"></a>

**OQ-168 — May a poll after an interrupt write a line of the product's own into the session, to find where the paused
command's line ended?** *(REQ-TOOLS-096, under which keystroke input is written "as is"; REQ-TOOLS-098, whose advice is to
poll a soft-paused command with an empty `command` or to interrupt it with `C-c` and `is_input=true`, and whose soft pause is
"while its process keeps running"; REQ-TOOLS-179, −1 for a soft pause in the foreground; OQ-147, what the paused call reports
once a poll hands it over; OQ-144, whose handshake already writes one no-op line of the product's own to a fresh shell.
Raised 2026-10-01 by the repair of
[`a-poll-after-c-c-says-the-interrupted-command-is-still-running.md`](../../../defects/fixed/a-poll-after-c-c-says-the-interrupted-command-is-still-running.md),
as OQ-167, and renumbered OQ-168 at its merge because `origin/main` had taken OQ-167 meanwhile. ~~Open.~~ Ruled 2026-10-06.)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** the Linux behaviour stays — the product's own
no-op line is written, on a poll or while the interrupted call still runs, only once `/proc` says the shell holds its
terminal again — and on Windows and macOS nothing is written: the poll stays the soft pause and says, ahead of
REQ-TOOLS-098's explanation, that the command may have ended and that the next command run in the session reports how,
until a Windows machine has measured the line. Read with it: a Linux whose `/proc` does not answer is treated as those
hosts are, and the terminal window's interrupt keeps marking the call as the agent's does. The requirements are silent on a
line of the product's own, so no directive is minted. Built the same day (`ForegroundSession.poll`, `SessionDeps.platform`,
`INTERRUPT_UNSEEN_NOTE`; three "(OQ-168, ruled)" cases in `terminal/terminal.test.ts` over the platform switch).

An interactive shell that takes an interrupt abandons the rest of the wrapper's line, so the paused call's end frame never
prints, and nothing else in the PTY's stream says the line is done. Before the repair every poll between the `C-c` and the
agent's next command read −1, `soft_pause`, "The process may still be running", over a process that had died. The only
way to learn from the stream that the shell has finished the line is to give it another line and watch it reach it. No
requirement says whether the product may write a line the agent did not send, and REQ-TOOLS-096 writes the agent's input as
is: a line written while a program other than the shell still reads the terminal becomes that program's input.

**What the build proceeds under** (`ForegroundSession.poll`, `findInterruptedEnd`, `submitCloser`, `noteInterrupt`,
`ActiveCall.onInterrupt` and `shellHoldsTerminal` in `packages/agent-tools/src/terminal/foreground.ts`):
- **An interrupt marks the paused call.** Keystrokes carrying `C-c` (the byte 0x03) written while a command is soft-paused —
  the agent's `is_input`, or the terminal window's interrupt or send-keys (REQ-SHELL-093) — mark it. No other keystroke
  does, so a paused command waiting in `read` is never handed a line by a plain poll.
- **An interrupt marks the running call too** *(added 2026-10-01 by the repair's first verification; "an interrupt marks
  the paused call" alone was read as covering the window's interrupt, and covered only the one sent after the pause)*. The
  window's interrupt or send-keys can arrive while the foreground call still runs (the agent's own calls are sequential, so
  its `is_input` cannot). The shell abandons the line just the same, and the call used to wait out the no-output window
  and soft-pause over a dead process, or wait out its hard cap and reset the session. The running call now looks every
  100 ms (`INTERRUPT_WATCH_MS`) for its shell holding the terminal again, on Linux, and at that moment submits the same
  no-op line. Its printed start marker ends the call with −1, `execution_error`, "the command ended without an exit status
  of its own", with no reset and the shell's state kept. A call that soft-pauses first carries the mark, and any line
  already submitted, into the paused call.
- **A poll waits briefly for the shell.** A poll made at once after the `C-c` could meet a shell still waiting on the dying
  program; it waits up to 500 ms (`INTERRUPT_SETTLE_MS`) for the shell to take its terminal back before it decides.
- **A poll of a marked call submits one no-op line, once the shell holds its terminal again.** On Linux the poll reads
  `/proc/<pid>/stat`: when the terminal's foreground process group is the shell's own, the interrupted program has gone,
  and the poll submits `:` wrapped in fresh markers, as OQ-144's handshake does, and waits for it at most 2 s
  (`INTERRUPTED_END_WAIT_MS`). The shell reaches that line only once the paused line is done, so its printed start marker
  closes the paused call (`closer`), and the poll hands it over with OQ-147's reading: −1, `execution_error`, "the paused
  command ended without an exit status of its own". A program that survived the interrupt and holds the terminal — a REPL
  that caught it, a child that ignores SIGINT — is written nothing, and the poll answers "still running"; a later poll
  looks again. The line is submitted once per paused call.
- **What the line writes is the product's, and nobody reads it.** Its echo and its two frames are cut from the paused
  call's capture (`until`, `withoutEchoedWrappers`) and withheld from the live stream (`CommandRegion.withholdRowsWith`,
  live-run L9). A paused line still running when the line arrives — the shell between two of its commands — closes on its
  own frame with its own status, and the no-op runs after it. That is harmless unless what the line runs next reads the
  terminal (`a; cat`, or an INT trap in the session's shell that goes on to `read`), which takes the no-op as its input: a
  narrow window this reading leaves open. A call issued after the line closes the paused call at the line's marker, which
  the shell prints first.

**What it does not reach.** `/proc` is Linux's: on Windows (ConPTY, PowerShell, where the no-op is `$null`) and macOS
nothing says who holds the terminal, so a poll of a marked call submits the line whatever holds it, and a program that
survived the interrupt and reads its input receives it; a REPL's partial-line prompts after it would also be withheld from
the live stream, since they share a row with the line's echo. A RUNNING call there writes nothing: the window's interrupt
is only carried into the soft pause, and a call given a `timeout` still runs out its hard cap and is reset. Neither host
has run it (no Windows host here; no macOS artifact is built, IC-3), and whether PowerShell abandons the rest of its line
on `C-c` as `sh` does is reasoned, not measured. Windows is the one release target IC-3 leaves, so this is where the
reading's risk lies.

*(Measured 2026-10-15 on Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, dev tree, pwsh 7.6.6 and Windows PowerShell
5.1, three runs a shell, under the ruling below as built — the paragraph above describes the reading the ruling replaced: a
poll after the agent's C-c on a soft-paused `Start-Sleep` writes nothing into the session (every write recorded) and reads
the soft pause led by the ruling's sentence; PowerShell does abandon the rest of its line on `C-c`, so what followed the
sleep never ran and the next command reports the paused one ended with no status of its own. A node program that ignores the
interrupt and reads its input is written nothing after the C-c, takes the next typed line (`got:hello`), and — the wrapper's
line abandoned — no end frame follows its own exit, so the poll stays the ruling's soft pause. The window's interrupt ends a
running `ping -t` or node process within a second, and the call given a `timeout` still runs out its cap and is reset, its
state restored. Pinned by "OQ-168 / OQ-147 / OQ-10 on PowerShell and ConPTY" in `terminal.test.ts`. The three "(OQ-168,
ruled)" cases that act Windows out through a POSIX shell stay skipped on a Windows host. Recorded beside it: the live run's
interrupt check reads this ruled soft pause as "still running"
([`the-live-runs-interrupt-check-reads-oq-168s-windows-soft-pause-as-still-running.md`](../../../defects/the-live-runs-interrupt-check-reads-oq-168s-windows-soft-pause-as-still-running.md)).)*

The cases "REQ-TOOLS-098/179 (OQ-147): a poll after C-c reports …", "REQ-TOOLS-096/098 (OQ-147): a poll after C-c writes
nothing into a program that survived …", "REQ-TOOLS-127 (OQ-147): the no-op line a poll after an interrupt submits …",
"REQ-SHELL-093/REQ-TOOLS-098/179 (OQ-147): the terminal window's interrupt while the call still runs …",
"REQ-SHELL-093/REQ-TOOLS-098 (OQ-147): an interrupt that reached the call before its soft pause is carried …" and
"REQ-TOOLS-098/179 (OQ-147): a poll made at once after C-c …" in `terminal/terminal.test.ts` pin this reading.

**What a ruling decides.** Whether the product may write a line of its own after an interrupt (as built), only on a poll or
also while the interrupted call still runs (as built, on Linux), and on which hosts. Where nothing says who holds the
terminal, the choices are: write it anyway (as built for a poll); write it only while the shell process has no live
child process; or write nothing off Linux until a host has measured it. Or whether a poll that cannot see the line's end
must say only that the command may have ended, the advice then naming a next command as the way to learn it. And whether
the terminal window's interrupt marks the call as the agent's does.

<a id="oq-169"></a>

**OQ-169 — How does a code-intelligence setup end when its finished status never arrives — the run host lost, or a
status push lost?** *(REQ-WORKSPACE-109, "A run SHALL end in exactly one of three ways"; REQ-WORKSPACE-084, "A task that
ends without reporting any of those three outcomes SHALL be treated as a failure and SHALL be reported with an error
message describing what went wrong"; REQ-WORKSPACE-091's three stage budgets, 300 / 1800 / 120 s; REQ-WORKSPACE-092's
5 s; REQ-WORKSPACE-093. Raised 2026-10-01 under [R-067](../../../product/requests.md#r-067) by the repair of
[`nothing-bounds-the-wait-of-a-setup-queued-behind-one-that-never-finishes.md`](../../../defects/fixed/nothing-bounds-the-wait-of-a-setup-queued-behind-one-that-never-finishes.md),
as OQ-168, and renumbered OQ-169 at its merge because `origin/main` had taken OQ-168 meanwhile. ~~Open.~~ Ruled 2026-10-06.)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** the current behaviour is the ruling, its wording and its fallback limit included: a setup whose finished status never arrives ends as a retryable failure with REQ-WORKSPACE-093's summary, the running stage's reason (OQ-167's where none ran) and the detail "the run host exited before the setup finished.", or, once 2235 s (about 37 minutes) have passed since the follow began, "no outcome arrived within the setup's time budgets."; a start the run host never answers reads "the run host did not answer the setup's start" with the request's own error. No cancellation follows either, the coordinator does not ask the run host for the setup's status when the bound passes, and nothing in main ends a lost run host's step processes. [`PD-WORKSPACE-006`](../../../product/directives/pd-workspace-006.md#pd-workspace-006) carries the words.

The initialization coordinator follows a setup through the run host's pushed `mcp.setupStatus` and ends the task on the
status whose state is `finished`; its setups run one at a time, so every later workspace's setup waits for that end. The
run host can be lost mid-setup — main never forks another — and a push can be lost; the specification bounds every stage
but says nothing of a setup whose outcome never reaches the task, nor of what its failure reads.

**What the build proceeds under** (`apps/desktop/src/main/initialization.ts`): the follow ends as a retryable failure
with REQ-WORKSPACE-093's summary ("Code intelligence setup did not complete for this project. It runs again the next time
this workspace is opened."), its reason the running stage's ("Code intelligence could not index this project's symbols",
…) or, with no stage running, the build's "Code intelligence could not complete this project's setup" (OQ-167), and its
detail the build's own: "the run host exited before the setup finished." when main sees the run host exit, and "no
outcome arrived within the setup's time budgets." when no finished status has come 2235 s after the follow began — every
stage's budget plus REQ-WORKSPACE-092's 5 s for each (`SETUP_FOLLOW_BOUND_MS`). The steps that finished are reported; the
one that was running is not, since it never finished (REQ-WORKSPACE-109). Nothing is recorded, so the task stays pending.
On the bound, no cancellation is sent: the run host's one setup may by then be another's (the MCP category's), and its
own budgets already end every stage. Nothing in main ends a step's processes when the run host that launched them is
killed by signal; whether they outlive it was not measured, and `workspace-proof`'s scenario 8d ends its stand-in itself.

*Extended 2026-10-01 by the repair of
[`a-setup-start-the-run-host-never-answers-is-reported-as-a-task-with-no-outcome.md`](../../../defects/fixed/a-setup-start-the-run-host-never-answers-is-reported-as-a-task-with-no-outcome.md):*
a setup whose **start** the run host never answers — main's `mcp.setup` request rejecting on its 15 s bound, as for a
run queued behind a setup whose run host was lost (scenario 8d) — ends the same way, before any stage: a retryable failure
with REQ-WORKSPACE-093's summary, under OQ-167's reason, its detail the build's "the run host did not answer the setup's
start" with the request's own error in parentheses (`SETUP_START_UNANSWERED_DETAIL`), said in the log at `warn`. Before,
it escaped the task and REQ-WORKSPACE-084's generic report named it a task that ended without an outcome. No
cancellation follows it: a run host that did take the start late holds a setup the coordinator no longer follows, and the
MCP category's Cancel or the stage budgets end it. The task's **status read** for applicability is not part of this
reading: a read that rejects makes the predicate raise, which REQ-WORKSPACE-080 itself says is logged and counted not
applicable, and the build does that. A ruling on this question also decides whether an unanswered start has words of the
specification's own, and whether it should be followed by a cancellation.

*Extended 2026-10-02 by the repair of
[`a-setup-that-finishes-before-its-start-is-answered-is-never-seen-to-finish.md`](../../../defects/fixed/a-setup-that-finishes-before-its-start-is-answered-is-never-seen-to-finish.md):*
one case that reached the bound was not a lost status but one main dropped. The run host pushed every step and the
`finished` status before the start was answered, and the coordinator had no sink yet. The build now keeps a status
pushed while its own start is in flight, and asks the run host's status once where the answer has every step ended
and still reads `running`. That one read is not this question's "ask the run host for the setup's status when the
bound passes": the bound, and what a follow ends as when it passes, are unchanged.

**What a ruling decides.** Whether these two cases have words of the specification's own; whether the bound is the right
one (it adds nothing for the run host's own work around the stages, which the budgets do not cover); whether the
coordinator should instead ask the run host for the setup's status when the bound passes; and whether REQ-WORKSPACE-092's
"nothing the step launched SHALL still be running 5 s later" binds a step whose run host was lost.

<a id="oq-170"></a>

**OQ-170 — What becomes of a parked run's tool ports, and of the `tool_calls` ring row of a call that outlives its run's
park?** *(REQ-MONITOR-105, "a running tool renders as a pulsing in-progress row"; REQ-MONITOR-228, "After a run has ended,
no row may still render as in progress"; REQ-SESSION-129, a call that was under way and produced no result is a failure;
REQ-ORCH-153 and REQ-ORCH-087, the plan gate and the message-limit pause, neither a termination; ADR-0024, the ring.
Raised 2026-10-01 under [R-067](../../../product/requests.md#r-067) by the repair of residual 2 of
[`a-parked-runs-call-that-never-returns-keeps-its-ring-row-running.md`](../../../defects/fixed/a-parked-runs-call-that-never-returns-keeps-its-ring-row-running.md).
Open until 2026-10-06; ruled that day by the owner, and built.)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** when a run parks at the plan gate or the
message-limit pause, every tool call still open is marked failed — the run's tool ports are closed at the park, the same
cleanup the app already runs when a run ends (`Run.closePorts` through the gate sink's `close`), so a call that returns
later writes nothing. Read, where the ruling leaves it open, as: the park closes the ports before anything of the park is
written; a parked run then holds no skip of the crash record's ring settle, so a ring row no live call of this process
holds is settled at the next continue as a crash's; and ring rows gain no process identity. REQ-MONITOR-228 reads so; no
requirement's text is departed from, so the ruling alone settles it. Built the same day (`Run.pauseAtLimit` and the plan
gate's park, `packages/engine/src/run/run.ts`; plan fin21), and the note above is closed. The reading below is kept as the
build proceeded under it until then.

A run that parks — at the plan gate or at the message-limit pause — does not tear down, so it never closes the tool ports
it built (`Run.closePorts` runs only at the teardown), and the run host's gate sink never settles the ring rows its calls
left open (`writerSink`'s `close`, `apps/desktop/src/run-host/tools.ts`). A call of that run that ignored its abort may
still be under way, so the crash record a continue makes skips the ring settle while such a run of this process exists
(`ownCallsMayRun`, `run/crash.ts`). No requirement names a parked run's ports, or the ring row of a call that outlives
its run's park, and two cases follow that the specification does not settle:

- **A call that never returns.** Nothing closes the parked run's ports, the continue leaves the row to the call, and the
  call never settles it: the row reads `running` for good, a call still under way by REQ-MONITOR-105, long after its run
  moved on (the driven `stray` rows of `packages/engine/src/run/crash.test.ts` read so).
- **Two processes over one workspace.** Process A parks a run; process B continues the session and crashes; A continues
  again and, holding its parked run, skips the settle, leaving B's dead ring rows `running`. A ring row carries no process
  identity, so a crash record cannot tell a dead process's row from a live one's (a question that touches ESC-10's ground).

**What the build proceeds under.** A parked run keeps its ports open; a continue closes none of them; the crash record a
continue makes settles no ring row while any run of this process on the session parked with its ports open
(`Live.portsOpen` in `packages/engine/src/sessions.ts`, every such run and not only the last — the part of the note
repaired with this question); a ring row carries no process identity. Both cases above stand. A parked run never reaches
its teardown, so it never leaves `Live.portsOpen`: once any run of a session parks, this process skips the ring settle for
that session for as long as the session stays live in it. That widens the second case: before the repair a later run's
teardown re-armed the settle, so another process's dead rows were settled at the next continue after it; under this
reading they are not settled by this process at all after a park, and stay `running` until a repair or another process's
continue records the crash.

**What a ruling decides.** Whether a park closes its run's ports, settling their open calls through the gate sink's
`close` as an orderly end does (so the call that later returns writes nothing); whether a continue abandons the ports of
the parked run it replaces, settling their rows as cut off; or whether the ring rows are stamped with the process that
opened them, through an appended store migration, so a crash record settles exactly the rows of a dead process.

<a id="oq-171"></a>

**OQ-171 — With two main windows open, which window shows a workspace's initialization banners?** *(REQ-WORKSPACE-103,
"A failed background run SHALL reach an error banner \"Project setup did not finish\""; REQ-WORKSPACE-102's "Project setup
could not be checked" error surface; REQ-WORKSPACE-013, "The replacement window SHALL resolve initialization for its own
workspace independently"; PD-SHELL-001's two main windows, one per project. Raised 2026-10-01 by the repair of
[`initialization-answers-for-the-last-opened-workspace-not-the-asking-window.md`](../../../defects/fixed/initialization-answers-for-the-last-opened-workspace-not-the-asking-window.md);
raised as OQ-170 on its branch and renumbered at the merge, OQ-170 having been taken on `main` meanwhile. ~~Open.~~ Ruled 2026-10-06.)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** the banners stay the application's, shown in
every window, and name the project they concern — by [`PD-WORKSPACE-005`](../../../product/directives/pd-workspace-005.md#pd-workspace-005), which
narrows REQ-WORKSPACE-102 and REQ-WORKSPACE-103. Both banners are named, the failed resolution's as well as the failed
background run's, since both reach every window: the title reads `{headline}: {the folder's name}`, the message stays the
requirement's sentence, and the detail area opens on the project's full folder path, which tells two projects of one name
apart. Built the same day (`namedBanner` in `apps/desktop/src/main/initialization.ts`; `initialization.test.ts`;
`init-proof` scenario 4).

Initialization now answers, records and publishes for each window's own workspace: channel 12 reaches only the windows
holding the workspace the state is about. Its two banners do not travel on channel 12. They are notices, and the
application has one notice store (ADR-0049): the current notice goes to every live window. With two main windows open, a
failed background run of the first window's project raises "Project setup did not finish" in the second window too,
carrying the task's summary ("Code intelligence setup did not complete for this project. …") but no project name. The
specification states both surfaces for a workspace with one window in mind and says nothing of a second.

**What the build proceeds under** (`apps/desktop/src/main/initialization.ts`, `deps.banner`; `apps/desktop/src/main/index.ts`,
`raiseNotice`): each banner is an ordinary application notice, shown in every window as every other notice is. A banner
for a workspace no window holds any more is not raised (OQ-141's reading).

**What a ruling decides.** Whether these banners are the window's (shown only in the windows holding the workspace) or
the application's; and, if the application's, whether they name the project they concern.

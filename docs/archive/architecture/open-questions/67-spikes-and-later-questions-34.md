# Archived open questions — Spikes, and the questions raised since (34 of 35)

The ruled, closed, resolved and withdrawn entries of [part 67](../../../architecture/open-questions/67-spikes-and-later-questions-34.md) of the [open-questions record](../../../architecture/open-questions.md), each moved here whole, under its own anchor, by `pnpm archive:migrate` (`tools/archive/migrate.mjs`); the part keeps one index line for each. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="oq-386"></a>

**OQ-386 — What does a workspace open owe when the run host does not acknowledge it within its bound?** *(W-18, main hands
the run host the resolved store path; ADR-0002 consequence 11, every request bounded and expiry refusing rather than
proceeding; REQ-WORKSPACE-141, initialization resolution in the open's slot, with REQ-TRACE-476/482's queue, REQ-NOTIFY-224's
hook review and OQ-279's configuration load beside it; REQ-WORKSPACE-058, discovery on open; REQ-SESSION-089 and
REQ-EVENTS-084, a store that cannot be opened refuses the run. Raised 2026-10-20 by the host-independent finish (local session),
bundle `loc1-main-rejection`, from
[`a-workspace-opened-timeout-is-an-unhandled-main-rejection.md`](../../../defects/fixed/a-workspace-opened-timeout-is-an-unhandled-main-rejection.md);
the bundle's range OQ-386 to OQ-387, its first number. Renumbered at landing if `main` holds it. **Ruled 2026-10-21.**)*

**What is open.** A workspace open has two hops. The workspace service opens the store and answers `workspace.opened`. Main
then hands the store to the run host in its own `workspace.opened` request, bounded at 5,000 ms. When that reply misses the
bound, main cannot tell what happened. The run host may have opened the store and answered late (the likely case:
[the run host's skill discovery runs before its reply](../../../defects/fixed/the-run-hosts-skill-discovery-at-a-workspace-open-runs-before-its-workspace-opened-reply.md)).
It may have refused, or it may never answer. A late reply finds no pending request and is dropped. The specification states
what a store that cannot be opened owes (the run refused, the reason reported). It says nothing about a hand-off between
two processes of one application whose outcome is unknown. Until 2026-10-20 the timeout was a rejection out of the launch,
which ended main's start-up.

**What the build proceeds under.** The reading of a reply that is not `workspace.ack`, which the code already had for
`refused`. The missed reply is one warning line in the application log. The window keeps the workspace the service opened.
The open's slot is not scheduled (initialization resolution, the board's queue, the hook review or no-provider notice, the
configuration's load). Nothing is shown to the person. A run then started in that window meets whatever the run host holds.
That is its store if the reply was only late, or `workspace.unknown` ("That workspace is not open in the run host") if not. A rejection of the launch's
whole open (a `workspace.open` request to the service that gets no reply) leaves the window standing with no workspace
open, as a refused open does.

**What a ruling decides.** One of these, or another:
- **(a) As built.** Log it, keep the workspace, skip the slot. **Costs:** after a slow hand-off, initialization, the queue and
  the hook review do not run until the workspace is opened again, and nothing tells the person.
- **(b) Wait for the late reply.** Main keeps listening past the bound for the late reply and schedules the slot when it comes.
  The window is not held, and the request is still bounded, but its slot is not. **Costs:** a second state for a request (expired,
  yet still answerable), which `ProcessLink` does not have. And it works against consequence 11's "expiry refuses rather than
  proceeds".
- **(c) Refuse the open.** The window stands with no workspace open, as a refused store leaves it, with a notice naming the
  condition. **Costs:** a run host that only answered late holds a store no window addresses. A slow disk under load costs the
  person their project until they open it again.
- **(d) Hand off once more.** Main sends `workspace.opened` again, bounded, before deciding (a) or (c). The run host's case
  sets its entry for the id again, but opens a second connection to the store without closing the first, so the case must change
  too. **Costs:** a second bound's wait, up to 10 s, before the open settles.

**Ruled 2026-10-21 under the owner's delegation ([R-072](../../../product/requests.md#r-072)).** Kind change-behaviour, classified **covered**, no directive. A workspace open owes its slot whenever the run host takes the workspace within a bound, however late inside that bound. When the run host does not take it, the open owes the person a notice. The window keeps its workspace throughout, as built. The ruling is (d), refined in five points.

1. **The run host answers before it warms the skill catalogue, and the warm-up never holds its event loop.** The `workspace.opened` case starts the warm-up from a zero-delay timer on its clock port. That timer runs after `run-host/index.ts` has posted the reply. Until now, `queueMicrotask` ran the synchronous walk before the reply's `.then` reaction, so the comment "Warmed off the reply so it cannot delay the open" was false. That comment is kept beside its replacement. The warm-up now:
   - reads the tree asynchronously, with the same result as `discoverSkills`;
   - keeps only a few reads in flight at once;
   - stores its catalogue only if no rescan or session creation has cleared that root since it began.

   `skills.read`, `skills.forceLoad`, `skills.loadFile` and `skills.list` wait for a warm-up in flight instead of walking the tree a second time.

   Moving the warm-up past the reply would not have been enough. The walk (`readdirSync`, `statSync`, `readFileSync`) holds every request queued behind it. That includes the window's start-time reads and the slot's own `hooks.summary`. `hooks.summary` is sent 800 ms after the acknowledgement under a 10,000 ms bound, and when it misses, neither the hook review nor the no-provider notice is raised. A hold of more than 3,000 ms also trips ADR-0019's presenter lapse, which cancels every waiting approval (`run-host/host.ts`). The launch of 2026-10-16 logged that lapse beside its 8,201.5 ms discovery. REQ-WORKSPACE-058 asks that discovery run on open with no user action. It does not ask anything to wait on it. The repair takes the shape fin38 gave the cross-file edit's tree walk ([`a-cross-file-edit-calls-tree-walk-blocks-the-run-hosts-event-loop.md`](../../../defects/fixed/a-cross-file-edit-calls-tree-walk-blocks-the-run-hosts-event-loop.md)).

2. **The case is idempotent.** The lease refusal stays first. After it:
   - A `workspace.opened` for an identifier the run host already holds under the same store file, with its connection open, is acknowledged without a second connection.
   - If a restore closed that connection and never released it (the lease expired), the request reopens it, as `workspace.release` does.
   - If the request names another file, the earlier connection is closed first. While a run of that workspace is active, such a request is refused.

   This is owed as built, not only for point 3. Main never sends `workspace.closing`. So a project opened again in one instance (for example, a window switched to another project and back) is handed the same identifier and file. Today the case then opens a second connection and drops the first (`dispatch.ts`), and no `workspace.closeStore` ever closes the dropped one.

3. **A missed reply is asked once more, outside the open's path.** When the first reply misses its 5,000 ms bound, main writes its warning line. It then sends `workspace.opened` once more, with the same identifier, file and root, bounded at 25,000 ms. The outcome is therefore known within 30 s of the first send, which is the bound `awaitWorkspace` already gives a read waiting on an open. The open settles at the first outcome, as now, so the window gets none of the extra 10 s the entry counted as (d)'s cost.

   The run host takes its port's messages in order, and this case has no await. A run host that was only late therefore answers the second request right after the first. A run start sent meanwhile is served after the store is opened.

   On that acknowledgement, main schedules the open's slot. It is the same slot, one function for both paths. Main schedules it only if a main window still holds that workspace and no later open of its root has begun; otherwise it schedules nothing. Every request stays bounded, and nothing proceeds on an expiry. ADR-0002 consequence 11 (b) is stated for the restore's exchange and kept by `ProcessLink` for every request. It is not narrowed here, and `ProcessLink` gains no state for a request that has expired yet can still be answered.

4. **A hand-off that never comes is reported to the person.** The final outcome may be something other than `workspace.ack`: the second reply missed, the link closed, or a refusal (a refusal is not asked again). In each case main raises one persistent `warning` notice titled `The project did not finish opening: <project name>`, built on [OQ-293](59-spikes-and-later-questions-26.md#oq-293)'s pattern. The notice:
   - says that Rotaris could not confirm the project is ready to run sessions;
   - says that the project-setup check, the board's queue and the hook review did not run, and that a run started in the project may be refused;
   - names the step "Quit Rotaris and open the project again.";
   - carries the project's folder and the cause in its detail.

   It carries no action, for two reasons. REQ-NOTIFY-044's closed vocabulary has no member that hands a workspace off again. And choosing the folder the window already holds offers a new session rather than reopening it ([PD-WORKSPACE-001](../../../product/directives/pd-workspace-001.md#pd-workspace-001)). Quitting is the one step that works both when the run host was late past the bound and when it never answers.

   The notice is keyed per project and is not raised while the application quits. It is withdrawn compare-and-clear (REQ-NOTIFY-026) when a later hand-off of that project is acknowledged, or when no main window holds the project any more. Opening a workspace is a workflow a user starts (REQ-CONFIG-478, read so by [OQ-279](58-spikes-and-later-questions-25.md#oq-279)), so REQ-NOTIFY-001's "failed with one concrete next step named" is owed. The window keeps its workspace, as OQ-279 keeps a window whose configuration did not load.

5. **The log levels.** `MainWindows.launch`'s line for an open that rejected is now written at `warn`, beside the hand-off's own warning. It was written at `info`, through a `log` port that carries no level. The chooser's two paths (`#addWindow`, `#replace`) already report the failure on screen. They now also write its cause at `warn`; until now they wrote nothing about it ([PD-MONITOR-002](../../../product/directives/pd-monitor-002.md#pd-monitor-002): the level is a field).

**Classification.** Covered by REQ-WORKSPACE-141, REQ-TRACE-476, REQ-TRACE-482, REQ-NOTIFY-224, REQ-NOTIFY-001 with REQ-CONFIG-478, REQ-WORKSPACE-058 and REQ-NOTIFY-026. No requirement text is departed from. REQ-SESSION-089 and REQ-EVENTS-084 are untouched.

**The options not taken.**
- (a) is rejected: it loses four obligations without a word, and draws a partly failed open as a successful one.
- (c) is rejected: a run host that was only late would hold a store no window addresses, and a slow disk would cost the person their project.
- (b)'s mechanism is not built, because a second ordinary request gives the same late acknowledgement.

**Corrected in the entry.** A run started where the run host holds no store is refused with `workspace.not-open`, "No store is open for this workspace" (`session.start`). It is not refused with `workspace.unknown`; that code is the hooks, MCP and circuit-breaker refusal.

**Recorded beside it, not decided here:**
- The synchronous re-discovery after a session creation or a rescan, which still holds the run host's loop.
- ADR-0019's lapse is judged from the last reply, so a run host that held its own loop judges main absent.
- `forgetSpelling` is handed the store file where it takes the directory.
- A launch's `workspace.open` that gets no reply in its 10,000 ms bound leaves the window with no workspace and no word, as [`a-workspace-whose-store-cannot-be-opened-at-launch-is-left-unopened-without-a-word.md`](../../../defects/a-workspace-whose-store-cannot-be-opened-at-launch-is-left-unopened-without-a-word.md) records for a refused open.

The two recommendations weighed, and the ruling followed **both**:
- **Advocate A (the user's lens)** recommended (b), refined:
  - the acknowledgement posted before the warm-up, and the warm-up made asynchronous;
  - a late `workspace.ack` listened for within a bounded window (60 s suggested), with the slot scheduled on it while a window holds the workspace and no newer open has begun;
  - a persistent warning notice when none comes;
  - the launch's failed-open line at `warn`.

  The ruling took the repair of the cause whole (with its generation guard), the late slot and its guard, the notice, and the log levels. It declined the late window inside `ProcessLink`, and a notice action that opens the project again, which no member of REQ-NOTIFY-044 performs.
- **Advocate B (the system's lens)** recommended (d), refined:
  - the acknowledgement before the warm-up;
  - the run host's case made idempotent;
  - one more hand-off, bounded at 5,000 ms;
  - a persistent warning notice on a second miss, cleared compare-and-clear;
  - `warn` on the launch's line;
  - the event-loop hold recorded as its own defect;
  - the classification covered, with no directive.

  The ruling took the mechanism (a second ordinary bounded request), the idempotent case (owed as built, because of the reopen), the classification and the separate notes. It moved the second request off the open's path and bounded it at 25,000 ms, so the window waits no longer and a run host late by up to 30 s needs nothing from the person. It also repaired the open's own warm-up here rather than in a later note. A warm-up that still holds the loop after the acknowledgement would only move the lost slot from the hand-off to the slot's `hooks.summary`.

**Built 2026-10-31 — point 1 alone** (`fix/workspace-open-warmup-off-the-loop`). The `workspace.opened` case starts the warm-up
from `clocks.timers.after(millis(0), …)`, and the falsified comment stands beside its replacement. `SkillHost.warm` reads the
tree through `discoverSkillsAsync`, which shares every rule after the reads with `discoverSkills`, at most four reads in flight.
A per-root generation, advanced by a rescan and by a session creation, decides whether it stores its catalogue. The four reads
wait on `SkillHost.settled`, bounded on the timer port (`WARM_UP_WAIT_BOUND`) and only after OQ-279's refusal, and a walk a
clear overtakes stops at its next read (reworked after review, the same day). A wait that reaches the bound is refused
(`skills.discovering`) and the walk goes on: the first rework fell through to `discoverSkills` on the loop there, which this
entry's "never holds its event loop" and "instead of walking the tree a second time" exclude, and point 3's "nothing proceeds
on an expiry" states the refusal. The first execution held in the unit cases, and the proofs ran on the built app on 2026-11-01, where the launch's walk read 9.0 ms over a one-skill tree, which is no like-for-like reading of the 8,201.5 ms
([first-executions](../../../architecture/first-executions/34-the-register-33.md);
[the note](../../../defects/fixed/the-run-hosts-skill-discovery-at-a-workspace-open-runs-before-its-workspace-opened-reply.md)).
**Repaired after a third review, 2026-11-01.** ~~One `WARM_UP_WAIT_BOUND` of 9 s for all four requests~~: it refused a read main allows 15 s and left a gesture about 1 s, so each wait is now main's bound less 3 s (`warmUpWaitBound`). A read that never returns keeps its walk in flight, and "try again in a moment" was false of it: past `WARM_UP_STALL_BOUND` (60 s) the refusal says so (`skills.discovery-stalled`) and a gesture meets it at once. Main answers a `skills.read` its bound expired on as `skills.no-reply`, which the built app showed is needed. The renderer no longer reads any of these as an empty catalogue: it asks again until the walk ends (`askUntilDiscovered`), REQ-CHAT-034's commands register then with nothing done by the person, and Settings says "discovering" rather than "none". No ruling was needed: the entry's "nothing proceeds on an expiry" holds, and the 60 s is an implementation figure no requirement states. A walk that never ends stays parked until a rescan or a session creation, and those then walk synchronously, the loop-holding path recorded below, which on a dead mount holds the loop for as long as the read blocks.
Points 2 to 5 are not built. The first item recorded beside the ruling stands as recorded. One more path holds the loop at
launch, which the ruling's four waiters do not name and this entry did not record: a run started in an existing session during
the warm-up builds its context units (`contextUnits`, `resolved`, `catalog`), a synchronous walk beside the warm-up in flight,
whose own result is then dropped because a catalogue is held. It is not repaired here.

<a id="oq-370"></a>

**OQ-370 — When the terminal window kills a soft-paused command, when does its live stream end?** *(REQ-SHELL-092, "confirming
terminates it" and "The agent reads the killed command's output as its result"; REQ-TOOLS-127, the stream closes with a screen
frame carrying the observation's final plain text; REQ-TOOLS-128, the stream info record's running flag and exit code;
REQ-TOOLS-098, a soft-paused call has returned while its process keeps running; OQ-164, ruled 2026-10-06, a paused
command's end is reported by the next observation. Raised 2026-10-20 by plan loc1 (bundle `loc1-terminal-kill`) from the repair
of [`the-terminal-windows-kill-of-a-soft-paused-command-does-nothing-and-reports-success.md`](../../../defects/fixed/the-terminal-windows-kill-of-a-soft-paused-command-does-nothing-and-reports-success.md);
the bundle's range OQ-370 and OQ-371, its first number. **Ruled 2026-10-21.**)*

**What is open.** The window's kill of a RUNNING command returns that command's call at once, and the call's final result
ends the agent's stream (`TerminalManager.endForeground`): exit −1 and the observation's text in the closing frame. Since
2026-10-20 the kill also terminates a SOFT-PAUSED command (`ForegroundSession.killActive`), and no call is waiting on that
one: the agent learns of the kill at its next poll or call, ~~and only that observation ends the stream~~ *Corrected
2026-10-21 (OQ-370's ruling): false of the call path. A call issued after the kill re-opened the stream for its own command,
and nothing closed it for the command killed.* Between the kill and
that observation the stream's record reads `running` with no exit code, so the window's header and preview still show the
command running and still offer Kill; a second Kill answers `ended` (nothing is left to terminate). A soft-paused command that
ends on its own has the same gap, before and after the repair: its stream ends at the poll or call that hands it over. ~~No
requirement says when a stream ends for a command whose end no call is waiting on.~~ *Corrected 2026-10-21 (OQ-370's
ruling): REQ-SHELL-091 binds the window "once the process exits", and the window learns of the exit only from the stream's
meta; REQ-SHELL-087 and REQ-TOOLS-128 tie the window and the record to the process's exit.*

**What the build proceeds under.** The stream ends at the agent's next observation, as for a paused command that ends on its
own; the window's kill answers ok at once.

**What a ruling decides.** Which of these, or none:

- **(a) As built.** Cost: for as long as the agent takes to observe ~~(a model turn, or longer if it is waiting on something
  else)~~ *Corrected 2026-10-21 (OQ-370's ruling): the wait has no bound. The stream stayed open until the agent's next poll or
  call; where none came, until another session's stream cleared it (REQ-SHELL-111) or the run host exited.*, the window shows a
  killed command as running.
- **(b) End the stream at the kill.** The kill closes the stream with ~~exit −1~~ *Corrected 2026-10-21 (OQ-370's ruling):
  exit −1 for a command the window killed, and none for a queued command that never ran.* and a closing frame carrying the
  paused command's screen so far, ~~the text the next poll hands over~~ *Corrected 2026-10-21 (OQ-370's ruling): the two
  differ, and the ruling takes the paused command's screen so far.*; that observation then ends nothing. Cost: REQ-TOOLS-127's
  closing frame would carry a text the observation has not yet given, ~~and a later poll's text could differ from it by what
  arrived between.~~ *Corrected 2026-10-21 (OQ-370's ruling): false. `resetNow` closes every open paused call and clears the
  tap's region, and `onData` feeds only open calls. A killed command's text is fixed at the kill, and a command closed by its
  own frame is fixed at that frame.*
- **(c) As (b), and the same for a paused command that ends on its own**, the stream ended when the session sees its end
  frame. Cost: as (b), on every soft-paused command that ends unobserved.

**Ruled 2026-10-21 under the owner's delegation ([R-072](../../../product/requests.md#r-072)).** Option (c), refined, with no directive.

A soft-paused command's live stream ends when the session itself closes that command while no later call holds the stream. It does not wait for the agent's next observation. The session closes the command at four moments:
- the terminal window's kill (`killActive`'s paused branch), at once, before PD-TOOLS-001's restore has answered;
- the command's own end frame;
- the end of the session's shell (OQ-144's shell-exit case);
- the agent's `reset`, which ends it. The entry does not name this case; the ruling found it in the tree (below).

Three conditions bound each close:
- it is made only for the command the stream shows, the session's latest soft-paused call;
- it is made only while no foreground call waits behind that command;
- it is never made once a later call has re-opened the stream. That call's own result ends the stream, as built.

Some ends the session does not know of. After an interrupt, the end stays unknown until a poll finds where the line ended (Linux) or the next command does (Windows and macOS; OQ-147, OQ-168). A command may also have taken a queued line as its input. In these cases the stream stays open, as built, until that observation or command.

The closing frame carries the paused command's screen so far:
- all of its output the session retains, as plain text;
- capped at REQ-TOOLS-097's 100,000 characters and truncated from the oldest end;
- empty for a queued command that never ran.

That is the text its observations hand over end to end: the soft pause's, then each poll's or the later call's report. When a command's observation comes in parts, the frame equals what those parts report together. The background stream already closes on its session's whole output, while each `query` hands over only what is new.

The meta carries the exit code the observations give the command:
- −1 for a command the window killed, as for a running command it kills;
- none for a command that never ran, ended the shell, or was ended by the agent's reset;
- its own status when it ended on its own frame;
- −1 when an interrupt left it no status of its own (OQ-147).

The observation that follows ends nothing. Where nothing closed the stream first, a poll that hands such a command over closes it with the same text and code. A poll that hands over no command closes no stream. Every observation reads as built, and OQ-164's ruling (R-071) stands word for word.

The bundle review's two findings are ruled with it:
- **An agent's `is_input` waits for the restore** that a window's kill of a soft-paused command started (`session.settled()`), as an explicit reset already does. REQ-TOOLS-098's own advice ("interrupt with `C-c` and `is_input=true`") can then no longer cut that round trip. Reasoned from the code, a cut restore reads `failed` after `SNAPSHOT_TIMEOUT_MS` (15 s) and holds the next call that long.
- **A kill that lands during the first call's handshake carries no exit code.** Its command never ran, as its own error says. This matches three readings:
  - the call that waited behind a killed soft-paused command (since 2026-10-21);
  - OQ-164's ruling on a line that never ran;
  - [`PD-TOOLS-013`](../../../product/directives/pd-tools-013.md#pd-tools-013) on a cancel at the same point.

  OQ-144's parenthetical "(−1, `session_reset`, "killed from the terminal window")" is revised in place beside the struck reading, as OQ-226 revised the cancel beside it. R-071's ruled behaviour for a replaced or ended shell stands.

This builds REQ-SHELL-091, REQ-SHELL-087, REQ-TOOLS-127 and REQ-TOOLS-128 as written. It departs from none of them and mints nothing:
- **REQ-SHELL-091** binds the window "once the process exits", and the window learns of the exit only from the stream's meta. As built, a command the user had just killed read "running" until the agent observed again, with nothing to bound the wait. All four controls stayed live: an armed user's keys were written to the agent's fresh shell, and Interrupt went into the restore's round trip.
- **REQ-TOOLS-127** fixes the closing frame's text and its exit code, not its instant. The frame now comes after the process has exited, the instant that requirement names. Its "rather than on a partial capture" excludes the since-poll text on which the build closed a polled command's stream. A command silent since its soft pause, such as a server waiting for requests, closed on an empty replacement. REQ-SHELL-091's banner above it said "The output stays readable and copyable".
- **REQ-TOOLS-128**'s running flag says whether the command runs.

A dated note beneath REQ-TOOLS-127 records this reading, in the form [OQ-364](66-spikes-and-later-questions-33.md#oq-364) used.

**Corrections to the entry.**
- (b)'s cost "a later poll's text could differ from it by what arrived between" is false. `resetNow` closes every open paused call and clears the tap's region, and `onData` feeds only open calls. A killed command's text is fixed at the kill, and a command closed by its own frame is fixed at that frame.
- (b)'s "exit −1" does not hold for a queued command that never ran, which has none.
- "Only that observation ends the stream" is false of the call path. A call issued after the kill re-opened the stream for its own command, and nothing closed it for the command killed.
- (a)'s cost "a model turn, or longer" has no bound. The stream stayed open until the agent's next poll or call. Where none came, it stayed open until another session's stream cleared it (REQ-SHELL-111) or the run host exited; nothing else ended a foreground stream.
- (b) named both "the paused command's screen so far" and "the text the next poll hands over". The two differ, and the ruling takes the first.
- Found while ruling: the agent's `reset` with an empty command ended a soft-paused command and left its stream running. The next poll found no paused command and closed that stream with exit 0 over an empty screen.

**Noticed while ruling and recorded, not repaired.** The window's Interrupt, send-keys and End input still reach a kill's restore round trip wherever the stream reads running over it:
- on a running command's kill, until the killed call returns;
- after a paused command's kill, once the agent's next call has re-opened the stream while the session's queue holds that call behind the restore.

The two recommendations weighed, and the ruling followed **A**:
- **Advocate A (the user's lens)** recommended (c), refined:
  - the stream ends when the session closes the command while no later call holds it;
  - it closes with the next observation's exit code and text, taken once and reused;
  - a guard stops a late close from ending a re-opened stream;
  - `is_input` waits behind `settled()`;
  - the handshake kill carries no exit code.

  The ruling took A's option and its guards, A's reading of REQ-SHELL-091 and the hazards of the interval, and A's disposition of both findings.
- **Advocate B (the system's lens)** recommended (b), with the same exit-code refinement and the same `is_input` repair. B would record the self-ended case as a defect for its own round and raise the handshake's −1 as OQ-371. The ruling took four things from B:
  - B's tests: the closing frame against the next poll and against the next call's report, the call path's re-opening, and the queued command's missing code;
  - B's corrections of the entry;
  - B's finding that only an observation's end and the background path ever ended a stream;
  - B's point that the closing text must be read from what the observation hands over, without drift.

  The ruling did not defer (c). The own-frame and shell-exit closes are records the session already keeps, and the block's real-PTY cases exercise them on both shells. Every end the session cannot see stays as built.

  It did not raise OQ-371. The consortium was asked to weigh the finding, both advocates confirmed it in the tree, and neither defended −1. OQ-226 is the precedent for revising that paragraph's passing description.
- **Both advocates** read the closing text as the next poll's own output and recorded the tail it leaves as inherited. The ruling departs from both on this point and takes the entry's "screen so far". With the close moved to the user's Kill, a since-poll text would blank a silent command's screen at that gesture.

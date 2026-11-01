# Archived open questions — Spikes, and the questions raised since (5 of 35)

The ruled, closed, resolved and withdrawn entries of [part 38](../../../architecture/open-questions/38-spikes-and-later-questions-5.md) of the [open-questions record](../../../architecture/open-questions.md), each moved here whole, under its own anchor, by `pnpm archive:migrate` (`tools/archive/migrate.mjs`); the part keeps one index line for each. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="oq-164"></a>

**OQ-164 — What does a foreground call made while an earlier command is soft-paused do, and what does it report of that
command?** *(REQ-TOOLS-098, under which a soft-paused call returns −1 "while its process keeps running" and the
observation explains "that the agent can poll with an empty `command` or interrupt with `C-c` and `is_input=true`";
REQ-TOOLS-187, "a second foreground call against a session whose previous foreground command has not returned waits for
it"; REQ-TOOLS-096, the empty-command poll; REQ-TOOLS-097, the no-output window and the hard timeout; REQ-TOOLS-179, the
exit status a call reports; OQ-147, what the paused call reports once a poll hands it over. Raised 2026-10-01 from the
live-run autopsy at 71ad8e8 finding a71-8,
[`a-call-made-while-a-command-is-soft-paused-waits-behind-it-unannounced.md`](../../../defects/fixed/a-call-made-while-a-command-is-soft-paused-waits-behind-it-unannounced.md).
~~Open.~~ Ruled 2026-10-06. Raised as OQ-163 on its branch and renumbered OQ-164 before it reached `main`, where OQ-160 had been taken
meanwhile.)*

*(Measured on PowerShell 2026-10-15, Windows 11 ARM64, pwsh 7.6.6 and 5.1, three runs each: the two real-PTY OQ-164 cases ran green in every run of the suite, and a paused command that ends behind the next call reports its own status, 1, its output and its error text handed over as earlier output; after C-c the next calls report the paused command's end once, with no status of its own. A line written in the same tick as a C-c is discarded by PowerShell — [recorded](../../../defects/on-windows-a-command-written-in-the-same-tick-as-a-c-c-is-swallowed.md).)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** the current behaviour is the rule. A foreground call made while an earlier command is soft-paused is neither refused nor made to interrupt it: its line is submitted at once and waits behind the paused command, and its no-output window and timeout run from its own start, the wait included. Its observation reports the paused command beside its own outcome, as the reading above states: that it waited, when and how that command ended, and what it wrote since it was last observed, outside the cap on the call's own output; a second soft pause no longer disposes of the first. The tool description tells agents the third move: "a new command issued meanwhile waits behind it, and its result reports how the paused one ended". REQ-TOOLS-187 does not reach a soft-paused call, which has returned, so this ruling settles it; [`a-call-made-while-a-command-is-soft-paused-waits-behind-it-unannounced.md`](../../../defects/fixed/a-call-made-while-a-command-is-soft-paused-waits-behind-it-unannounced.md) closes with it.

REQ-TOOLS-098 offers the agent two moves after a soft pause: poll, or interrupt. A third, issuing a new command, is
always open, and no requirement says what it does. REQ-TOOLS-187 makes a second foreground call wait for a previous
command that "has not returned". A soft-paused call has returned while its command has not finished, so the requirement
does not settle these points:

- whether the new call waits;
- whether that wait counts against its own no-output window and timeout;
- whether its observation says that it waited, and for what;
- whether it carries the paused command's end.

In the default live run's `terminal` scenario `node -e "setTimeout(…, 45000)"` (#5) soft-paused at 30.0 s. After one poll
(#6), the agent issued a `node -e "console.log(…)"` (#7). That call took 5,932 ms, ending when the 45 s timer ran out,
and its observation said only "The command exited with code 0." The paused command's own end was held for a poll that
never came.

~~**What the build proceeds under.** The new call's line is submitted at once, and the shell queues it behind the paused
command (`ForegroundSession.execute`). Its no-output window and its timeout run from its own start, so they include the
wait. Its observation states its own outcome and nothing of the paused command. The paused command's share of the stream
ends at its own end frame or at the new call's start marker, and its end is kept for the next empty poll (`pausedDone`,
`poll`). The code also shows a case the run did not reach. A later soft pause, including the new call's own when the
paused command stays silent for its whole no-output window, replaces the kept call, and that call's end is never
reported.~~ *(Superseded 2026-10-01 by the reading below. That reading was built by the partial repair of
[`a-call-made-while-a-command-is-soft-paused-waits-behind-it-unannounced.md`](../../../defects/fixed/a-call-made-while-a-command-is-soft-paused-waits-behind-it-unannounced.md),
which fixes only the loss and the silence. The question stays open, and none of its four points is ruled.)*

**What the build proceeds under** (since 2026-10-01). The new call is still neither refused nor made to interrupt the paused
command. Its line is submitted at once and the shell queues it. Its no-output window and its timeout still run from its
own start, so they include the wait. What changed is what it reports, so that no paused command's end is lost or left
for a poll nobody is prompted to make:
- **The new call's observation reports the paused command beside its own outcome** (`ForegroundResult.earlier`,
  `earlierSentence` in `terminal/index.ts`). The detail opens with one sentence per paused command. A command the call
  waited behind gets "This command was submitted while the soft-paused command `…` was still running, and waited behind
  it: that command ended N seconds after this command was submitted, with exit code X". A command that had ended before
  the call and was never polled gets "… had ended N seconds before this command was submitted, with exit code X, and no
  poll had reported it". The end is the paused command's own status. It is OQ-147's "no exit status of its own" when an
  interrupt made the shell abandon its line, "by ending the session's shell" for OQ-144's shell-exit case, and "when the
  terminal session was reset" when the new call's own timeout, cancel or kill reset the session under it. What the paused
  command wrote since it was last observed follows the detail, ahead of the call's own output section, which is
  unchanged. The new call's exit code, outcome and classification are its own. The paused command is handed over there,
  so a poll after finds nothing to poll.
- **A second soft pause no longer disposes of the first** (`pausedAhead`, `pausedEnded` in `foreground.ts`). A new call
  that soft-pauses while the paused command is still running has not started yet. Its observation says so ("… that
  command is still running: the shell has not started this command yet, and runs it once that command ends"), and it
  carries none of the earlier command's output as its own. The earlier call is kept ahead of it, still fed its share of
  the stream, and the next observation reports its end: the poll ("… ahead of the polled one ended N seconds ago, with
  exit code X") or a later call.
  ~~It carries none of the earlier command's output as its own.~~ *(False of the first build, found by its verification
  on 2026-10-01: true of the pause's own return only. A poll of the queued call before the shell had started it handed
  the earlier command's output over as the queued command's own, beside the same text in the earlier command's report.)*
  Nothing before the queued call's own printed start marker is its own now, on its pause, its polls, or any other outcome
  (`unstartedShare` and `PausedCall.started` in `foreground.ts`; `CommandRegion.started` for a call still waiting). A
  poll before the shell has started it hands over no output of its own, and its hold takes no byte before that marker.
- ~~**An interrupt reaches the oldest open paused call**, the line the shell is running. That call is closed at the next
  line's start marker, as OQ-147's reading already closes it.~~ *(False of the first build, found by its verification
  on 2026-10-01. An interrupt makes the terminal discard every line the shell has not read yet, so a line queued
  behind the interrupted one never runs and its start marker never prints. The interrupted call was closed only by the
  next call's END frame, cut at a marker that never appeared, and the next call carried its own start marker, output and
  end frame as the paused command's. The queued call read as abandoned by the shell, and both as having made the next
  call wait. A poll after the interrupt looked for the end only of the polled call, which was queued behind the
  interrupted one, so it wrote nothing and read "still running" over a dead command.)*
  **An interrupt reaches the oldest open paused call**, the line the shell is running, and the terminal discards every
  line queued behind it:
  - A paused call closes at the printed start marker of ANY line written after it, whichever prints first
    (`pausedShare`), and its capture is cut at that marker.
  - A paused call whose own start marker never printed when a later line's did never ran, and is reported so, with no exit
    code: "… never ran, so it has no exit code: its line was gone before the shell reached it (an interrupt (C-c)
    discards a line the shell has not read yet, and a command that reads its input takes it)". Its poll is an
    `execution_error` saying the same.
  - ~~A poll after the interrupt looks at every open paused call. When any is interrupted, its no-op line (OQ-147) goes
    after all of them, so its printed marker closes them all.~~ *(False of the second build, found by its verification
    on 2026-10-01: the interrupt marked the oldest open paused call alone. A command that handles or ignores SIGINT
    (`trap '' INT`, a graceful-shutdown handler) ends on its own frame after the interrupt, and its call closes with
    its own status. The queued call, whose line the same interrupt discarded, was then the only open paused call and
    was unmarked, so no poll wrote a no-op line, and every poll read it "still running" over an idle prompt until the
    next command.)*
    The interrupt marks every open paused call, since it discards every line queued behind the one the shell is running
    (`noteInterrupt`). A poll after it looks at every open paused call; when any is marked, its no-op line (OQ-147) goes
    after all of them, so its printed marker closes whichever are still open, whether the interrupted command died of
    the interrupt or ended on its own.
  - A call that was waiting behind the paused command when the terminal window's interrupt (REQ-SHELL-093) came is
    discarded the same way. It looks for the end of the line ahead of it as a running call does (OQ-147), and ends at once
    as never run, with no reset.
  - A call submitted after the interrupt is not said to have waited. Its detail says that an interrupt had been sent
    before it was submitted, how the paused command ended, and that the shell was past that line when it started this
    command, N seconds after it was submitted.
  - Without an interrupt, a line queued behind a paused command can still go unrun: a paused command that reads its
    input takes the queued line, and ends on its own frame. Its call closes with its own status. The queued call's
    start marker never prints, and nothing tells the product the shell is past that line until a later line's marker
    prints, so it reads "still running" until the next command, which reports it as never run. The poll writes no
    no-op line there, since with no interrupt sent it cannot tell a line the command took from one the shell is about to
    read, and a no-op line written into a command still reading its input is OQ-168's hazard. This was so before the
    repair too; it is stated here, not built.
- **A queued call that the session's reset or the shell's end closes before its line ran** is reported in the never-ran
  form: "… never ran, so it has no exit code: the terminal session was reset before its shell reached that line", or
  "… the session's shell was gone before it reached that line" (`reset-before` and `never-ran` in `PausedEnd`).
  ~~"This command was submitted while the soft-paused command `…` was still running, and waited behind it: that command
  ended N seconds after …, without having run, the session's shell being gone before it".~~ *(False of the second build,
  found by its verification on 2026-10-01: it called a command that never ran "still running", and blamed the shell
  where the session's reset had ended it.)*
- **What is carried of a paused command is not counted in REQ-TOOLS-097's 100,000-character cap** on the call's own
  output. It is bounded by the paused call's own screen, `FOREGROUND_SCREEN_LINES` rows at the session's width, once per
  paused command reported. The cap is applied to the call's own output section alone. Whether a call's whole observation
  should share one cap is part of this question.
- **The tool description states the third move** beside REQ-TOOLS-098's two: "a new command issued meanwhile waits behind
  it, and its result reports how the paused one ended".

The cases "REQ-TOOLS-098/179 (OQ-164): a command issued behind a still-running soft-paused one …" and "… a paused command
that ended unpolled is reported by the next command, and a second soft pause no longer loses the first one's end" in
`terminal/terminal.test.ts` pin this reading. Both are red on the code before it. The verification's three findings are
pinned by four real-PTY cases, each red on the first build: "… after C-c, a soft pause queued behind the interrupted one
never ran …", "… a poll after C-c with a soft pause queued behind the interrupted one reads both as ended …", "… a poll
of a soft pause the shell has not started yet hands over nothing of the earlier command's as its own", and "… the
window's interrupt while a call waits behind a soft-paused command ends that call as never run …". The pure case "…
a paused call's share ends at the first later line's printed marker …" pins the cut over every two-chunk split. The case
"… a soft-paused command that ends the shell ends a call waiting behind it as never run …" pins OQ-144's shell-exit case
in this arrangement. The second verification's finding is pinned by "… after C-c, a command that survives the interrupt
ends with its own status, and the soft pause queued behind it reads never run on the next poll", and the reset's sentence
by "… a soft pause queued behind a running one that a reset closes is reported as never run, by the reset"; both are red
on the code before them. Five A10 cases that read the paused
command's end from a poll after the next call now read it from the next call's report. Each keeps its assertion: the
paused command's own status, nothing of the later calls, the echo or the end frames in what is carried of it, and no
marker anywhere.

**What a ruling decides.** Whether a call made while a command is soft-paused is refused with the remedy REQ-TOOLS-098
names, waits as REQ-TOOLS-187 has a second call wait (and if so, whether the wait counts against the new call's window
and timeout), or interrupts the paused command. And whether the new call's observation says that it waited behind the
paused command and carries that command's end, meaning its output since the last poll and its exit status, rather than
leaving it to a poll. *(Unchanged by the 2026-10-01 build: the report it carries is the reading above, not a ruling on the last point.)*

<a id="oq-165"></a>

**OQ-165 — What is the optimistic `cancelling` of the run's cancel: where is it shown, and until when?** *(REQ-MONITOR-127,
"On confirmation the session status is optimistically set to `cancelling` … Given a refusal, the status is restored to
`running`"; REQ-MONITOR-296, "eventually be overwritten by the authoritative final read"; REQ-MONITOR-130, "whichever surface
asked for it"; REQ-MONITOR-126; `PD-ORCH-005` clauses 3 and 15, which make every confirmed "Cancel the run?" the explicit,
final cancel; OQ-129, the same question for one agent's cancel. Raised 2026-10-01 under [R-067](../../../product/requests.md#r-067)
by the repair of
[`the-mission-view-and-a-persona-window-do-not-show-a-confirmed-run-cancel-as-cancelling.md`](../../../defects/fixed/the-mission-view-and-a-persona-window-do-not-show-a-confirmed-run-cancel-as-cancelling.md),
acceptance finding A35. Raised on its branch as OQ-158 and renumbered OQ-165 at the merge, origin/main's OQ-158 keeping its
number. ~~Open.~~ Ruled 2026-10-06.)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** the engine saves `cancelling` when it accepts
the explicit run cancel, as the stop already does, and the window's own optimistic display hands over to that saved status.
Read with it: the saved `cancelling` holds until the teardown writes the run's end, a later save of the run on the way there
keeping it (over a pause accepted before it, the cancel being final); the overlay ends at the first record of the session
reading `cancelling`, as it ends at a record at rest, so a lagging reader's earlier record stays covered; a refusal still
restores the record's own status. The requirements leave the engine's write open, so no directive is minted. Built the same
day (`Run.cancelAgent` and `saveRunning`'s `cancelSaved` in `packages/engine/src/run/run.ts`; `witness` in
`packages/ui/src/cancel-overlay.ts`; cases in `run/turn.test.ts` and `cancel-overlay.test.ts`). Found beside it: a stop's own
saved `cancelling` reads `running` again at the run's next save
([`a-stops-saved-cancelling-reads-running-again-at-the-runs-next-save.md`](../../../defects/fixed/a-stops-saved-cancelling-reads-running-again-at-the-runs-next-save.md)),
recorded and not repaired; repaired 2026-10-06 by fin22 on this ruling's reading: the stop's `cancelling` is saved through
the run (`Run.stopAccepted`) and held by its later saves until it rests, as the explicit cancel's is.
*In the built app, 2026-10-13 (fin42, whats-next N61):* `composer-proof`'s launch 4b presses the composer's own "Stop run"
during a 20 s scripted model call, changes the permission mode through its chip while the graceful stop waits, and reads
the run-state label "Cancelling…" (the control "Force stop") before and after the mode change; the run ended `user_cancelled`
and rested `paused`. With `Run.stopAccepted`'s hold replaced by the old unheld save, the same launch read "Run active" after
the mode change and went red. Read from the window's label, not from the session row mid-stop.

The requirement sets an optimistic status and its rollback. It does not say what overwrites it, and the engine gives it
nothing to be overwritten by: the explicit cancel (the reserved run id's `cancelAgent`, `Run.cancelAgent`) raises the final
stop in memory and writes the cancel's durable mark, but writes no `cancelling` status. The session's records keep reading
`running` (or `waiting`) through the graceful stop, up to REQ-MONITOR-129's 30 seconds, until the teardown writes the run's
end. Only the stop (`op: 'cancel'`) writes `cancelling`, and a stop is not a cancel (`PD-ORCH-005` clause 3). Shown until
"the next authoritative read", as OQ-129's one-agent cancel is, the run would read `Cancelling` for one record interval and
`Running` again for the rest of the graceful stop.

**What the build proceeds under** (`packages/ui/src/cancel-overlay.ts`, `beginRun`, written by the renderer's `cancelRun`):
- **Where.** Every confirmed "Cancel the run?" goes through the renderer's `cancelRun` — the Workspace's run header and wait
  header, the Mission view's "Cancel selection" on the run row, a persona window's Cancel on the run's own instance — and
  each surface of that window reads the session through the overlay. The session's status is shown `cancelling` there: the
  run header and the composer (`Cancelling…`), the status strip, the Mission view's subtitle and run row (`Cancelling`), and
  a persona window. As with OQ-129, only the window that sent the cancel shows it before the engine's record does; no agent
  is shown cancelled by it, since the engine settles them in the teardown.
  *Corrected 2026-10-01, at the second verification: "and a persona window" was false as first built. The window draws
  the run's own instance through the agent vocabulary (`PRESENTATION_CHILD_STATES`), which has no `cancelling`;
  `runLevelAgent` presents every busy status as `running`, and the window reads no session status of its own, so it read
  `running` throughout.* The word it now draws is a reading: the run-level agent is the run (REQ-MONITOR-043), so while it
  is live and the shown session reads `cancelling` its state label and tab tooltip read the run's status, `cancelling`,
  REQ-NOTIFY-048's member, rather than a word minted for the agent vocabulary (`agentStateLabel`); its dot keeps the live
  `running` motion (REQ-SHELL-075 (a): it pulses while the instance is live). A child keeps the agent vocabulary. ~~The
  inspector's meta line does not read it yet~~ *Reached 2026-10-01: the inspector's meta line starts with the same word
  (`metaLine` reads `agentStateLabel` over the shown session), so with the run-level agent shown it reads `cancelling · …`
  beside the run header's `Cancelling…`; its dot keeps the live `running` motion
  ([`the-inspector-meta-line-reads-the-run-level-agent-running-while-the-run-is-cancelling.md`](../../../defects/fixed/the-inspector-meta-line-reads-the-run-level-agent-running-while-the-run-is-cancelling.md)).
  The reading is the build's and the question stays open.*
- **Until when.** From the confirmation, over every active record of the run it was confirmed against, answered or not,
  until the session's first record at rest taken after the confirmation; the overlay covers no record taken after that one,
  so a later run of the session is never shown cancelling by it. A refusal removes it, and the record's own status shows
  again. "The authoritative final read" is read as that final record, not the next record, because the next one is still
  `running`.
  *Corrected 2026-10-01, at the verification of the repair: the first build keyed the overlay on the run's `runStartedAt`
  alone and claimed it "never covers a later run of the session". That was false. The engine saves a new run `starting`
  (`packages/engine/src/run/run.ts`, `start`) before it writes that run's `run_started_at` after the pre-flight
  (`saveRunning`), and the store keeps the column by `coalesce` (`packages/store/src/dal.ts`, `updateSessionRun`), so a
  follow-up's or a continue's pre-flight records carry the cancelled run's key and are active: the next run read
  `Cancelling` through its whole pre-flight and the composer refused input. The overlay now ends at the run's record at
  rest, by the order the window took its records in (`witness`), and a record taken after the confirmation and before the
  rest is covered whatever key it carries, since a session runs one run at a time.*
  A record of another session ends it too: the window has followed away and will not take that run's final read, and on
  its return a run started meanwhile would be covered by order alone. It is then shown as the engine writes it, as a
  window that never confirmed the cancel shows it.
- **The status a refusal restores.** REQ-MONITOR-127 says "restored to `running`". The build shows the record's own
  status again, which is `running` unless the run is in a quota wait (`waiting`) or its pre-flight (`starting`); the
  requirement's word is read as "the status before the confirmation", which those records are.
- **A run with no `runStartedAt`.** `beginRun` lays nothing over a record that carries no `runStartedAt` — a session's first
  run in its pre-flight. The run-level agent is null without it (`runLevelAgent`), so the inspector, the Mission view's
  run row and a persona window offer no run cancel then; the Workspace's wait header would, if a quota wait came before
  the key is written, and its cancel would then be sent with nothing shown — not observed, and stated as the guard's one
  gap. A follow-up's pre-flight carries the previous run's key and is covered.

**What a ruling decides.** Whether the engine should write `cancelling` when it accepts the explicit cancel, as the stop
does, so the authoritative record agrees with the optimistic one and every window shows it, not only the one that sent it;
and, if so, whether the overlay then yields to the next record as OQ-129's does. Recommendation: the engine writes it, because
REQ-MONITOR-130 asks for identical observable state from every surface, and another window shows the run `Running` until
the run's end today.

<a id="oq-166"></a>

**OQ-166 — Does PD-CHAT-003's cost paragraph still describe the pool's capacity arithmetic?** *(PD-CHAT-003, "Why, and what
it costs": "the recycled pool's capacity arithmetic (`ROW_MIN_HEIGHT` in `packages/ui/src/transcript/constants.ts`) keeps
the 30 px figure as a conservative slot-size floor while real rows may be shorter"; REQ-CHAT-057's 30 px minimum row height,
which the directive narrows off the row's box; REQ-CHAT-165; ADR-0045's capacity rule. Raised 2026-10-01 under
[R-067](../../../product/requests.md#r-067) by the repair of
[`the-pool-capacity-assumes-no-row-is-shorter-than-thirty-pixels.md`](../../../defects/fixed/the-pool-capacity-assumes-no-row-is-shorter-than-thirty-pixels.md),
acceptance finding A38. ~~Open.~~ Ruled 2026-10-06.)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** [`PD-CHAT-003`](../../../product/directives/pd-chat-003.md#pd-chat-003) gains a short dated revision 2 whose cost paragraph names the capacity unit, the shortest row a slot can hold (20 px, `SHORTEST_ROW_HEIGHT`), with the 30 px figure the floor of a row's estimate before its first measurement; the sentence it replaces is quoted beside it. The code is left as it is.

PD-CHAT-003's normative clauses — a row sizes to its content, 12 px above a block and at most 4 px within one, no row drawn
so tightly that its lines touch — are untouched by the repair. Its cost paragraph is not normative but it is specific: it
says the pool's capacity arithmetic keeps the 30 px figure. For capacity that figure was the opposite of conservative — a
unit taller than the shortest row binds fewer slots than a tall viewport of such rows shows — and the repair counts the
pool in `SHORTEST_ROW_HEIGHT`, 20 px, the shortest a row's slot holds. `ROW_MIN_HEIGHT` is still 30 px and is still a
floor, of the estimate a row is positioned by before its first measurement, which is the other half of the paragraph's
"slot-size floor".

**What the build proceeds under.** The paragraph as a description of the cost when the directive was made, not as a
constraint on the capacity unit: the capacity counts in 20 px, the estimate's floor stays 30 px, and the directive's text
is not edited (a directive is the owner's).

**What a ruling decides.** Whether PD-CHAT-003 gains a revision whose cost paragraph names the capacity unit as the
shortest row a slot can hold, or the paragraph stands as written of its date.
